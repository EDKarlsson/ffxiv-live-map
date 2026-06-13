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
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 31595);
const HTTP_PORT = Number(process.env.HTTP_PORT || 8787);
const URL = `http://localhost:${HTTP_PORT}`;

let bridge = null;
let daemon = null;
let win = null;

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
	const nodeEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };

	// 1. Build bundled data on first run (no-op once cached).
	const ed = spawnSync(process.execPath, ["scripts/ensure-data.mjs"], { cwd: ROOT, stdio: "inherit", env: nodeEnv });
	if (ed.error) throw ed.error; // spawn itself failed (binary missing, EACCES, …) — status is null in that case
	if (ed.status !== 0) throw new Error("data build failed (scripts/ensure-data.mjs).");

	// 2. Deucalion bridge — start ours unless one is already listening. The
	// script bails if FFXIV/Teamcraft aren't up, so the wait below will time out
	// with a clear message in that case.
	if (!(await tcpListening(BRIDGE_PORT))) {
		// detached: the bash wrapper respawns `wine` in a loop, so it must be its
		// own process-group leader. That's the only way killStack() can take the
		// whole tree (bash + wine) down later via a negative-PID signal — otherwise
		// the orphaned wine child keeps holding the TCP port. (Not unref'd: we want
		// to keep tracking it so we can kill it on quit.)
		bridge = spawn("bash", ["scripts/start-bridge.sh", String(BRIDGE_PORT)], { cwd: ROOT, stdio: "inherit", detached: true });
		bridge.on("exit", (code) => { console.log(`[app] bridge exited (${code})`); });
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
		daemon = spawn(process.execPath, ["src/daemon.mjs", "--bridge-port", String(BRIDGE_PORT), "--http-port", String(HTTP_PORT)], { cwd: ROOT, stdio: "inherit", env: nodeEnv });
		daemon.on("exit", (code) => { console.log(`[app] daemon exited (${code})`); });
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
	win.on("closed", () => { win = null; });
}

function killStack() {
	// The daemon is a lone node process, so child.kill() reaps it cleanly. The
	// bridge is a bash wrapper that respawns `wine` in a loop — killing only bash
	// orphans the wine child, which keeps holding the TCP port. We spawned the
	// bridge detached (its own process group), so a negative PID signals the whole
	// group (bash + wine) at once. Windows has neither process groups nor the wine
	// bridge, so fall back to child.kill() there.
	for (const child of [daemon, bridge]) {
		if (!child || child.killed) continue;
		try {
			if (child === bridge && process.platform !== "win32") {
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
if (!app.requestSingleInstanceLock()) {
	app.quit();
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
}
