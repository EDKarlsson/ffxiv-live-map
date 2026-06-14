import { map, bounds } from "./map.js";
import { state } from "./state.js";

let overlay = null;

// xivapi v2 occasionally serves an all-black asset for a map (confirmed for
// The Pillars, r2t2/00 — v2 is black, while the frozen v1 host still has the
// real image). Rewrite the v2 URL back to the v1 host:
//   …/api/asset/map/r2t2/00  ->  https://xivapi.com/m/r2t2/r2t2.00.jpg
function basemapV1Fallback(v2url) {
	return v2url.replace(/^https:\/\/v2\.xivapi\.com\/api\/asset\/map\/([^/]+)\/(\d+)$/, "https://xivapi.com/m/$1/$1.$2.jpg");
}

// Add the overlay with the v2 URL, then sample the loaded image; if every pixel
// is black, swap to the v1 URL. CORS on v2 is open (ACAO:*), so the canvas read
// isn't tainted.
export function setBasemap(m) {
	if (overlay) { overlay.remove(); overlay = null; }
	overlay = L.imageOverlay(m.image, bounds, { pane: "basemap" }).addTo(map);
	if (!m.image) return;
	const probe = new Image();
	probe.crossOrigin = "anonymous";
	probe.onload = () => {
		try {
			const c = document.createElement("canvas");
			c.width = c.height = 16;
			const ctx = c.getContext("2d");
			ctx.drawImage(probe, 0, 0, 16, 16);
			const px = ctx.getImageData(0, 0, 16, 16).data;
			let max = 0;
			for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
			const v1 = basemapV1Fallback(m.image);
			if (max === 0 && v1 !== m.image && overlay && state.viewedMap?.id === m.id) overlay.setUrl(v1);
		} catch { /* tainted canvas / decode error — keep the v2 image */ }
	};
	probe.src = m.image;
}
