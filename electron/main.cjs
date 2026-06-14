/**
 * ffxiv-live-map — Electron shell.
 *
 * This is the desktop wrapper: on launch it brings up the daemon itself and
 * shows the existing Leaflet map in a normal window instead of a browser tab.
 *
 * Browse-first: the daemon starts in browse mode and serves the map immediately
 * with no packet capture, so the app is useful even when FFXIV isn't running
 * (e.g. you're playing on PS5). The Deucalion bridge is started only while the
 * game is up and stopped when it exits — so launching without the game no longer
 * dead-ends on a "bridge never came up" error. The daemon's own game monitor
 * attaches/detaches capture in lockstep.
 *
 * Overlay mode (View menu / ⌘⇧O) re-opens that same UI in a transparent,
 * frameless, always-on-top window that floats over the game. Its opacity is a
 * window property, so the renderer's sliders set it over IPC (preload.cjs); the
 * window fades to the user's "unfocused" opacity on blur and back on focus.
 *
 * CommonJS on purpose: the package is "type": "module", but Electron's main
 * entry is simplest and most portable as .cjs. The daemon (ESM) runs unchanged
 * as a child process, so nothing in src/ has to change.
 *
 * Run: npm run app   (no prereqs — runs in browse mode; start FFXIV + Teamcraft
 * with Packet Capture for live position)
 */

const { app, BrowserWindow, Menu, globalShortcut, ipcMain, screen, dialog, shell } = require("electron");
const { spawn, execFile } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { placementPosition } = require("./placement.cjs");

const ROOT = path.join(__dirname, "..");
// Packaged (asar:false): app files live in Resources/app/, so ROOT/scripts and
// the ESM daemon load as plain files. Derived data ships read-only in
// Resources/data; writable runtime state (.state.json, custom-markers.json) goes
// to userData since the app bundle is read-only.
const PACKAGED = app.isPackaged;
const DATA_DIR = PACKAGED ? path.join(process.resourcesPath, "data") : path.join(ROOT, "data");
// app.getPath("userData") is only reliable after the app is ready, so resolve
// STATE_DIR lazily — startStack (its only caller) runs inside app.whenReady().
const stateDir = () => (PACKAGED ? app.getPath("userData") : ROOT);
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 31595);
const HTTP_PORT = Number(process.env.HTTP_PORT || 8787);
const URL = `http://localhost:${HTTP_PORT}`;

let bridge = null;
let daemon = null;
let win = null;
let overlay = null;   // the transparent always-on-top overlay window, when shown
let gameWatch = null; // interval that keeps the bridge in lockstep with the game
let quitting = false; // set during teardown so child 'exit' handlers don't treat it as a crash

// Overlay opacity/config, persisted to userData so it survives restarts. Opacities
// are fractions in [0,1] (Electron's setOpacity); the renderer's sliders send these.
// placement: "center" | one of the 4 corners (recomputed from the work area each
// launch) | "free" (the user dragged it — remember the exact `bounds` instead).
const DEFAULT_OVERLAY = { focused: 1, unfocused: 0.55, passthrough: false, placement: "center", bounds: null };
const PLACEMENTS = ["top-left", "top-right", "bottom-left", "bottom-right", "center", "free"];
let overlayCfg = { ...DEFAULT_OVERLAY };
const overlayConfigFile = () => path.join(stateDir(), "overlay-config.json");
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

function loadOverlayConfig() {
	try { overlayCfg = { ...DEFAULT_OVERLAY, ...JSON.parse(fs.readFileSync(overlayConfigFile(), "utf-8")) }; }
	catch { overlayCfg = { ...DEFAULT_OVERLAY }; }
}
function saveOverlayConfig() {
	try { fs.writeFileSync(overlayConfigFile(), JSON.stringify(overlayCfg)); }
	catch (e) { console.warn("[app] overlay config save failed:", e.message); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tcpListening(port) {
	return new Promise((resolve) => {
		const sock = net.connect({ host: "127.0.0.1", port }, () => { sock.destroy(); resolve(true); });
		sock.on("error", () => resolve(false));
		sock.setTimeout(800, () => { sock.destroy(); resolve(false); });
	});
}

function httpOk(url) {
	return new Promise((resolve) => {
		const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode === 200); });
		req.on("error", () => resolve(false));
		req.setTimeout(800, () => { req.destroy(); resolve(false); });
	});
}

