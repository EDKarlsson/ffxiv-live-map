import { layers } from "../core/layers.js";
import { coordLL } from "../core/coords.js";
import { gameIcon } from "../core/icons.js";

export async function loadFates(m) {
	layers.fates.clearLayers();
	const fates = await fetch(`/fates?map=${m.id}`).then((r) => r.json());
	for (const f of fates) {
		layers.fates.addLayer(L.marker(coordLL(f.x, f.y), {
			icon: L.divIcon({ className: "node-icon fate-icon", html: `<img src="${gameIcon(f.icon)}">`, iconSize: [26, 26], iconAnchor: [13, 13] }),
		}).bindTooltip(`${f.name} (Lv${f.level})`)
			.bindPopup(`<b>${f.name}</b> <span class="nlvl">FATE Lv${f.level} · (${f.x}, ${f.y})</span>`));
	}
}
