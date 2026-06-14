import { mapForTerritory, mapById, convertPosition } from "./coords.mjs";
import { db } from "./data-store.mjs";
import { state } from "./state.mjs";
import { broadcast } from "./ws.mjs";
import { setCaptureMode } from "./capture.mjs";
import { MOCK_ZONE } from "./config.mjs";

// Synthetic zone + moving character for headless/remote verification when the
// game isn't running. Reuses the exact broadcast plumbing real capture uses, so
// the UI's player dot, "follow", and status pill all exercise. Walks a circle in
// raw world coords through convertPosition, just like a real position packet.
export function startMock() {
	// mapsIndex holds slim index entries (no offset_x/size_factor); resolve the
	// full map via mapById so convertPosition doesn't produce NaN coords.
	const map = mapForTerritory(MOCK_ZONE) ?? (db.mapsIndex[0] ? mapById(db.mapsIndex[0].id) : null);
	if (!map) {
		console.warn(`[mock] no map found for zone ${MOCK_ZONE} (is data/ built?) — mock idle.`);
		return;
	}
	state.map = map;
	// Mock simulates a connected game, so the UI status pill should read "live".
	setCaptureMode("live");
	console.log(`[mock] synthetic character in ${map.image} (zone ${MOCK_ZONE}) — pass --mock-zone <id> to change.`);
	broadcast({ type: "zone", map });
	let t = 0;
	setInterval(() => {
		t += 0.08;
		// pos.x = E-W, pos.z = N-S drive the map plane; pos.y is altitude (ignored).
		const raw = { x: 100 * Math.cos(t), y: 0, z: 100 * Math.sin(t) };
		state.pos = convertPosition(raw, state.map);
		state.rotation = t % (Math.PI * 2);
		broadcast({ type: "pos", pos: state.pos, rotation: state.rotation });
		// No persistState(): the mock is ephemeral and must not clobber the user's
		// real .state.json with synthetic coordinates.
	}, 500);
}