async function waitFor(check, { tries = 60, gap = 500 } = {}) {
	for (let i = 0; i < tries; i++) {
		if (await check()) return true;
		await sleep(gap);
	}
	return false;
}

// FFXIV runs under Wine on macOS as ffxiv_dx11.exe. The bridge needs the game
// (Wine + Teamcraft's Deucalion injection), so we tie the bridge's lifecycle to
// the game's presence — no game means browse mode, no bridge, no error dialog.
function gameRunning() {
	return new Promise((resolve) => {
		// execFile (no shell) — exit 0 with output = running; anything else (no
		// match, or pgrep absent on non-macOS) = not running.
		execFile("pgrep", ["-f", "ffxiv_dx11.exe"], (err, stdout) => resolve(!err && stdout.trim().length > 0));
	});
}

function startBridge() {
	// macOS-only: start-bridge.sh hardcodes the XIV-on-Mac Wine paths. No-op if one
	// is already tracked or we're off darwin.
	if (bridge || process.platform !== "darwin") return;
	// detached: the bash wrapper respawns `wine` in a loop, so it must lead its own
	// process group — that's how killStack()/stopBridge() take the whole tree
	// (bash + wine) down via a negative-PID signal instead of orphaning wine.
	// Absolute /bin/bash + script path: a Finder-launched .app has a minimal PATH.
	const child = spawn("/bin/bash", [path.join(ROOT, "scripts/start-bridge.sh"), String(BRIDGE_PORT)], { cwd: ROOT, stdio: "inherit", detached: true });
	bridge = child;
	child.on("error", (err) => { console.error(`[app] bridge spawn failed: ${err.message}`); });
	child.on("exit", (code) => {
		console.log(`[app] bridge exited (${code})`);
		// Clear only if it's still the current handle — a late exit from a bridge we
		// already replaced must not null out the new one.
		if (bridge === child) bridge = null;
	});
}

function stopBridge() {
	if (!bridge) return;
	try {
		// A bridge that failed to spawn (or already exited) can have an undefined
		// pid; process.kill(-NaN) throws and would crash the main process.
		if (process.platform === "darwin" && typeof bridge.pid === "number") {
			process.kill(-bridge.pid, "SIGTERM"); // whole group (bash + wine)
		} else {
			bridge.kill();
		}
	} catch { /* already gone */ }
	bridge = null;
}

// Keep the bridge in sync with the game: start it when FFXIV is up (so the
// daemon's game monitor can attach capture), stop ours when the game exits. We
// never touch a bridge we didn't spawn (e.g. one from start-bridge.sh). Guarded
// against overlap since the poll fires every few seconds and this awaits.
let syncing = false;
async function syncBridgeToGame() {
	if (syncing) return;
	syncing = true;
	try {
		const running = await gameRunning();
		if (running && !bridge && !(await tcpListening(BRIDGE_PORT))) {
			console.log("[app] FFXIV detected — starting the Deucalion bridge.");
			startBridge();
		} else if (!running && bridge) {
			console.log("[app] FFXIV not running — stopping the bridge (browse mode).");
			stopBridge();
		}
	} finally {
		syncing = false;
	}
}

function startGameWatch() {
	if (gameWatch) return;
	gameWatch = setInterval(() => { syncBridgeToGame().catch(() => {}); }, 4000);
}

