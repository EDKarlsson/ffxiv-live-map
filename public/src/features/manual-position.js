import { map } from "../core/map.js";
import { state } from "../core/state.js";
import { IMG } from "../core/constants.js";
import { pxToCoord } from "../core/coords.js";
import { setPos } from "../core/player.js";

// "Set position on click": in browse mode there are no packets to drive the
// player dot, so let the user plant a static one. A click synthesizes a position
// at the clicked coords (the same {mapX,mapY,pixelX,pixelY} shape the daemon's
// convertPosition emits) and feeds it through player.setPos — so the dot, the
// X/Y readout and "Find me" all work off it. The dot belongs to whatever map is
// being viewed when it's placed; in capture mode a real packet would replace it.

let placing = false;

export function initManualPosition() {
	const toggle = document.getElementById("manualPos");
	if (!toggle) return;
	const mapEl = document.getElementById("map");

	toggle.onchange = (e) => {
		placing = e.target.checked;
		mapEl.classList.toggle("locating", placing);
	};

	map.on("click", (e) => {
		if (!placing || !state.viewedMap) return;
		// Leaflet Simple CRS: px2ll(x, y) = [IMG - y, x]; invert to recover pixels.
		const pixelX = e.latlng.lng;
		const pixelY = IMG - e.latlng.lat;
		const sf = state.viewedMap.size_factor;
		const mapX = pxToCoord(pixelX, sf);
		const mapY = pxToCoord(pixelY, sf);
		// Bind the player to the viewed map so refreshMarker() draws the dot here
		// (it only renders when playerMap === viewedMap).
		state.playerMap = state.viewedMap;
		setPos({ mapX, mapY, pixelX, pixelY });
	});
}
