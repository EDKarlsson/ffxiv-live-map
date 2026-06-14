/**
 * ffxiv-live-map — Electron shell (PR 1 of the mini-map overlay).
 *
 * This is the desktop wrapper: on launch it brings up the whole stack itself
 * (Deucalion bridge + daemon, the same pieces scripts/start.sh starts) and
 * shows the existing Leaflet map in a normal window instead of a browser tab.
 * The transparent always-on-top overlay window is a follow-up PR.
 *
 * CommonJS on purpose: the package is "type": "module", but Electron's main
 * entry is simplest and most portable as .cjs. The daemon (ESM) runs unchanged
 * as a child process, so nothing in src/ has to change.
 *
 * Run: npm run app   (prereqs: FFXIV + Teamcraft with Packet Capture, like start.sh)
 */

const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
// Packaged (asar:false): app files live in Resources/app/, so ROOT/scripts and
// the ESM daemon load as plain files. Derived data ships read-only in
// Resources/data; writable runtime state (.state.json, custom-markers.json) goes
// to userData since the app bundle is read-only.
const PACKAGED = app.isPackaged;
const DATA_DIR = PACKAGED ? path.join(process.resourcesPath, "data") : path.join(ROOT, "data");
const STATE_DIR = PACKAGED ? app.getPath("userData") : ROOT;
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 31595);
const HTTP_PORT = Number(process.env.HTTP_PORT || 8787);
const URL = `http://localhost:${HTTP_PORT}`;

let bridge = null;
let daemon = null;
let win = null;
let quitting = false; // set during teardown so child 'exit' handlers don't treat it as a crash

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
		FFXIV_STATE_DIR: STATE_DIR, // daemon writes .state.json / custom-markers.json here
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

	// 2. Deucalion bridge — start ours unless one is already listening. The
	// script bails if FFXIV/Teamcraft aren't up, so the wait below will time out
	// with a clear message in that case.
	if (!(await tcpListening(BRIDGE_PORT))) {
		// The bundled bridge is macOS-only — scripts/start-bridge.sh hardcodes the
		// XIV-on-Mac wine paths. On other platforms `spawn("bash", …)` would ENOENT
		// and the unhandled 'error' event would crash Electron, so only spawn on
		// darwin; elsewhere the wait below fails with a clear "bridge never came up".
		if (process.platform === "darwin") {
			// detached: the bash wrapper respawns `wine` in a loop, so it must be its
			// own process-group leader — the only way killStack() can take the whole
			// tree (bash + wine) down later via a negative-PID signal, instead of
			// orphaning the wine child still holding the TCP port. (Not unref'd: we
			// keep tracking it so we can kill it on quit.)
			// Absolute /bin/bash + absolute script path: a Finder-launched .app has a
			// minimal PATH, so don't rely on `bash` being resolvable.
			bridge = spawn("/bin/bash", [path.join(ROOT, "scripts/start-bridge.sh"), String(BRIDGE_PORT)], { cwd: ROOT, stdio: "inherit", detached: true });
			bridge.on("error", (err) => { console.error(`[app] bridge spawn failed: ${err.message}`); });
			bridge.on("exit", (code) => { console.log(`[app] bridge exited (${code})`); });
		} else {
			console.warn(`[app] auto-starting the bridge is macOS-only; start a Deucalion bridge on :${BRIDGE_PORT} yourself first.`);
		}
	}
	if (!(await waitFor(() => tcpListening(BRIDGE_PORT)))) {
		throw new Error(
			`The Deucalion bridge never came up on :${BRIDGE_PORT}.\n\n` +
			`Make sure FFXIV is running and FFXIV Teamcraft is open with Packet Capture enabled, then relaunch.`
		);
	}

	// 3. Daemon — reuse one already serving (e.g. a running `npm start`), else
	// spawn it. We waited for the bridge first so the daemon's initial connect
	// succeeds (it exits if that first connect fails).
	if (await httpOk(`${URL}/maps`)) {
		console.log(`[app] reusing daemon already serving on ${URL}`);
	} else {
		daemon = spawn(process.execPath, [path.join(ROOT, "src/daemon.mjs"), "--bridge-port", String(BRIDGE_PORT), "--http-port", String(HTTP_PORT)], { cwd: ROOT, stdio: "inherit", env: nodeEnv });
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
}

function createWindow() {
	win = new BrowserWindow({
		width: 1200,
		height: 850,
		title: "FFXIV Live Map",
		backgroundColor: "#15171c",
		autoHideMenuBar: true,
		// sandbox: defense-in-depth — the renderer only loads our localhost UI
		// (no preload needs Node), so the OS sandbox costs nothing and shrinks the
		// blast radius if any loaded page is ever compromised.
		webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
	});
	win.loadURL(URL);
	// Deny every in-app popup. The UI's only external links are http(s)
	// (GarlandTools, Teamcraft, wiki) opened with target="_blank" — hand those to
	// the real browser and refuse everything else (file:, javascript:, custom
	// schemes) so a compromised page can't open a window into another protocol.
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url)) shell.openExternal(url);
		return { action: "deny" };
	});
	// Pin the window to our localhost UI. setWindowOpenHandler only covers popups
	// (window.open / target="_blank"); a *top-level* navigation — a link without
	// target, a redirect, a location change — would otherwise load an external page
	// inside this privileged window. Bounce any off-localhost navigation to the
	// real browser (http(s) only) and cancel it here.
	win.webContents.on("will-navigate", (event, navUrl) => {
		let u;
		try { u = new URL(navUrl); } catch { return; }
		if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return;
		event.preventDefault();
		if (u.protocol === "http:" || u.protocol === "https:") shell.openExternal(navUrl);
	});
	win.on("closed", () => { win = null; });
}

function killStack() {
	quitting = true;
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
		try {
			await startStack();
			createWindow();
		} catch (err) {
			dialog.showErrorBox("FFXIV Live Map — couldn't start", String(err && err.message ? err.message : err));
			app.quit();
		}
		app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
	});

	// macOS convention: stay alive when the window closes; the dock icon reopens it.
	app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
	app.on("before-quit", killStack);
	app.on("quit", killStack);

	// Terminal Ctrl+C / kill: the bridge is detached in its own process group, so
	// it won't receive the shell's SIGINT — tear the stack down explicitly before
	// exiting, otherwise the bridge (and its wine child) would leak.
	for (const sig of ["SIGINT", "SIGTERM"]) {
		process.on(sig, () => { killStack(); app.exit(); });
	}
}
