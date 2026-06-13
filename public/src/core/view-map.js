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
export function viewMap(m) {
	if (!m || state.viewedMap?.id === m.id) { refreshMarker(); return; }
	const hadMap = state.viewedMap !== null;
	state.viewedMap = m;
	setBasemap(m);
	// All map images share the same 2048 bounds, so "keep zoom" = simply don't
	// re-fit: center and zoom carry over.
	if (!hadMap || !document.getElementById("keepZoom").checked) map.fitBounds(bounds);
	applyPickerSelection(m);
	loadNodes(m).catch((e) => console.error("loadNodes failed:", e));
	loadMonsters(m).catch((e) => console.error("loadMonsters failed:", e));
	loadFates(m).catch((e) => console.error("loadFates failed:", e));
	loadNpcs(m).catch((e) => console.error("loadNpcs failed:", e));
	loadFishing(m).catch((e) => console.error("loadFishing failed:", e));
	loadMapMarkers(m).catch((e) => console.error("loadMapMarkers failed:", e));
	loadTreasures(m).catch((e) => console.error("loadTreasures failed:", e));
	loadVistas(m).catch((e) => console.error("loadVistas failed:", e));
	loadCurrents(m).catch((e) => console.error("loadCurrents failed:", e));
	if (huntData) renderHunt(); // refresh 📍 here-markers for the new map
	if (listData) { renderList(); highlightListNodes(); }
	routeLayer.clearLayers();
	matLayer.clearLayers(); // material-search rings are per-map highlights
	document.getElementById("routeInfo").textContent = "";
	loadCustom(m).catch((e) => console.error("loadCustom failed:", e));
	refreshMarker();
}
