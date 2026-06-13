import { layers } from "../core/layers.js";
import { vectorRenderer } from "../core/map.js";
import { coordLL } from "../core/coords.js";
import { gameIcon } from "../core/icons.js";

// Fishing holes (fishing-log spots; coords already in-game map coords).
export async function loadFishing(m) {
	layers.fishing.clearLayers();
	const spots = await fetch(`/fishing-spots?map=${m.id}`).then((r) => r.json());
	for (const s of spots) {
		const ll = coordLL(s.x, s.y);
		const fish = s.fishes.map((f) => `<a href="https://www.garlandtools.org/db/#item/${f.id}" target="_blank">${f.name}</a>`).join(", ");
		layers.fishing.addLayer(L.marker(ll, {
			icon: L.divIcon({ className: "node-icon fish-icon", html: `<img src="${gameIcon("060445")}">`, iconSize: [26, 26], iconAnchor: [13, 13] }),
		}).bindTooltip(`Fishing hole (Lv${s.level})`)
			.bindPopup(`<b>Fishing hole</b> <span class="nlvl">Lv${s.level} · (${s.x}, ${s.y})</span><br>${fish}`));
		if (s.radius > 0) {
			// Circle lives in this layer (not `areas`) so it toggles with the spot.
			layers.fishing.addLayer(L.circle(ll, {
				radius: s.radius * (m.size_factor / 100), renderer: vectorRenderer, color: "#4cc9f0",
				weight: 2, opacity: 0.9, dashArray: "6 5", fillColor: "#4cc9f0", fillOpacity: 0.12, interactive: false,
			}));
		}
	}
}
