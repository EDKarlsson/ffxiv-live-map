import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// User-placed custom markers, persisted to disk: { mapId: [ {id,x,y,label,icon} ] }.
// Env override (FFXIV_MARKERS_FILE) keeps tests/CI off the user's real file.
const MARKERS_FILE = process.env.FFXIV_MARKERS_FILE || join(__dirname, "../custom-markers.json");

export const customMarkers = {};
try {
	if (existsSync(MARKERS_FILE)) Object.assign(customMarkers, JSON.parse(readFileSync(MARKERS_FILE, "utf-8")));
} catch (e) {
	console.warn("[markers] could not load:", e.message);
}

export const saveMarkers = () => writeFileSync(MARKERS_FILE, JSON.stringify(customMarkers));
