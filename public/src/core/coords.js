import { IMG } from "./constants.js";
import { state } from "./state.js";

// Leaflet Simple CRS: latlng = [y-up, x]; image pixel y grows downward.
export const px2ll = (x, y) => [IMG - y, x];

// In-game map coord -> image pixel (inverse of the daemon formula).
export function coordToPx(coord, sizeFactor) {
	const c = sizeFactor / 100;
	return ((coord - 1) * 2048 * c) / 41;
}

// Image pixel -> in-game map coord (inverse of coordToPx) so a click stores game coords.
export function pxToCoord(px, sizeFactor) {
	const c = sizeFactor / 100;
	return (px * 41) / (2048 * c) + 1;
}

// In-game map coords -> latlng on the viewed map.
export const coordLL = (x, y) =>
	px2ll(coordToPx(x, state.viewedMap.size_factor), coordToPx(y, state.viewedMap.size_factor));
