import { readFileSync, watch } from "fs";
import { join } from "path";
import { DATA_DIR } from "./paths.mjs";

// Derived data (built by scripts/build-*.mjs). Loaded into a mutable `db` object
// and watched, so rebuilding data hot-reloads the daemon — no restart needed.
const readData = (f) => JSON.parse(readFileSync(join(DATA_DIR, f), "utf-8"));

// Newer layer files may not exist on a data/ built by an older checkout — serve
// empty rather than crashing, so `npm run rebuild-data` can catch up.
const readDataOptional = (f) => {
	try { return readData(f); } catch { console.warn(`[data] ${f} missing — run npm run rebuild-data`); return {}; }
};

// Route handlers read fields off this object at request time, so loadData()
// reassigning them in place is all that's needed to hot-reload.
export const db = {};

export function loadData() {
	db.nodeDb = readData("nodes.json");
	db.itemNames = readData("item-names.json");
	db.monsterDb = readData("monsters.json");
	db.mobNames = readData("mob-names.json");
	db.mapsIndex = readData("maps-index.json");
	db.fateDb = readData("fates.json");
	db.npcDb = readData("npcs.json");
	db.huntingLog = readData("hunting-log.json");
	db.mobMaps = readData("mob-maps.json");
	db.itemNodes = readData("item-nodes.json");
	db.allItemNames = readData("item-names-all.json");
	db.treasureDb = readDataOptional("treasures.json");
	db.fishingDb = readDataOptional("fishing-spots.json");
	db.vistaDb = readDataOptional("vistas.json");
	db.aetherDb = readDataOptional("aether-currents.json");
	db.npcRoles = readDataOptional("npc-roles.json"); // { npcId: "q"|"s"|"qs" }
	db.mapMarkerDb = readDataOptional("map-markers.json"); // labels/POIs/zone links, px coords
	db.mapSymbols = readDataOptional("map-symbols.json"); // icon id -> "Repairs" etc.
}
loadData();

// Hot-reload on data rebuild (debounced — a build writes many files at once).
let reloadTimer = null;
watch(DATA_DIR, () => {
	clearTimeout(reloadTimer);
	reloadTimer = setTimeout(() => {
		try { loadData(); console.log("[data] reloaded after change"); }
		catch (e) { console.warn("[data] reload failed (mid-write?):", e.message); }
	}, 500);
});
