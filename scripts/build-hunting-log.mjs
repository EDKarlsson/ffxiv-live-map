/**
 * Build the Hunting Log dataset from XIVAPI v2 (boilmaster), joining the game's
 * MonsterNote sheet to mob names. Class hunting logs (Gladiator…) live in the
 * 10001+ row range; Grand Company logs (Maelstrom/Twin Adder/Immortal Flames)
 * in the 1000001+ range. Each MonsterNote row is one log entry with up to 4
 * targets, each a BNpcName id + required kill count.
 *
 * BNpcName row_id == the mob id in our monsters.json (verified: 49 = little
 * ladybug), so the UI can reuse existing spawn positions.
 *
 * Output: data/hunting-log.json = { className: [ {entry, rank, targets:[
 *   {mobId, name, count, zones:[placeName]} ]} ] }
 *
 * Usage: node scripts/build-hunting-log.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://v2.xivapi.com/api/sheet/MonsterNote?version=latest";
const FIELDS =
	"Name,Count," +
	"MonsterNoteTarget[].BNpcName.Singular," +
	"MonsterNoteTarget[].BNpcName.row_id," +
	"MonsterNoteTarget[].PlaceNameZone[].Name";

async function fetchAll() {
	const rows = [];
	let after = 0;
	for (;;) {
		const url = `${API}&limit=500&after=${after}&fields=${encodeURIComponent(FIELDS)}`;
		const j = await fetch(url).then((r) => r.json());
		if (!j.rows?.length) break;
		rows.push(...j.rows);
		after = j.rows.at(-1).row_id;
		if (j.rows.length < 500) break;
	}
	return rows;
}

const rows = await fetchAll();
console.log(`MonsterNote rows: ${rows.length}`);

const log = {};
let targetCount = 0;
for (const row of rows) {
	const f = row.fields;
	const name = f.Name?.trim();
	if (!name) continue;
	const m = name.match(/^(.*?)\s*0*(\d+)$/);
	const className = m ? m[1] : name;
	const entryNo = m ? Number(m[2]) : 0;

	const counts = f.Count ?? [];
	const targets = [];
	(f.MonsterNoteTarget ?? []).forEach((t, i) => {
		const bnpc = t.fields?.BNpcName;
		const mobId = bnpc?.row_id ?? bnpc?.value;
		const mobName = bnpc?.fields?.Singular;
		const count = Array.isArray(counts) ? counts[i] ?? 0 : counts;
		if (!mobId || !count) return;
		const zone = t.fields?.PlaceNameZone?.[0]?.fields?.Name;
		targets.push({ mobId, name: mobName || `#${mobId}`, count, zones: zone ? [zone] : [] });
		targetCount++;
	});
	if (!targets.length) continue;

	// Hunting log: 10 entries per rank, 5 ranks. Class logs only (GC logs differ).
	const rank = Math.ceil(entryNo / 10) || 1;
	(log[className] ??= []).push({ entry: entryNo, rank, targets });
}

for (const c of Object.keys(log)) log[c].sort((a, b) => a.entry - b.entry);

writeFileSync(join(__dirname, "../data/hunting-log.json"), JSON.stringify(log));
console.log(`classes: ${Object.keys(log).length}, entries: ${Object.values(log).flat().length}, targets: ${targetCount}`);
console.log(Object.keys(log).join(", "));
