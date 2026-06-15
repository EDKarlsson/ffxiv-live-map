import { map } from "../core/map.js";
import { state } from "../core/state.js";
import { coordLL } from "../core/coords.js";
import { viewMap, setFollow } from "../core/view-map.js";

// Find material: search item->nodes index, click a result to jump + ring its nodes.
export const matLayer = L.layerGroup().addTo(map);
let matTimer = null;

export async function matJump(hit) {
	// Prefer a node on the viewed map; otherwise go to the item's first map.
	const n = hit.nodes.find((x) => x.map === state.viewedMap?.id) ?? hit.nodes[0];
	if (!n) return;
	if (n.map !== state.viewedMap?.id) {
		setFollow(false);
		await viewMap(await fetch(`/map?id=${n.map}`).then((x) => x.json()));
	}
	// Ring every node of this item on the (now) viewed map.
	matLayer.clearLayers();
	for (const x of hit.nodes.filter((x) => x.map === state.viewedMap.id)) {
		matLayer.addLayer(L.marker(coordLL(x.x, x.y), {
			icon: L.divIcon({ className: "", html: `<div class="list-node-ring"></div>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
			interactive: false,
		}));
	}
	map.flyTo(coordLL(n.x, n.y), 2);
}

function renderMatHits(hits) {
	const el = document.getElementById("matList");
	el.innerHTML = hits.length
		? hits.map((h, i) =>
			`<div class="mat" data-i="${i}">${h.name} <span class="mq">· ${h.nodes.length} spot${h.nodes.length === 1 ? "" : "s"}, ${h.maps.length} map${h.maps.length === 1 ? "" : "s"}${h.maps.includes(state.viewedMap?.id) ? " · 📍 here" : ""}</span></div>`).join("")
		: `<span class="muted">no gatherable item matches</span>`;
	[...el.querySelectorAll(".mat")].forEach((row) => {
		row.onclick = () => matJump(hits[Number(row.dataset.i)]);
	});
}

// Debounced #matSearch handler (wired in app.js).
export function matSearchInput() {
	clearTimeout(matTimer);
	matTimer = setTimeout(async () => {
		const q = document.getElementById("matSearch").value.trim();
		if (q.length < 2) { document.getElementById("matList").innerHTML = `<span class="muted">type 2+ chars — click a result to jump</span>`; matLayer.clearLayers(); return; }
		renderMatHits(await fetch(`/find-material?q=${encodeURIComponent(q)}`).then((r) => r.json()));
	}, 250);
}
