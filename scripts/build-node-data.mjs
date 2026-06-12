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
