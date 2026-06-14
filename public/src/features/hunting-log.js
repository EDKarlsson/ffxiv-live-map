import { map } from "../core/map.js";
import { state } from "../core/state.js";
import { coordLL } from "../core/coords.js";
import { mobData, mobChecked, mobLayers, showMob, renderMobList } from "../layers/monsters.js";
import { viewMap, setFollow } from "../core/view-map.js";

export let huntData = null;

export async function buildHunt() {
	huntData = await fetch("/hunting-log").then((r) => r.json());
	const sel = document.getElementById("huntClass");
	sel.innerHTML = Object.keys(huntData).map((c) => `<option${c === "Maelstrom" ? " selected" : ""}>${c}</option>`).join("");
	sel.onchange = renderHunt;
	renderHunt();
}

export function renderHunt() {
	const cls = document.getElementById("huntClass").value;
	const entries = huntData[cls] ?? [];
	const byRank = {};
	for (const e of entries) (byRank[e.rank] ??= []).push(...e.targets);
	const list = document.getElementById("huntList");
	list.innerHTML = Object.keys(byRank).sort((a, b) => a - b).map((rank) =>
		`<div class="rank">Rank ${rank}</div>` + byRank[rank].map((t) => {
			const here = state.viewedMap && t.maps.includes(state.viewedMap.id);
			return `<div class="htgt" data-mob="${t.mobId}" title="${t.zones.join(", ")}">` +
				`<span class="hcount">${t.count}×</span> ${t.name}${here ? " 📍" : ""}</div>`;
		}).join("")).join("");
	[...list.querySelectorAll(".htgt")].forEach((el) => {
		el.onclick = () => gotoMob(Number(el.dataset.mob));
	});
}

async function gotoMob(mobId) {
	let m = state.viewedMap;
	if (!huntTargetMaps(mobId).includes(m?.id)) {
		const maps = huntTargetMaps(mobId);
		if (!maps.length) return;
		m = await fetch(`/map?id=${maps[0]}`).then((r) => r.json());
		setFollow(false);
		await viewMap(m);
	}
	const mob = mobData.find((x) => x.id === mobId);
	if (mob) {
		if (!mobChecked.has(mobId)) { mobChecked.add(mobId); showMob(mob); renderMobList(); }
		if (mob.points?.length) {
			map.flyTo(coordLL(mob.points[0][0], mob.points[0][1]), 1);
			mobLayers.get(mobId)?.getLayers()[0]?.openPopup();
		}
	}
}

function huntTargetMaps(mobId) {
	for (const entries of Object.values(huntData ?? {}))
		for (const e of entries) for (const t of e.targets) if (t.mobId === mobId) return t.maps;
	return [];
}
