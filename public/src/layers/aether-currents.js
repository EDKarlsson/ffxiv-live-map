import { layers } from "../core/layers.js";
import { coordLL } from "../core/coords.js";

// Aether currents (HW+ zones only; quest-locked ones have no field position).
export async function loadCurrents(m) {
	layers.currents.clearLayers();
	const d = await fetch(`/aether-currents?map=${m.id}`).then((r) => r.json());
	for (const c of d.fields) {
		layers.currents.addLayer(L.marker(coordLL(c.x, c.y), {
			icon: L.divIcon({ className: "", html: `<div class="emoji-pin current-pin">🌀</div>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
		}).bindTooltip("Aether current")
			.bindPopup(`<b>Aether current</b> <span class="nlvl">(${c.x}, ${c.y})</span>`));
	}
	const info = document.getElementById("aetherInfo");
	if (!d.fields.length && !d.quests.length) { info.innerHTML = `<span class="muted">none on this map (ARR zones have no currents)</span>`; return; }
	info.innerHTML = `${d.fields.length} field current${d.fields.length === 1 ? "" : "s"} (toggle layer to show)` +
		(d.quests.length ? `<br>+${d.quests.length} from quests:` + d.quests.map((q) => `<div class="aq">· ${q}</div>`).join("") : "");
}