async function startStack() {
	// In Electron's main process `process.execPath` is the Electron binary, not
	// node — so to run our node scripts as children we set ELECTRON_RUN_AS_NODE,
	// which makes that same binary behave as a plain Node runtime. (Without it,
	// each spawn launches another Electron app instead.) The flag propagates to
	// grandchildren via the inherited env, so ensure-data's build scripts run as
	// node too.
	const nodeEnv = {
		...process.env,
		ELECTRON_RUN_AS_NODE: "1",
		FFXIV_DATA_DIR: DATA_DIR,   // daemon + coords read derived data here
		FFXIV_STATE_DIR: stateDir(), // resolved here, after app ready — daemon writes .state.json / custom-markers.json here
	};
	if (PACKAGED) nodeEnv.NODE_ENV = "production"; // serve the minified /dist bundle

	// 1. Build bundled data on first run (dev only — the packaged app ships a
	// prebuilt, read-only data/ in Resources). Spawn async, not spawnSync: the
	// first build can take ~20s and a synchronous call would block Electron's
	// main-process event loop the whole time (risking an OS "not responding").
	if (!PACKAGED) {
		await new Promise((resolve, reject) => {
			const ed = spawn(process.execPath, ["scripts/ensure-data.mjs"], { cwd: ROOT, stdio: "inherit", env: nodeEnv });
			ed.on("error", reject); // spawn itself failed (binary missing, EACCES, …)
			ed.on("exit", (code) => {
				if (code === 0) resolve();
				else reject(new Error("data build failed (scripts/ensure-data.mjs)."));
			});
		});
	}

	// 2. Daemon first, in browse mode. It serves the map immediately with no
	// bridge, so the app is usable even when FFXIV isn't running (e.g. playing on
	// PS5). The daemon's own game monitor attaches/detaches packet capture as the
	// game starts/stops; the bridge is kept in lockstep in step 3. Reuse one
	// already serving (e.g. a running `npm start`) rather than spawning a second.
	if (await httpOk(`${URL}/maps`)) {
		console.log(`[app] reusing daemon already serving on ${URL}`);
	} else {
		daemon = spawn(process.execPath, [path.join(ROOT, "src/daemon.mjs"), "--browse", "--bridge-port", String(BRIDGE_PORT), "--http-port", String(HTTP_PORT)], { cwd: ROOT, stdio: "inherit", env: nodeEnv });
		daemon.on("exit", (code) => {
			console.log(`[app] daemon exited (${code})`);
			// A crash after startup (port conflict, runtime error) would otherwise
			// leave the window open over a dead backend. A null code means we killed
			// it on quit (signal), so surface only genuine crashes — and not while
			// we're already tearing down.
			if (!quitting && code !== 0 && code !== null) {
				dialog.showErrorBox("FFXIV Live Map — daemon stopped", `The map daemon exited unexpectedly (code ${code}).`);
				app.quit();
			}
		});
		if (!(await waitFor(() => httpOk(`${URL}/maps`)))) {
			throw new Error(`The daemon did not start serving on ${URL}.`);
		}
	}

	// 3. Bridge follows the game. Start it now if FFXIV is already up, then poll to
	// track it starting/stopping. No "bridge never came up" timeout any more —
	// without the game we simply stay in browse mode.
	await syncBridgeToGame();
	startGameWatch();
}

// Shared hardening for any window that loads our localhost UI: deny in-app popups
// (open external http(s) links — GarlandTools, Teamcraft, wiki — in the real
// browser, refuse everything else), and bounce off-localhost top-level
// navigations out to the browser, so a compromised page can't load another
// origin/protocol inside a privileged window.
function wireWindowNav(w) {
	w.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url)) shell.openExternal(url);
		return { action: "deny" };
	});
	w.webContents.on("will-navigate", (event, navUrl) => {
		let u;
		try { u = new URL(navUrl); } catch { return; }
		if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return;
		event.preventDefault();
		if (u.protocol === "http:" || u.protocol === "https:") shell.openExternal(navUrl);
	});
}

// sandbox: defense-in-depth — the renderer only loads our localhost UI. The
// preload is a tiny contextBridge (window.overlay) and needs no Node, so the OS
// sandbox stays on and shrinks the blast radius if any loaded page is compromised.
const WEB_PREFS = {
	contextIsolation: true, nodeIntegration: false, sandbox: true,
	preload: path.join(__dirname, "preload.cjs"),
};

function createWindow() {
	win = new BrowserWindow({
		width: 1200,
		height: 850,
		title: "FFXIV Live Map",
		backgroundColor: "#15171c",
		autoHideMenuBar: true,
		webPreferences: WEB_PREFS,
	});
	win.loadURL(URL);
	wireWindowNav(win);
	win.on("closed", () => { win = null; });
}

