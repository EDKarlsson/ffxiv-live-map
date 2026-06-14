import { map, vectorRenderer } from "../core/map.js";
import { layers } from "../core/layers.js";
import { coordLL } from "../core/coords.js";
import { iconUrl, TYPE_NAMES } from "../core/icons.js";
import { nodeStatus, fmtMins, etHoursNow } from "../core/eorzea-time.js";

export let nodeData = []; // gathering nodes on the viewed map (for route planning)
let timedMarkers = []; // [{ n, mk, ll }]

// ET clock + timed-node panel; called every second (interval wired in app.js).
export function tick() {
	const cur = etHoursNow();
	document.getElementById("etClock").textContent =
		`ET ${String(Math.floor(cur)).padStart(2, "0")}:${String(Math.floor(cur * 60 % 60)).padStart(2, "0")}`;
	const rows = timedMarkers.map(({ n, mk, ll }) => {
		const st = nodeStatus(n);
		mk.setOpacity(st.up ? 1 : 0.45);
		const el = mk.getElement();
		if (el) el.classList.toggle("node-up", st.up);
		return { n, ll, st };
	}).sort((a, b) => (a.st.up === b.st.up) ? a.st.secsLeft - b.st.secsLeft : (a.st.up ? -1 : 1));
	document.getElementById("timedPanel").innerHTML = rows.map(({ n, st }, i) =>
		`<div class="trow ${st.up ? "up" : "down"}" data-i="${i}">` +
		`${st.up ? "● UP" : "○"} Lv${n.level} ${n.items[0]?.name ?? "?"} — ${st.up ? `${fmtMins(st.secsLeft)} left` : `in ${fmtMins(st.secsLeft)}`}</div>`
	).join("") || `<span class="muted">none on this map</span>`;
	[...document.querySelectorAll("#timedPanel .trow")].forEach((el) => {
		el.onclick = () => {
			const { ll, n } = rows[Number(el.dataset.i)];
			map.flyTo(ll, 1);
			timedMarkers.find((t) => t.n === n)?.mk.openPopup();
		};
	});
}

function nodePopup(n) {
	const gt = (i) => `<a href="https://www.garlandtools.org/db/#item/${i.id}" target="_blank">${i.name}</a>`;
	const items = n.items.map(gt).join(", ");
	const hidden = n.hiddenItems.length ? `<br><span class="nlvl">Hidden: ${n.hiddenItems.map(gt).join(", ")}</span>` : "";
	let timed = "";
	if (n.spawns.length) {
		const st = nodeStatus(n);
		timed = `<br><span class="timed">Spawns ET ${n.spawns.map((h) => `${h}:00`).join(", ")} for ${n.duration / 60} ET h${n.ephemeral ? " (ephemeral)" : ""}${n.legendary ? " (legendary)" : ""}<br>` +
			(st.up ? `● UP — ${fmtMins(st.secsLeft)} real time left` : `○ next window in ${fmtMins(st.secsLeft)} (real)`) + `</span>`;
	}
	return `<b>${TYPE_NAMES[n.type]}</b> <span class="nlvl">Lv${n.level} · (${n.x}, ${n.y})</span><br>${items}${hidden}${timed}`;
}

export async function loadNodes(m) {
	// Clear only this loader's layers — clearing all of them raced the other
	// loaders (a fast /fates or /vistas response got wiped by this clear).
	[layers.min, layers.btn, layers.fsh, layers.areas].forEach((l) => l.clearLayers());
	timedMarkers = [];
	const nodes = await fetch(`/nodes?map=${m.id}`).then((r) => r.json());
	nodeData = nodes;
	for (const n of nodes) {
		const ll = coordLL(n.x, n.y);
		const mk = L.marker(ll, {
			icon: L.divIcon({ className: "node-icon", html: `<img src="${iconUrl(n)}">`, iconSize: [26, 26], iconAnchor: [13, 13] }),
		}).bindPopup(() => nodePopup(n));
		if (n.spawns.length) timedMarkers.push({ n, mk, ll });
		const group = n.type <= 1 ? layers.min : n.type <= 3 ? layers.btn : layers.fsh;
		group.addLayer(mk);
		if (n.radius > 0) {
			const radius = n.radius * (m.size_factor / 100);
			const color = n.type <= 1 ? "#ff9f1c" : n.type <= 3 ? "#39d353" : "#4cc9f0";
			// Dark casing underneath so the bright ring reads on any terrain.
			layers.areas.addLayer(L.circle(ll, {
				radius, renderer: vectorRenderer, color: "#000", weight: 5, opacity: 0.45,
				fill: false, interactive: false,
			}));
			layers.areas.addLayer(L.circle(ll, {
				radius, renderer: vectorRenderer, color,
				weight: 3, opacity: 1, dashArray: "6 5", lineCap: "round",
				fillColor: color, fillOpacity: 0.18, interactive: false,
			}));
		}
	}
	document.getElementById("nodeCount").textContent = `${nodes.length} gathering nodes`;
}
