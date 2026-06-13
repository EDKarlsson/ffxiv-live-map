/**
 * Build the vista (sightseeing log) + aether-current datasets from XIVAPI v2
 * (boilmaster). These have no Teamcraft JSON equivalent, but unlike mob/node
 * spawns they are static game-sheet placements, so v2 *does* have coordinates.
 *
 * Vistas — `Adventure` sheet: one row per sightseeing-log entry with a `Level`
 * ref (raw world X/Z + Map), ET window (MinTime/MaxTime, encoded HMM, e.g.
 * 1159 = ET 11:59), required Emote, and PlaceName. NOTE: the weather
 * requirement is scripted, not in any sheet — popups say so.
 *
 * Aether currents — no single sheet has field-current positions. The join
 * (probed 2026-06-12): EObjName rows named "aether current" share row_ids with
 * EObj; Level rows with Object=<that id> carry raw X/Z + Map. Quest-locked
 * currents are AetherCurrent rows with Quest != 0 — no field position, so we
 * emit quest name + issuer map instead. ARR zones have zero currents (flying
 * there is MSQ-gated, no attunement) — the layer is future-proofing for HW+.
 *
 * Completeness note: AetherCurrent has 448 rows but only ~300 are real (the
 * rest are quest-less padding with no EObj). The 153 EObj-named currents ARE
 * the full field set — verified against consolegameswiki "Aether Currents"
 * for Coerthas Western Highlands and The Dravanian Forelands (4 field + 5
 * quest each, coords match within 0.1), 2026-06-12. HW zones really do have
 * only 4 field currents each; 10-field zones start later.
 *
 * Raw world floats -> in-game map coords uses the same community formula as
 * src/coords.mjs, with offsets/size_factor from Teamcraft's maps.json
 * (fetched via tc-data-source so this script is standalone).
 *
 * NPC roles — vendors are the keys of Teamcraft's shops-by-npc.json; quest
 * givers are the distinct Quest.IssuerStart ENpcResident ids (XIVAPI v2).
 * Both use the same 1xxxxxx ENpc id space as npcs.json.
 *
 * Output:
 *   data/vistas.json          { mapId: [{name, place, x, y, minTime, maxTime, emote}] }
 *   data/aether-currents.json { mapId: { fields: [{x, y}], quests: [name] } }
 *   data/npc-roles.json       { npcId: "q" | "s" | "qs" }  (quest giver / shop)
 *
 * Usage: node scripts/build-extra-layers.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadTcJson } from "./tc-data-source.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(__dirname, "../data"), { recursive: true });

const API = "https://v2.xivapi.com/api";

// Same formula as src/coords.mjs toMapCoord (kept inline: scripts must not
// depend on data/ existing yet).
const maps = await loadTcJson("maps.json");
function toMapCoord(raw, offset, sizeFactor) {
	const c = sizeFactor / 100;
	return (41 / c) * (((raw + offset) * c + 1024) / 2048) + 1;
}
function mapXY(mapId, rawX, rawZ) {
	const m = maps[mapId];
	if (!m) return null;
	return {
		x: Math.round(toMapCoord(rawX, m.offset_x, m.size_factor) * 10) / 10,
		y: Math.round(toMapCoord(rawZ, m.offset_y, m.size_factor) * 10) / 10,
	};
}

/** Fetch every row of a sheet (paginated via `after`). */
async function sheetAll(sheet, fields) {
	const rows = [];
	let after = 0;
	for (;;) {
		const url = `${API}/sheet/${sheet}?version=latest&limit=500&after=${after}&fields=${encodeURIComponent(fields)}`;
		const j = await fetch(url).then((r) => r.json());
		if (!j.rows?.length) break;
		rows.push(...j.rows);
		after = j.rows.at(-1).row_id;
		if (j.rows.length < 500) break;
	}
	return rows;
}

/** Fetch every result of a search query (paginated via `cursor`). */
async function searchAll(sheet, query, fields) {
	const results = [];
	let url = `${API}/search?sheets=${sheet}&query=${encodeURIComponent(query)}&limit=500&fields=${encodeURIComponent(fields)}`;
	for (;;) {
		const j = await fetch(url).then((r) => r.json());
		results.push(...(j.results ?? []));
		if (!j.next) break;
		url = `${API}/search?cursor=${j.next}&limit=500`;
	}
	return results;
}