// --- Overlay window: the same UI, but transparent, frameless, and floating above
// the game. Opacity is a window property (not CSS), set here on focus/blur from
// the user-configured values. Toggled via the View menu / ⌘⇧O.
function applyOverlayOpacity() {
	if (overlay) overlay.setOpacity(overlay.isFocused() ? overlayCfg.focused : overlayCfg.unfocused);
}
function applyPassthrough() {
	// Only pass clicks through while the overlay is *unfocused*. If it ignored mouse
	// events even when focused, enabling click-through would make it permanently
	// non-interactive — you could never uncheck the box. Focus it (⌘-Tab / Dock) to
	// interact; on blur, clicks fall through to the game again. forward:true keeps
	// hover working meanwhile.
	if (overlay) overlay.setIgnoreMouseEvents(!!overlayCfg.passthrough && !overlay.isFocused(), { forward: true });
}

// Move the overlay to its configured spot. A snapped placement is recomputed from
// the current display work area (robust to resolution changes); "free" restores
// the exact bounds the user last dragged it to — unless those bounds are now
// off-screen (e.g. a disconnected monitor), in which case we fall back to a
// computed spot so the overlay can't restore invisible. `placing` suppresses the
// 'move' handler so our own setPosition isn't mistaken for a user drag.
let placing = false;
function applyPlacement() {
	if (!overlay) return;
	placing = true;
	try {
		const b = overlayCfg.bounds;
		const onScreen = b && screen.getAllDisplays().some((d) => {
			const a = d.bounds;
			return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y;
		});
		if (overlayCfg.placement === "free" && onScreen) {
			overlay.setBounds(b);
		} else {
			const key = overlayCfg.placement === "free" ? "center" : overlayCfg.placement;
			const [width, height] = overlay.getSize();
			const { x, y } = placementPosition(key, screen.getPrimaryDisplay().workArea, { width, height });
			overlay.setPosition(x, y);
		}
	} finally { placing = false; }
}

function createOverlay() {
	overlay = new BrowserWindow({
		width: 520, height: 380,
		title: "FFXIV Live Map — Overlay",
		transparent: true, frame: false, alwaysOnTop: true, hasShadow: false,
		backgroundColor: "#00000000",
		// --is-overlay lets the preload tell the renderer it's the overlay window
		// (so the free-float drag handle only shows there, not in the normal window).
		webPreferences: { ...WEB_PREFS, additionalArguments: ["--is-overlay"] },
	});
	// "screen-saver" level floats above fullscreen-windowed games; keep it on every
	// Space so it stays put when you switch to the game.
	overlay.setAlwaysOnTop(true, "screen-saver");
	overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	wireWindowNav(overlay);
	overlay.loadURL(URL);
	// Focus/blur drives both the opacity AND the click-through (so a focused overlay
	// is interactive even with passthrough enabled).
	overlay.on("focus", () => { applyOverlayOpacity(); applyPassthrough(); });
	overlay.on("blur", () => { applyOverlayOpacity(); applyPassthrough(); });
	overlay.webContents.once("did-finish-load", () => { applyOverlayOpacity(); applyPassthrough(); applyPlacement(); });
	// A user drag (not our own snap) becomes the new "free" position. 'move' fires
	// continuously while dragging, so debounce the synchronous config write.
	let moveSave = null;
	overlay.on("move", () => {
		if (placing) return;
		overlayCfg.placement = "free";
		overlayCfg.bounds = overlay.getBounds();
		if (moveSave) clearTimeout(moveSave);
		moveSave = setTimeout(() => { moveSave = null; saveOverlayConfig(); }, 400);
	});
	// Frameless, so only the menu/shortcut closes it — and closing restores the
	// hidden main window (unless we're quitting outright).
	overlay.on("closed", () => { overlay = null; if (win && !quitting) win.show(); });
}

function toggleOverlay() {
	if (overlay) { overlay.close(); return; }
	// Hide the normal window for a clean single overlay. A frameless,
	// screen-saver-level window reads as an "accessory" to macOS, which would drop
	// the app from the Dock + ⌘-Tab — so re-assert the regular activation policy
	// (and show the Dock icon) right after creating it. Clicking the Dock icon /
	// ⌘-Tab then focuses the overlay (see the 'activate' handler).
	if (win) win.hide();
	createOverlay();
	if (process.platform === "darwin") app.setActivationPolicy("regular");
	app.dock?.show();
}

