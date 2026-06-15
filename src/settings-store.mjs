import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { STATE_DIR } from "./paths.mjs";

// Persisted daemon settings — distinct from CLI args (config.mjs) and the live
// zone/position (state.mjs). Currently just the user's capture on/off preference,
// so a stopped/started choice survives a restart. Written to `.settings.json` in
// the writable STATE_DIR, next to `.state.json` / `custom-markers.json`. The
// FFXIV_SETTINGS_FILE override lets tests (and the packaged app) redirect it.
const SETTINGS_FILE = process.env.FFXIV_SETTINGS_FILE || join(STATE_DIR, ".settings.json");

const settings = {};
try {
	if (existsSync(SETTINGS_FILE)) Object.assign(settings, JSON.parse(readFileSync(SETTINGS_FILE, "utf-8")));
} catch (e) {
	console.warn("[settings] could not read .settings.json:", e.message);
}

export function getDaemonSetting(key, def) {
	return settings[key] === undefined ? def : settings[key];
}

export function setDaemonSetting(key, value) {
	settings[key] = value;
	try { writeFileSync(SETTINGS_FILE, JSON.stringify(settings)); }
	catch (e) { console.warn("[settings] save failed:", e.message); }
}
