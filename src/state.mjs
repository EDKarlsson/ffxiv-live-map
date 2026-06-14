import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { STATE_DIR } from "./paths.mjs";

// Live player/zone state, broadcast to the UI over WebSocket.
export const state = {
	map: null, // current map entry from maps.json
	pos: null, // last converted position
	rotation: null,
	connected: false,
};

// Persist last zone/position so a daemon restart doesn't need a zone change to
// show the map again. Stale-zone caveat: if you switch zones while the daemon is
// down, this restores the old zone until the next initZone.
const STATE_FILE = join(STATE_DIR, ".state.json");
try {
	if (existsSync(STATE_FILE)) {
		const saved = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
		state.map = saved.map ?? null;
		state.pos = saved.pos ?? null;
		state.rotation = saved.rotation ?? null;
		if (state.map) console.log(`[map] restored last state: map ${state.map.id}`);
	}
} catch (e) {
	console.warn("[map] could not restore saved state:", e.message);
}

let lastSave = 0;
export function persistState(force = false) {
	const now = Date.now();
	if (!force && now - lastSave < 5000) return;
	lastSave = now;
	try {
		writeFileSync(STATE_FILE, JSON.stringify({ map: state.map, pos: state.pos, rotation: state.rotation }));
	} catch (e) {
		console.warn("[map] state save failed:", e.message);
	}
}
