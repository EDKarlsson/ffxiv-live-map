import { layers } from "../core/layers.js";
import { coordLL } from "../core/coords.js";
import { iconAsset } from "../core/icons.js";
import { vistaAlways, vistaOpen, fmtVT } from "../core/eorzea-time.js";

// Vistas (sightseeing log; ET window is HMM-encoded, e.g. 1159 = 11:59).
export async function loadVistas(m) {
	layers.vistas.clearLayers();
	const vistas = await fetch(`/vistas?map=${m.id}`).then((r) => r.json());
	for (const v of vistas) {
		// Marker = the vista's own 40x40 photo thumbnail (Adventure.IconList),
		// gold-ringed; falls back to the 🔭 pin for rows without one.
		const icon = v.icon
			? L.divIcon({ className: "node-icon vista-icon", html: `<img src="${iconAsset(v.icon)}">`, iconSize: [26, 26], iconAnchor: [13, 13] })
			: L.divIcon({ className: "", html: `<div class="emoji-pin vista-pin">🔭</div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
		layers.vistas.addLayer(L.marker(coordLL(v.x, v.y), { icon })
			.bindTooltip(`Vista: ${v.name}`)
			.bindPopup(() => {
				const win = vistaAlways(v) ? "any time"
					: `ET ${fmtVT(v.minTime)}–${fmtVT(v.maxTime)} <span class="${vistaOpen(v) ? "vista-open" : "vista-closed"}">${vistaOpen(v) ? "● open now" : "○ closed"}</span>`;
				return `<b>${v.name}</b> <span class="nlvl">vista · ${v.place} · (${v.x}, ${v.y})</span><br>` +
					`${win}${v.emote ? ` · /${v.emote.toLowerCase()}` : ""}<br>` +
					`<span class="nlvl">Some vistas also need specific weather (not in game data — check the wiki)</span>` +
					(v.icon ? `<img class="vista-photo" src="${iconAsset(v.icon)}">` : "");
			}));
	}
}