// --- Vistas -------------------------------------------------------------------
const adventures = await sheetAll(
	"Adventure",
	"Name,PlaceName.Name,Emote.Name,MinTime,MaxTime,Level.X,Level.Z,Level.Map.row_id"
);

const vistasByMap = {};
let vistaCount = 0;
for (const row of adventures) {
	const f = row.fields;
	const lvl = f.Level?.fields;
	const mapId = lvl?.Map?.row_id;
	if (!f.Name || mapId === undefined) continue;
	const pos = mapXY(mapId, lvl.X, lvl.Z);
	if (!pos) continue;
	(vistasByMap[mapId] ??= []).push({
		id: row.row_id,
		name: f.Name,
		place: f.PlaceName?.fields?.Name ?? "",
		x: pos.x,
		y: pos.y,
		minTime: f.MinTime ?? 0,
		maxTime: f.MaxTime ?? 0,
		emote: f.Emote?.fields?.Name ?? "",
	});
	vistaCount++;
}
writeFileSync(join(__dirname, "../data/vistas.json"), JSON.stringify(vistasByMap));
console.log(`vistas: ${vistaCount} on ${Object.keys(vistasByMap).length} maps`);

// --- Aether currents ------------------------------------------------------------
// 1. All EObjs named "aether current" (EObjName row_id == EObj row_id).
const eobjNames = await searchAll("EObjName", `Singular="aether current"`, "Singular");
const eobjIds = eobjNames.map((r) => r.row_id);
console.log(`aether-current EObjs: ${eobjIds.length}`);

// 2. Their Level placements (raw coords + map), batched OR queries.
const currentsByMap = {};
const seenEobj = new Set();
let fieldCount = 0;
for (let i = 0; i < eobjIds.length; i += 15) {
	const q = eobjIds.slice(i, i + 15).map((id) => `Object=${id}`).join(" ");
	const found = await searchAll("Level", q, "Object.row_id,X,Z,Map.row_id");
	for (const r of found) {
		const f = r.fields;
		const eobj = f.Object?.row_id;
		const mapId = f.Map?.row_id;
		if (eobj === undefined || mapId === undefined || seenEobj.has(eobj)) continue;
		seenEobj.add(eobj);
		const pos = mapXY(mapId, f.X, f.Z);
		if (!pos) continue;
		((currentsByMap[mapId] ??= { fields: [], quests: [] }).fields).push(pos);
		fieldCount++;
	}
}

// 3. Quest-locked currents: AetherCurrent rows with a Quest. No field position;
// list the quest under the issuer's map so the HUD can show "X more from quests".
const acRows = await sheetAll(
	"AetherCurrent",
	"Quest.Name,Quest.IssuerLocation.Map.row_id"
);
let questCount = 0;
for (const row of acRows) {
	const q = row.fields.Quest;
	if (!q?.row_id) continue;
	const name = q.fields?.Name;
	const mapId = q.fields?.IssuerLocation?.fields?.Map?.row_id;
	if (!name || mapId === undefined) continue;
	((currentsByMap[mapId] ??= { fields: [], quests: [] }).quests).push(name);
	questCount++;
}

writeFileSync(join(__dirname, "../data/aether-currents.json"), JSON.stringify(currentsByMap));
console.log(`aether currents: ${fieldCount} field + ${questCount} quest on ${Object.keys(currentsByMap).length} maps`);

// --- NPC roles --------------------------------------------------------------------
const shopsByNpc = await loadTcJson("shops-by-npc.json");
const questRows = await sheetAll("Quest", "IssuerStart.row_id");
const givers = new Set();
for (const row of questRows) {
	const id = row.fields.IssuerStart?.row_id;
	if (id) givers.add(id);
}
const roles = {};
for (const id of givers) roles[id] = "q";
for (const id of Object.keys(shopsByNpc)) roles[id] = roles[id] ? "qs" : "s";
writeFileSync(join(__dirname, "../data/npc-roles.json"), JSON.stringify(roles));
console.log(`npc roles: ${givers.size} quest givers, ${Object.keys(shopsByNpc).length} vendors, ${Object.keys(roles).length} total`);
