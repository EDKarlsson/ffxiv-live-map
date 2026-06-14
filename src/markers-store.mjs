import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { STATE_DIR } from "./paths.mjs";

// User-placed custom markers, persisted to disk: { mapId: [ {id,x,y,label,icon} ] }.
// Env override (FFXIV_MARKERS_FILE) keeps tests/CI off the user's real file.
const MARKERS_FILE = process.env.FFXIV_MARKERS_FILE || join(STATE_DIR, "custom-markers.json");

export const customMarkers = {};
try {
	if (existsSync(MARKERS_FILE)) Object.assign(customMarkers, JSON.parse(readFileSync(MARKERS_FILE, "utf-8")));
} catch (e) {
	console.warn("[markers] could not load:", e.message);
}

export const saveMarkers = () => {
	// Best-effort persistence — a disk error shouldn't take the daemon down.
	try { writeFileSync(MARKERS_FILE, JSON.stringify(customMarkers)); }
	catch (e) { console.warn("[markers] save failed:", e.message); }
};
