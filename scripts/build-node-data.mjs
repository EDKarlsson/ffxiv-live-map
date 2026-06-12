/**
 * Extract gathering-node data + item names from the Teamcraft checkout into
 * compact JSONs bundled with this app.
 *
 * Sources (ffxiv-teamcraft/libs/data/src/lib/json/):
 *   - nodes.json: type (0 Mineral/1 Rocky = MIN, 2 Tree/3 Vegetation = BTN,
 *     4/5 fishing — per apps/client pipes nodeTypeName/nodeTypeIcon), level,
 *     x/y already in in-game MAP coordinates, map id, spawns (ET hours),
 *     limited (timed), ephemeral, legendary, items (item ids), hiddenItems.
 *   - items.json: item id -> localized names (we keep `en`).
 *
 * Usage: node scripts/build-node-data.mjs [path-to-teamcraft-json-dir]
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TC_JSON =
	process.argv[2] ??
	join(__dirname, "../../ffxiv-teamcraft/ffxiv-teamcraft/libs/data/src/lib/json");

const nodes = JSON.parse(readFileSync(join(TC_JSON, "nodes.json"), "utf-8"));
const items = JSON.parse(readFileSync(join(TC_JSON, "items.json"), "utf-8"));

const out = {};
const itemIds = new Set();

for (const [id, n] of Object.entries(nodes)) {
	if (!n.items?.length || n.map === undefined || n.x === undefined) continue;
	out[id] = {
		type: n.type,
		level: n.level,
		map: n.map,
		zoneid: n.zoneid,
		x: n.x,
		y: n.y,
		radius: n.radius ?? 0,
		limited: !!n.limited,
		ephemeral: !!n.ephemeral,
		// TC's `legendary` boolean is unreliable (set on 195/225 timed nodes;
		// node 211 Spruce Log is flagged legendary but GarlandTools says Unspoiled).
		// Real Legendary nodes are folklore-gated — use folklore presence instead.
		// Verified vs GarlandTools 2026-06-12.
		legendary: !!n.folklore,
		spawns: n.spawns ?? [],
		duration: n.duration ?? 0,
		items: n.items,
		hiddenItems: n.hiddenItems ?? [],
	};
	for (const i of [...n.items, ...(n.hiddenItems ?? [])]) itemIds.add(i);
}

const names = {};
for (const id of itemIds) {
	names[id] = items[id]?.en ?? `#${id}`;
}

// Full id->en name map (for Teamcraft list import, which can reference any item).
const allNames = {};
for (const [id, v] of Object.entries(items)) if (v.en) allNames[id] = v.en;
writeFileSync(join(__dirname, "../data/item-names-all.json"), JSON.stringify(allNames));
console.log(`all item names: ${Object.keys(allNames).length}`);

// Reverse index: itemId -> [{node, map, x, y, type, level}] so a Teamcraft list
// can be mapped to where each required item is gathered.
const itemNodes = {};
for (const [id, n] of Object.entries(out)) {
	for (const itemId of [...n.items, ...n.hiddenItems]) {
		(itemNodes[itemId] ??= []).push({ node: Number(id), map: n.map, x: n.x, y: n.y, type: n.type, level: n.level });
	}
}

writeFileSync(join(__dirname, "../data/nodes.json"), JSON.stringify(out));
writeFileSync(join(__dirname, "../data/item-names.json"), JSON.stringify(names));
writeFileSync(join(__dirname, "../data/item-nodes.json"), JSON.stringify(itemNodes));
console.log(`nodes: ${Object.keys(out).length}, item names: ${itemIds.size}, gatherable items: ${Object.keys(itemNodes).length}`);

// --- Monsters: monsters.json keyed by mob name id (joins mobs.json), each with
// positions [{map, zoneid, level, fate, x, y, z}] in in-game map coords.
// Reshape to per-map: { mapId: { mobId: { levels:[min,max], points:[[x,y,fate]] } } }
const monsters = JSON.parse(readFileSync(join(TC_JSON, "monsters.json"), "utf-8"));
const mobNames = JSON.parse(readFileSync(join(TC_JSON, "mobs.json"), "utf-8"));

const byMap = {};
const usedMobs = new Set();
for (const [mobId, m] of Object.entries(monsters)) {
	for (const p of m.positions ?? []) {
		if (p.map === undefined || p.x === undefined) continue;
		const name = mobNames[mobId]?.en;
		if (!name) continue; // unnamed entries are useless on a map
		usedMobs.add(mobId);
		byMap[p.map] ??= {};
		const e = (byMap[p.map][mobId] ??= { lmin: p.level ?? 0, lmax: p.level ?? 0, points: [] });
		e.lmin = Math.min(e.lmin, p.level ?? 0);
		e.lmax = Math.max(e.lmax, p.level ?? 0);
		e.points.push([p.x, p.y, p.fate ? 1 : 0]);
	}
}
const mobNamesOut = {};
for (const id of usedMobs) mobNamesOut[id] = mobNames[id].en;

// Reverse index: mobId -> [mapId, ...] so the hunting-log UI can jump to a target.
const mobMaps = {};
for (const [mapId, mobs] of Object.entries(byMap)) {
	for (const mobId of Object.keys(mobs)) (mobMaps[mobId] ??= []).push(Number(mapId));
}

writeFileSync(join(__dirname, "../data/monsters.json"), JSON.stringify(byMap));
writeFileSync(join(__dirname, "../data/mob-names.json"), JSON.stringify(mobNamesOut));
writeFileSync(join(__dirname, "../data/mob-maps.json"), JSON.stringify(mobMaps));
console.log(`monster maps: ${Object.keys(byMap).length}, named mobs: ${usedMobs.size}, mob->maps: ${Object.keys(mobMaps).length}`);

// --- FATEs: fates.json entries with position {map, x, y}; icon is a tex path
// whose 6-digit id maps to https://xivapi.com/i/060000/<id>.png -----------------
const fates = JSON.parse(readFileSync(join(TC_JSON, "fates.json"), "utf-8"));
const fatesByMap = {};
for (const [id, f] of Object.entries(fates)) {
	const p = f.position;
	const name = f.name?.en;
	if (!p || p.map === undefined || !name) continue;
	const iconId = (f.icon?.match(/(\d{6})\.tex/) ?? [])[1] ?? "060501";
	(fatesByMap[p.map] ??= []).push({ id: Number(id), name, level: f.level, icon: iconId, x: p.x, y: p.y });
}
writeFileSync(join(__dirname, "../data/fates.json"), JSON.stringify(fatesByMap));
console.log(`fate maps: ${Object.keys(fatesByMap).length}, fates: ${Object.values(fatesByMap).flat().length}`);

// --- NPCs: npcs.json entries with en name + position --------------------------
const npcs = JSON.parse(readFileSync(join(TC_JSON, "npcs.json"), "utf-8"));
const npcsByMap = {};
for (const [id, n] of Object.entries(npcs)) {
	const p = n.position;
	if (!p || p.map === undefined || !n.en) continue;
	(npcsByMap[p.map] ??= []).push({ id: Number(id), name: n.en, title: n.title?.en || "", x: p.x, y: p.y });
}
writeFileSync(join(__dirname, "../data/npcs.json"), JSON.stringify(npcsByMap));
console.log(`npc maps: ${Object.keys(npcsByMap).length}, npcs: ${Object.values(npcsByMap).flat().length}`);

// --- Maps index for the zone picker: id, name, region (from places.json) ------
const maps = JSON.parse(readFileSync(join(TC_JSON, "maps.json"), "utf-8"));
const places = JSON.parse(readFileSync(join(TC_JSON, "places.json"), "utf-8"));

// Maps that actually have any of our content (nodes/monsters/fates/npcs).
// The `dungeon` flag in maps.json is empty, so "has data" is how we separate
// open-world zones from dungeon/raid/instance maps the user wants to filter out.
const contentMaps = new Set([
	...Object.values(out).map((n) => n.map),
	...Object.keys(byMap).map(Number),
	...Object.keys(fatesByMap).map(Number),
	...Object.keys(npcsByMap).map(Number),
]);

let mapsIndex = Object.values(maps)
	.filter((m) => m.image && m.placename_id)
	.map((m) => ({
		id: m.id,
		name: places[m.placename_id]?.en || `Map #${m.id}`,
		sub: m.placename_sub_id ? places[m.placename_sub_id]?.en || "" : "",
		region: places[m.region_id]?.en || "Other",
		territory: m.territory_id,
		index: m.index,
		hasData: contentMaps.has(m.id),
	}));

// Drop exact duplicates (same name + sub + floor); keep the one with content,
// else the lowest id. These are alt/instanced copies of the same map.
const dedup = new Map();
for (const m of mapsIndex) {
	const key = `${m.name}|${m.sub}|${m.index}`;
	const prev = dedup.get(key);
	if (!prev || (m.hasData && !prev.hasData) || (m.hasData === prev.hasData && m.id < prev.id)) dedup.set(key, m);
}
mapsIndex = [...dedup.values()];

writeFileSync(join(__dirname, "../data/maps-index.json"), JSON.stringify(mapsIndex));
console.log(`maps index: ${mapsIndex.length} (with content: ${mapsIndex.filter((m) => m.hasData).length})`);
