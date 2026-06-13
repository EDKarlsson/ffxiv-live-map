import { map } from "../core/map.js";
import { state } from "../core/state.js";
import { coordLL } from "../core/coords.js";
import { viewMap, setFollow } from "../core/view-map.js";

// Teamcraft list import.
export let listData = null;
const listLayer = L.layerGroup().addTo(map);

export async function listImport() {
	const raw = document.getElementById("listId").value.trim();
	const id = (raw.match(/list\/([\w-]+)/) ?? [, raw])[1];
	if (!id) return;
	const info = document.getElementById("listInfo");
	info.textContent = "loading…";
	const res = await fetch(`/list?id=${encodeURIComponent(id)}`).then((r) => r.json());
	if (res.error) { info.textContent = `error: ${res.error}`; return; }
	listData = res;
	const gatherable = res.items.filter((i) => i.gatherable);
	const other = res.items.length - gatherable.length;
	info.textContent = `${res.name}: ${gatherable.length} material${gatherable.length === 1 ? "" : "s"} to gather` +
		(other ? ` (${other} crafted/bought hidden)` : "");
	renderList();
	highlightListNodes();
}

export function renderList() {
	const list = document.getElementById("listItems");
	if (!listData) { list.innerHTML = ""; return; }
	// Finals = the list's outputs (gear/crafts) — context only, not clickable
	// unless directly gatherable. Materials = Teamcraft's full ingredient
	// breakdown; we show the gatherable ones with remaining amounts.
	const finalRows = (listData.finals ?? []).map((it) =>
		`<div class="lrow nogather"><span class="lq">${it.amount}×</span> ${it.name}</div>`).join("");
	const mats = listData.items
		.map((it, i) => ({ it, i }))
		.filter(({ it }) => it.gatherable)
		.sort((a, b) => a.it.name.localeCompare(b.it.name));
	const matRows = mats.map(({ it, i }) => {
		const onMap = state.viewedMap && it.maps.includes(state.viewedMap.id);
		const left = Math.max(0, it.amount - it.done);
		return `<div class="lrow" data-i="${i}">` +
			`<span class="lq">${left}×</span> ${it.name}` +
			`${onMap ? " 📍" : ` <span class="lq">→ ${it.maps.length} map${it.maps.length > 1 ? "s" : ""}</span>`}</div>`;
	}).join("");
	list.innerHTML =
		(finalRows ? `<div class="lq" style="margin-top:4px">Final items</div>${finalRows}` : "") +
		`<div class="lq" style="margin-top:4px">To gather</div>` +
		(matRows || `<span class="muted">nothing gatherable in this list</span>`);
	[...list.querySelectorAll(".lrow[data-i]")].forEach((el) => {
		el.onclick = async () => {
			const it = listData.items[Number(el.dataset.i)];
			const n = it.nodes.find((x) => x.map === state.viewedMap?.id) ?? it.nodes[0];
			if (!n) return;
			if (n.map !== state.viewedMap?.id) {
				setFollow(false);
				await new Promise((r) => { fetch(`/map?id=${n.map}`).then((x) => x.json()).then((m) => { viewMap(m); setTimeout(r, 400); }); });
			}
			map.flyTo(coordLL(n.x, n.y), 2);
		};
	});
}

export function highlightListNodes() {
	listLayer.clearLayers();
	if (!listData || !state.viewedMap) return;
	// Group by node id so a node that yields several of the list's materials gets
	// ONE ring + one combined label (also collapses the crystal/shard nodes nearly
	// every item shares, instead of stacking dozens of rings).
	const byNode = new Map();
	for (const it of listData.items) {
		if (!it.gatherable) continue;
		for (const n of it.nodes) {
			if (n.map !== state.viewedMap.id) continue;
			const key = n.node ?? `${n.x},${n.y}`;
			const e = byNode.get(key) ?? { x: n.x, y: n.y, names: new Set() };
			e.names.add(it.name);
			byNode.set(key, e);
		}
	}
	for (const { x, y, names } of byNode.values()) {
		const ll = coordLL(x, y);
		listLayer.addLayer(L.marker(ll, {
			icon: L.divIcon({ className: "", html: `<div class="list-node-ring"></div>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
			interactive: false,
		}));
		listLayer.addLayer(L.marker(ll, {
			icon: L.divIcon({ className: "", html: `<div class="list-node-label">${[...names].join("<br>")}</div>`, iconSize: null }),
			interactive: false,
		}));
	}
}
