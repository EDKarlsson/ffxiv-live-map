import { map } from "../core/map.js";
import { coordLL } from "../core/coords.js";
import { iconAsset } from "../core/icons.js";

// Treasure-map dig spots (per-tier toggles, like the monster list).
let treasureData = [];
const treasureLayers = new Map(); // tier item id -> layerGroup
const treasureChecked = new Set();

function showTier(item) {
	if (treasureLayers.has(item)) return;
	const g = L.layerGroup().addTo(map);
	for (const t of treasureData.filter((x) => x.item === item)) {
		g.addLayer(L.marker(coordLL(t.x, t.y), {
			// 025930 = the shared timeworn-map item icon (all tiers use it).
			icon: L.divIcon({ className: "node-icon treasure-icon", html: `<img src="${iconAsset(25930)}">`, iconSize: [24, 24], iconAnchor: [12, 12] }),
		}).bindTooltip(`${t.itemName}${t.party > 1 ? ` (party of ${t.party})` : ""}`)
			.bindPopup(`<b>${t.itemName}</b> <span class="nlvl">dig spot · (${t.x}, ${t.y})${t.party > 1 ? ` · ${t.party}-player` : ""}</span><br>` +
				`<a href="https://www.garlandtools.org/db/#item/${t.item}" target="_blank">GarlandTools</a>`));
	}
	treasureLayers.set(item, g);
}

export function renderTreasureList() {
	const el = document.getElementById("treasureList");
	const tiers = new Map(); // item id -> {name, count}
	for (const t of treasureData) {
		const e = tiers.get(t.item) ?? { name: t.itemName, count: 0 };
		e.count++;
		tiers.set(t.item, e);
	}
	el.innerHTML = tiers.size
		? [...tiers.entries()].map(([item, e]) =>
			`<div><label><input type="checkbox" data-item="${item}" ${treasureChecked.has(item) ? "checked" : ""}> ` +
			`${e.name} <span class="lvl">·${e.count}</span></label></div>`).join("")
		: `<span class="muted">no spots on this map</span>`;
	[...el.querySelectorAll("input[type=checkbox]")].forEach((cb) => {
		cb.onchange = () => {
			const item = Number(cb.dataset.item);
			if (cb.checked) { treasureChecked.add(item); showTier(item); }
			else { treasureChecked.delete(item); treasureLayers.get(item)?.remove(); treasureLayers.delete(item); }
		};
	});
}

export async function loadTreasures(m) {
	treasureLayers.forEach((g) => g.remove());
	treasureLayers.clear();
	treasureChecked.clear();
	treasureData = await fetch(`/treasures?map=${m.id}`).then((r) => r.json());
	renderTreasureList();
}
