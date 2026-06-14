import { map, bounds } from "./map.js";
import { state } from "./state.js";
import { setBasemap } from "./basemap.js";
import { refreshMarker } from "./player.js";
import { applyPickerSelection } from "../features/map-picker.js";
import { loadNodes } from "../layers/nodes.js";
import { loadMonsters } from "../layers/monsters.js";
import { loadFates } from "../layers/fates.js";
import { loadNpcs } from "../layers/npcs.js";
import { loadFishing } from "../layers/fishing.js";
import { loadMapMarkers } from "../layers/map-markers.js";
import { loadTreasures } from "../layers/treasure.js";
import { loadVistas } from "../layers/vistas.js";
import { loadCurrents } from "../layers/aether-currents.js";
import { renderHunt, huntData } from "../features/hunting-log.js";
import { renderList, highlightListNodes, listData } from "../features/list-import.js";
import { routeLayer } from "../features/route.js";
import { matLayer } from "../features/find-material.js";
import { loadCustom } from "../features/custom-markers.js";

export function setFollow(v) {
	state.follow = v;
	document.getElementById("followToggle").checked = v;
	if (v && state.playerMap && state.viewedMap?.id !== state.playerMap.id) viewMap(state.playerMap);
}

// The orchestrator: switch the displayed map and reload every layer for it.
// Returns a promise that resolves once all layer loads have settled, so callers
// (find-material, list-import, whats-up, hunting-log, "find me") can `await
// viewMap(m)` before flying to a coordinate instead of guessing with setTimeout.
export async function viewMap(m) {
	if (!m || state.viewedMap?.id === m.id) { refreshMarker(); return; }
	const hadMap = state.viewedMap !== null;
	state.viewedMap = m;
	setBasemap(m);
	// All map images share the same 2048 bounds, so "keep zoom" = simply don't
	// re-fit: center and zoom carry over.
	if (!hadMap || !document.getElementById("keepZoom").checked) map.fitBounds(bounds);
	applyPickerSelection(m);
	// Kick every layer load off concurrently; each catches its own error so one
	// failure can't reject the rest. We await them all at the end.
	const loads = [
		loadNodes(m).catch((e) => console.error("loadNodes failed:", e)),
		loadMonsters(m).catch((e) => console.error("loadMonsters failed:", e)),
		loadFates(m).catch((e) => console.error("loadFates failed:", e)),
		loadNpcs(m).catch((e) => console.error("loadNpcs failed:", e)),
		loadFishing(m).catch((e) => console.error("loadFishing failed:", e)),
		loadMapMarkers(m).catch((e) => console.error("loadMapMarkers failed:", e)),
		loadTreasures(m).catch((e) => console.error("loadTreasures failed:", e)),
		loadVistas(m).catch((e) => console.error("loadVistas failed:", e)),
		loadCurrents(m).catch((e) => console.error("loadCurrents failed:", e)),
		loadCustom(m).catch((e) => console.error("loadCustom failed:", e)),
	];
	if (huntData) renderHunt(); // refresh 📍 here-markers for the new map
	if (listData) { renderList(); highlightListNodes(); }
	routeLayer.clearLayers();
	matLayer.clearLayers(); // material-search rings are per-map highlights
	document.getElementById("routeInfo").textContent = "";
	refreshMarker();
	await Promise.all(loads);
}
