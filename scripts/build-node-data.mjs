/**
 * Extract gathering-node data + item names from Teamcraft's source JSON into
 * compact JSONs bundled with this app.
 *
 * Data is pulled from the ffxiv-teamcraft GitHub repo (staging branch) via
 * scripts/tc-data-source.mjs — always current, no local checkout needed.
 * Pass `--local <dir>` to read a local libs/data/src/lib/json instead, or
 * `--refresh` to bypass the cache.
 *
 * Key field notes:
 *   - nodes.json: type (0 Mineral/1 Rocky = MIN, 2 Tree/3 Vegetation = BTN,
 *     4/5 fishing — per apps/client pipes nodeTypeName/nodeTypeIcon), level,
 *     x/y already in in-game MAP coordinates, map id, spawns (ET hours),
 *     limited (timed), ephemeral, folklore (real Legendary signal — the
 *     `legendary` boolean is unreliable), items (item ids), hiddenItems.
 *   - items.json: item id -> localized names (we keep `en`).
 *
 * Usage: node scripts/build-node-data.mjs [--local <dir>] [--refresh] [--branch <ref>]
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadTcJson, dataSourceInfo } from "./tc-data-source.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../data");
mkdirSync(OUT_DIR, { recursive: true });
console.error(`[build-node-data] source: ${dataSourceInfo()}`);

const nodes = await loadTcJson("nodes.json");
const items = await loadTcJson("items.json");

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

// --- Treasure-map dig spots: treasures.json is a flat array of
// { id:"1.0", coords:{x,y}, map, partySize, item } where coords are already
// in-game map coords and `item` is the timeworn-map item id (e.g. 6688 =
// Timeworn Leather Map). Group per map; tier names ride the item-name map.
const treasures = await loadTcJson("treasures.json");
const treasuresByMap = {};
for (const t of treasures) {
	if (t.map === undefined || t.coords?.x === undefined || !t.item) continue;
	(treasuresByMap[t.map] ??= []).push({ x: t.coords.x, y: t.coords.y, item: t.item, party: t.partySize ?? 1 });
	itemIds.add(t.item);
}

// --- Regular fishing holes: fishing-spots.json (the FSH fishing-log spots —
// ARR+ shore/river fishing missing from nodes.json, which only carries the
// HW+ spearfishing nodes). { id, mapId, coords:{x,y} (in-game map coords),
// radius, level, fishes:[item ids] }
const fishingSpots = await loadTcJson("fishing-spots.json");
const fishingByMap = {};
for (const s of fishingSpots) {
	if (s.mapId === undefined || s.coords?.x === undefined) continue;
	(fishingByMap[s.mapId] ??= []).push({
		id: s.id,
		level: s.level ?? 0,
		x: s.coords.x,
		y: s.coords.y,
		radius: s.radius ?? 0,
		fishes: s.fishes ?? [],
	});
	for (const f of s.fishes ?? []) itemIds.add(f);
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

// Fish count as gatherable too: map each fish to its fishing spots so the
// Teamcraft list import and farming routes can jump to fishing holes.
// type 4 = Fishing (per the nodes.json type enum); `node` gets a string id
// so it can't collide with numeric gathering-node ids in route dedup.
for (const [mapId, spots] of Object.entries(fishingByMap)) {
	for (const s of spots) {
		for (const f of s.fishes) {
			(itemNodes[f] ??= []).push({ node: `fish-${s.id}`, map: Number(mapId), x: s.x, y: s.y, type: 4, level: s.level });
		}
	}
}

writeFileSync(join(__dirname, "../data/nodes.json"), JSON.stringify(out));
writeFileSync(join(__dirname, "../data/item-names.json"), JSON.stringify(names));
writeFileSync(join(__dirname, "../data/item-nodes.json"), JSON.stringify(itemNodes));
writeFileSync(join(__dirname, "../data/treasures.json"), JSON.stringify(treasuresByMap));
writeFileSync(join(__dirname, "../data/fishing-spots.json"), JSON.stringify(fishingByMap));
console.log(`nodes: ${Object.keys(out).length}, item names: ${itemIds.size}, gatherable items: ${Object.keys(itemNodes).length}`);
console.log(`treasure maps: ${Object.keys(treasuresByMap).length}, spots: ${Object.values(treasuresByMap).flat().length}; ` +
	`fishing maps: ${Object.keys(fishingByMap).length}, spots: ${Object.values(fishingByMap).flat().length}`);

// --- Monsters: monsters.json keyed by mob name id (joins mobs.json), each with
// positions [{map, zoneid, level, fate, x, y, z}] in in-game map coords.
// Reshape to per-map: { mapId: { mobId: { levels:[min,max], points:[[x,y,fate]] } } }
const monsters = await loadTcJson("monsters.json");
const mobNames = await loadTcJson("mobs.json");

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
const fates = await loadTcJson("fates.json");
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
const npcs = await loadTcJson("npcs.json");
const npcsByMap = {};
for (const [id, n] of Object.entries(npcs)) {
	const p = n.position;
	if (!p || p.map === undefined || !n.en) continue;
	(npcsByMap[p.map] ??= []).push({ id: Number(id), name: n.en, title: n.title?.en || "", x: p.x, y: p.y });
}
writeFileSync(join(__dirname, "../data/npcs.json"), JSON.stringify(npcsByMap));
console.log(`npc maps: ${Object.keys(npcsByMap).length}, npcs: ${Object.values(npcsByMap).flat().length}`);

// --- Maps index for the zone picker: id, name, region (from places.json) ------
const maps = await loadTcJson("maps.json");
const places = await loadTcJson("places.json");

// coords.mjs needs the full maps.json at runtime (sizeFactor/offsets/image per
// territory) for player-position conversion — emit it from the same fetch.
writeFileSync(join(OUT_DIR, "maps.json"), JSON.stringify(maps));

// Maps that actually have any of our content (nodes/monsters/fates/npcs).
// The `dungeon` flag in maps.json is empty, so "has data" is how we separate
// open-world zones from dungeon/raid/instance maps the user wants to filter out.
const contentMaps = new Set([
	...Object.values(out).map((n) => n.map),
	...Object.keys(byMap).map(Number),
	...Object.keys(fatesByMap).map(Number),
	...Object.keys(npcsByMap).map(Number),
	...Object.keys(treasuresByMap).map(Number),
	...Object.keys(fishingByMap).map(Number),
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