function buildMenu() {
	const isMac = process.platform === "darwin";
	const template = [
		...(isMac ? [{ role: "appMenu" }] : []),
		{
			label: "View",
			submenu: [
				{ label: "Toggle Overlay", accelerator: "CmdOrCtrl+Shift+O", click: toggleOverlay },
				{ type: "separator" },
				{ role: "reload" }, { role: "toggleDevTools" }, { role: "togglefullscreen" },
			],
		},
		{ role: "windowMenu" },
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerOverlayIpc() {
	ipcMain.handle("overlay:getConfig", () => overlayCfg);
	ipcMain.on("overlay:setOpacities", (_e, { focused, unfocused }) => {
		overlayCfg.focused = clamp01(focused);
		overlayCfg.unfocused = clamp01(unfocused);
		saveOverlayConfig();
		applyOverlayOpacity();
	});
	ipcMain.on("overlay:setPassthrough", (_e, on) => {
		overlayCfg.passthrough = !!on;
		saveOverlayConfig();
		applyPassthrough();
	});
	ipcMain.on("overlay:setPlacement", (_e, key) => {
		if (!PLACEMENTS.includes(key)) return; // ignore anything not from our own UI
		overlayCfg.placement = key;            // a corner, "center", or "free"
		if (key !== "free") overlayCfg.bounds = null; // snapped: recompute, don't pin bounds
		saveOverlayConfig();
		applyPlacement();
	});
	ipcMain.on("overlay:toggle", () => toggleOverlay());
}

function killStack() {
	quitting = true;
	if (gameWatch) { clearInterval(gameWatch); gameWatch = null; }
	// The daemon is a lone node process, so child.kill() reaps it cleanly. The
	// bridge is a bash wrapper that respawns `wine` in a loop — killing only bash
	// orphans the wine child, which keeps holding the TCP port. The bridge is only
	// ever spawned on macOS (detached, its own process group), so there a negative
	// PID signals the whole group (bash + wine) at once.
	for (const child of [daemon, bridge]) {
		if (!child || child.killed) continue;
		try {
			if (child === bridge && process.platform === "darwin") {
				process.kill(-child.pid, "SIGTERM");
			} else {
				child.kill();
			}
		} catch { /* already gone */ }
	}
	daemon = null;
	bridge = null;
}

// One instance only — a second launch would spawn a duplicate bridge/daemon.
// app.exit() (not quit()) terminates the duplicate immediately, before it can
// run any further startup that might touch the ports the first instance owns.
if (!app.requestSingleInstanceLock()) {
	app.exit();
} else {
	app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

	app.whenReady().then(async () => {
		// Stay a regular Dock + ⌘-Tab app even when the always-on-top overlay (which
		// macOS would otherwise treat as an accessory) is the foreground window.
		if (process.platform === "darwin") app.setActivationPolicy("regular");
		app.dock?.show();
		loadOverlayConfig();   // userData path is only valid after ready
		registerOverlayIpc();
		buildMenu();
		try {
			await startStack();
			createWindow();
			// Global (system-wide) shortcut so you can flip into overlay mode even
			// while the game window is focused.
			globalShortcut.register("CommandOrControl+Shift+O", toggleOverlay);
		} catch (err) {
			dialog.showErrorBox("FFXIV Live Map — couldn't start", String(err && err.message ? err.message : err));
			app.quit();
		}
		// Dock-icon click / re-activate: focus the overlay if it's up (the main window
		// is hidden then), else show the main window, else recreate it.
		app.on("activate", () => {
			if (overlay) overlay.focus();
			else if (win) win.show();
			else createWindow();
		});
	});

	// macOS convention: stay alive when the window closes; the dock icon reopens it.
	app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
	app.on("will-quit", () => globalShortcut.unregisterAll());
	app.on("before-quit", killStack);
	app.on("quit", killStack);

	// Terminal Ctrl+C / kill: the bridge is detached in its own process group, so
	// it won't receive the shell's SIGINT — tear the stack down explicitly before
	// exiting, otherwise the bridge (and its wine child) would leak.
	for (const sig of ["SIGINT", "SIGTERM"]) {
		process.on(sig, () => { killStack(); app.exit(); });
	}
}
