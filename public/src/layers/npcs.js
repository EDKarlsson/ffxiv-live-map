import { map } from "../core/map.js";
import { layers } from "../core/layers.js";
import { coordLL } from "../core/coords.js";
import { iconAsset } from "../core/icons.js";

// NPCs: search-driven (23k total, render only matches) + role toggles.
export let npcData = [];
const npcRoleLayer = L.layerGroup().addTo(map);

function npcMarker(n, cls = "") {
	// Wiki pages are name-keyed (spaces -> underscores; apostrophes pass through
	// fine, e.g. N'nmulika). Not every generic NPC has a page, but quest
	// givers/vendors essentially always do.
	const wiki = `https://ffxiv.consolegameswiki.com/wiki/${encodeURIComponent(n.name.replace(/ /g, "_"))}`;
	// Role markers use real game icons: 071341 = quest "!", 060412 = Shop (named
	// by the MapSymbol sheet). Search hits keep the plain blue dot.
	const icon = cls === "quest"
		? L.divIcon({ className: "node-icon npc-role-icon", html: `<img src="${iconAsset(71341)}">`, iconSize: [22, 22], iconAnchor: [11, 11] })
		: cls === "vendor"
			? L.divIcon({ className: "node-icon npc-role-icon", html: `<img src="${iconAsset(60412)}">`, iconSize: [22, 22], iconAnchor: [11, 11] })
			: L.divIcon({ className: "", html: `<div class="npc-dot"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
	return L.marker(coordLL(n.x, n.y), { icon })
		.bindTooltip(`${n.name}${n.title ? ` — ${n.title}` : ""}`)
		.bindPopup(`<b>${n.name}</b>${n.title ? ` <span class="nlvl">${n.title}</span>` : ""}<br>` +
			`<span class="nlvl">(${n.x}, ${n.y})${n.role ? ` · ${n.role.includes("q") ? "quest giver " : ""}${n.role.includes("s") ? "vendor" : ""}` : ""}</span><br>` +
			`<a href="${wiki}" target="_blank">Wiki</a> · ` +
			`<a href="https://ffxivteamcraft.com/db/en/npc/${n.id}" target="_blank">Teamcraft DB</a> · ` +
			`<a href="https://www.garlandtools.org/db/#npc/${n.id}" target="_blank">GarlandTools</a>`);
}

export function renderNpcs() {
	layers.npcs.clearLayers();
	const q = document.getElementById("npcSearch").value.trim().toLowerCase();
	const info = document.getElementById("npcInfo");
	if (q.length < 2) { info.textContent = `${npcData.length} NPCs on this map — type 2+ chars`; return; }
	const hits = npcData.filter((n) => n.name.toLowerCase().includes(q) || n.title.toLowerCase().includes(q));
	for (const n of hits.slice(0, 100)) layers.npcs.addLayer(npcMarker(n));
	info.textContent = `${hits.length} match${hits.length === 1 ? "" : "es"}${hits.length > 100 ? " (showing 100)" : ""}`;
	if (hits.length === 1) map.flyTo(coordLL(hits[0].x, hits[0].y), 1);
}

// Role toggles: gold = quest giver, green = vendor (an NPC with both shows as
// quest giver — gold wins; the popup lists both roles).
export function renderNpcRoles() {
	npcRoleLayer.clearLayers();
	const wantQ = document.getElementById("npcQuest").checked;
	const wantS = document.getElementById("npcVendor").checked;
	if (!wantQ && !wantS) return;
	for (const n of npcData) {
		if (!n.role) continue;
		const isQ = n.role.includes("q"), isS = n.role.includes("s");
		if ((isQ && wantQ) || (isS && wantS)) npcRoleLayer.addLayer(npcMarker(n, isQ ? "quest" : "vendor"));
	}
}

export async function loadNpcs(m) {
	layers.npcs.clearLayers();
	npcData = await fetch(`/npcs?map=${m.id}`).then((r) => r.json());
	renderNpcs();
	renderNpcRoles();
}
