import { map } from "./map.js";
import { state } from "./state.js";
import { px2ll } from "./coords.js";
import { viewMap } from "./view-map.js";

let marker = null;

function applyRotation() {
	// Same conversion Teamcraft's mappy uses: css = (rotation - PI) * -1 rad.
	const dot = marker?.getElement()?.querySelector(".player-dot");
	if (dot && state.lastRot !== null) dot.style.rotate = `${(state.lastRot - Math.PI) * -1}rad`;
}

export function refreshMarker() {
	const onViewed = state.lastPos && state.playerMap && state.viewedMap && state.playerMap.id === state.viewedMap.id;
	if (!onViewed) { marker?.remove(); marker = null; return; }
	const ll = px2ll(state.lastPos.pixelX, state.lastPos.pixelY);
	if (!marker) {
		// Inner div (not className on the root): Leaflet owns the root's transform,
		// so size scaling/rotation must live one level down.
		marker = L.marker(ll, { pane: "player", icon: L.divIcon({ className: "", html: `<div class="player-dot"></div>`, iconSize: [14, 14] }) })
			.bindTooltip("You — click to zoom in")
			.on("click", () => map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 2)))
			.addTo(map);
	} else {
		marker.setLatLng(ll);
	}
	applyRotation();
}

export function setPos(p, rot) {
	state.lastPos = p;
	if (rot !== undefined && rot !== null) state.lastRot = rot;
	refreshMarker();
	document.getElementById("coordsText").textContent = `X: ${p.mapX.toFixed(1)}  Y: ${p.mapY.toFixed(1)}`;
}

// "Find me": center+zoom on the player, switching back to their map first if
// you've browsed elsewhere (the dot itself is unclickable when off-screen).
export async function findMe() {
	if (!state.playerMap || !state.lastPos) return;
	if (state.viewedMap?.id !== state.playerMap.id) {
		viewMap(state.playerMap);
		await new Promise((r) => setTimeout(r, 300));
	}
	map.flyTo(px2ll(state.lastPos.pixelX, state.lastPos.pixelY), Math.max(map.getZoom(), 2));
}

export function handleZone(m) {
	state.playerMap = m;
	state.lastPos = null;
	if (state.follow && m) viewMap(m);
	else refreshMarker();
}
