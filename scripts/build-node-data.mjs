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
		legendary: !!n.legendary,
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

writeFileSync(join(__dirname, "../data/nodes.json"), JSON.stringify(out));
writeFileSync(join(__dirname, "../data/item-names.json"), JSON.stringify(names));
console.log(`nodes: ${Object.keys(out).length}, item names: ${itemIds.size}`);

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

writeFileSync(join(__dirname, "../data/monsters.json"), JSON.stringify(byMap));
writeFileSync(join(__dirname, "../data/mob-names.json"), JSON.stringify(mobNamesOut));
console.log(`monster maps: ${Object.keys(byMap).length}, named mobs: ${usedMobs.size}`);

// --- Maps index for the zone picker: id, name, region (from places.json) ------
const maps = JSON.parse(readFileSync(join(TC_JSON, "maps.json"), "utf-8"));
const places = JSON.parse(readFileSync(join(TC_JSON, "places.json"), "utf-8"));
const mapsIndex = Object.values(maps)
	.filter((m) => m.image && m.placename_id)
	.map((m) => ({
		id: m.id,
		name: places[m.placename_id]?.en || `Map #${m.id}`,
		sub: m.placename_sub_id ? places[m.placename_sub_id]?.en || "" : "",
		region: places[m.region_id]?.en || "Other",
		territory: m.territory_id,
		index: m.index,
	}));
writeFileSync(join(__dirname, "../data/maps-index.json"), JSON.stringify(mapsIndex));
console.log(`maps index: ${mapsIndex.length}`);
