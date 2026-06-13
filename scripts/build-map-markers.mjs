/**
 * Build the in-game map-marker dataset (labels, POI icons, zone links) from
 * XIVAPI v2's MapMarker sheet — the same data that draws the official map's
 * place names, exit arrows, and specialty icons (market board, repairs, …).
 *
 * Sheet shape (probed 2026-06-12):
 *   - MapMarker has SUBROWS: row_id = a "marker range", subrow = one marker.
 *   - Map.MapMarkerRange ties each map to its range (several maps can share).
 *   - X/Y are 2048-image PIXEL coords (no size_factor conversion needed).
 *   - DataType: 0 = plain marker/label, 1 = map link (DataKey = target Map
 *     row id), 3 = aetheryte (DataKey -> Aetheryte), 4 = aethernet shard.
 *   - Icon id 0 + empty label = invisible row (skipped). Some labels are
 *     icon-less text, some icons are label-less.
 *   - The `rows=` query param only returns subrow 0, so we walk the whole
 *     sheet with the `after=row:subrow` cursor instead (~500/page).
 *
 * Output: data/map-markers.json =
 *   { mapId: [ { x, y (pixels), icon, label, type, target? } ] }
 *
 * Usage: node scripts/build-map-markers.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadTcJson } from "./tc-data-source.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(__dirname, "../data"), { recursive: true });

const API = "https://v2.xivapi.com/api";

// --- Map -> MapMarkerRange (and back) ---------------------------------------------
const tcMaps = await loadTcJson("maps.json"); // our map id space
const knownMaps = new Set(Object.keys(tcMaps).map(Number));

const rangeToMaps = {};
{
	let after = 0;
	for (;;) {
		const j = await fetch(`${API}/sheet/Map?version=latest&limit=500&after=${after}&fields=MapMarkerRange`).then((r) => r.json());
		if (!j.rows?.length) break;
		for (const row of j.rows) {
			const range = row.fields.MapMarkerRange;
			if (range && knownMaps.has(row.row_id)) (rangeToMaps[range] ??= []).push(row.row_id);
		}
		after = j.rows.at(-1).row_id;
		if (j.rows.length < 500) break;
	}
}
console.error(`[map-markers] ${Object.keys(rangeToMaps).length} marker ranges referenced by known maps`);

// --- Walk the whole MapMarker sheet (subrow cursor) -------------------------------
const FIELDS = encodeURIComponent("X,Y,Icon.id,PlaceNameSubtext.Name,DataType,DataKey.row_id");
const out = {};
let cursor = "0:0", subrows = 0, kept = 0, pages = 0;
for (;;) {
	const j = await fetch(`${API}/sheet/MapMarker?version=latest&limit=500&after=${cursor}&fields=${FIELDS}`).then((r) => r.json());
	if (!j.rows?.length) break;
	pages++;
	for (const r of j.rows) {
		subrows++;
		const maps = rangeToMaps[r.row_id];
		if (!maps) continue;
		const f = r.fields;
		const icon = f.Icon?.id ?? 0;
		const label = f.PlaceNameSubtext?.fields?.Name ?? "";
		if (!icon && !label) continue; // invisible
		const m = { x: f.X, y: f.Y, icon, label, type: f.DataType ?? 0 };
		if (m.type === 1 && f.DataKey?.row_id) m.target = f.DataKey.row_id;
		for (const mapId of maps) (out[mapId] ??= []).push(m);
		kept++;
	}
	const last = j.rows.at(-1);
	cursor = `${last.row_id}:${last.subrow_id}`;
	if (j.rows.length < 500) break;
}

writeFileSync(join(__dirname, "../data/map-markers.json"), JSON.stringify(out));
console.log(`map-markers: ${kept} markers on ${Object.keys(out).length} maps (walked ${subrows} subrows, ${pages} pages)`);
