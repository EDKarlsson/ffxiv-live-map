import { map, vectorRenderer } from "../core/map.js";
import { state } from "../core/state.js";
import { coordLL } from "../core/coords.js";
import { tour, dist } from "../core/tsp.js";
import { nodeData } from "../layers/nodes.js";
import { listData } from "./list-import.js";

// Farming route layer + planner. The TSP solver itself lives in core/tsp.js.
export const routeLayer = L.layerGroup().addTo(map);

export function planRoute() {
	routeLayer.clearLayers();
	const src = document.getElementById("routeSource").value;
	const info = document.getElementById("routeInfo");
	if (!state.viewedMap) { info.textContent = "load a map first"; return; }
	let pts = [];
	let listCover = null;
	if (src === "list") {
		if (!listData) { info.textContent = "import a Teamcraft list first"; return; }
		// A material's cluster respawns faster than you can deplete it, so you never
		// need a SECOND cluster of the same material. Pick the fewest clusters that
		// still cover every needed material (greedy set cover) and route only those.
		const clusters = new Map(); // nodeKey -> { x, y, mats:Set }
		const needed = new Set();
		for (const it of listData.items) {
			if (!it.gatherable) continue;
			let onMap = false;
			for (const n of it.nodes ?? []) {
				if (n.map !== state.viewedMap.id) continue;
				onMap = true;
				const key = n.node ?? `${n.x},${n.y}`;
				const c = clusters.get(key) ?? { x: n.x, y: n.y, mats: new Set() };
				c.mats.add(it.id);
				clusters.set(key, c);
			}
			if (onMap) needed.add(it.id);
		}
		const pool = [...clusters.values()];
		const covered = new Set();
		let from = (state.playerMap && state.viewedMap && state.playerMap.id === state.viewedMap.id && state.lastPos)
			? { x: state.lastPos.mapX, y: state.lastPos.mapY } : null;
		while (covered.size < needed.size && pool.length) {
			let bi = -1, bGain = 0, bDist = Infinity;
			pool.forEach((c, i) => {
				const gain = [...c.mats].filter((m) => !covered.has(m)).length;
				if (!gain) return;
				const d = from ? dist(from, c) : 0;
				if (gain > bGain || (gain === bGain && d < bDist)) { bGain = gain; bDist = d; bi = i; }
			});
			if (bi < 0) break;
			const chosen = pool.splice(bi, 1)[0];
			chosen.mats.forEach((m) => covered.add(m));
			pts.push({ x: chosen.x, y: chosen.y });
			from = chosen;
		}
		listCover = { stops: pts.length, mats: needed.size };
	} else {
		pts = nodeData.filter((n) => src === "all" ? n.type <= 3 : src === "min" ? n.type <= 1 : (n.type === 2 || n.type === 3))
			.map((n) => ({ x: n.x, y: n.y }));
	}
	if (pts.length < 2) { info.textContent = `need 2+ nodes (found ${pts.length})`; return; }
	const start = (state.playerMap && state.viewedMap && state.playerMap.id === state.viewedMap.id && state.lastPos)
		? { x: state.lastPos.mapX, y: state.lastPos.mapY, isStart: true } : null;
	const ordered = tour(pts, start);
	const latlngs = ordered.map((p) => coordLL(p.x, p.y));
	routeLayer.addLayer(L.polyline(latlngs, { renderer: vectorRenderer, color: "#2ecc71", weight: 2.5, opacity: 0.85, dashArray: "6 6" }));
	let total = 0;
	for (let i = 1; i < ordered.length; i++) total += dist(ordered[i - 1], ordered[i]);
	ordered.forEach((p, i) => {
		if (p.isStart) return;
		const n = start ? i : i + 1;
		routeLayer.addLayer(L.marker(coordLL(p.x, p.y), {
			icon: L.divIcon({ className: "", html: `<div class="route-num">${n}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
			interactive: false,
		}));
	});
	info.textContent = (listCover ? `${listCover.stops} stop${listCover.stops === 1 ? "" : "s"} cover ${listCover.mats} material${listCover.mats === 1 ? "" : "s"}` : `${pts.length} stops`) + ` · ~${Math.round(total)} map-units${start ? " · from you" : ""}`;
}

export function clearRoute() {
	routeLayer.clearLayers();
	document.getElementById("routeInfo").textContent = "";
}
