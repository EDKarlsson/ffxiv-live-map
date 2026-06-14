import { map } from "../core/map.js";
import { coordLL } from "../core/coords.js";
import { clusterPoints } from "../core/cluster.js";

// Monsters: A Realm Remapped-style per-mob toggles.
export let mobData = []; // /monsters payload for viewed map
export const mobLayers = new Map(); // mobId -> layerGroup
export const mobChecked = new Set(); // per-map ids; reset on map change

export function showMob(mob) {
	if (mobLayers.has(mob.id)) return;
	const g = L.layerGroup().addTo(map);
	for (const cl of clusterPoints(mob.points)) {
		g.addLayer(L.marker(coordLL(cl.x, cl.y), {
			icon: L.divIcon({
				className: "",
				html: `<div class="mob-dot${cl.fate ? " fate" : ""}">${cl.n > 1 ? cl.n : ""}</div>`,
				iconSize: [14, 14], iconAnchor: [7, 7],
			}),
		}).bindTooltip(`${mob.name} (Lv${mob.lmin}${mob.lmax !== mob.lmin ? "–" + mob.lmax : ""})`)
			.bindPopup(
				`<b>${mob.name}</b> <span class="nlvl">Lv${mob.lmin}${mob.lmax !== mob.lmin ? "–" + mob.lmax : ""} · ${mob.points.length} spawn points${cl.fate ? " · FATE" : ""}</span><br>` +
				`<a href="https://ffxivteamcraft.com/db/en/mob/${mob.id}" target="_blank">Teamcraft DB</a>`
			));
	}
	mobLayers.set(mob.id, g);
}

export function hideMob(id) {
	mobLayers.get(id)?.remove();
	mobLayers.delete(id);
}

export function renderMobList() {
	const q = document.getElementById("mobSearch").value.trim().toLowerCase();
	const list = document.getElementById("mobList");
	const rows = mobData.filter((m) => !q || m.name.toLowerCase().includes(q));
	list.innerHTML = rows.length
		? rows.map((m) =>
			`<div class="mrow"><label><input type="checkbox" data-id="${m.id}" ${mobChecked.has(m.id) ? "checked" : ""}> ` +
			`${m.name} <span class="lvl">Lv${m.lmin}${m.lmax !== m.lmin ? "–" + m.lmax : ""} ·${m.points.length}</span></label></div>`).join("")
		: `<span class="muted">${mobData.length ? "no match" : "no data for this map"}</span>`;
	[...list.querySelectorAll("input[type=checkbox]")].forEach((cb) => {
		cb.onchange = () => {
			const id = Number(cb.dataset.id);
			const mob = mobData.find((m) => m.id === id);
			if (cb.checked) { mobChecked.add(id); showMob(mob); }
			else { mobChecked.delete(id); hideMob(id); }
		};
	});
}

export async function loadMonsters(m) {
	mobLayers.forEach((g) => g.remove());
	mobLayers.clear();
	mobChecked.clear();
	mobData = await fetch(`/monsters?map=${m.id}`).then((r) => r.json());
	renderMobList();
}
