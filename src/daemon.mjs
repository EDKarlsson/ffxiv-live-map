/**
 * ffxiv-live-map daemon
 *
 * Subscribes to FFXIV packets via @ffxiv-teamcraft/pcap-ffxiv in TCP-bridge
 * mode (Deucalion already injected by Teamcraft / deucalion-bridge.exe under
 * Wine), tracks player position + current zone, and pushes updates to the
 * browser UI over WebSocket.
 *
 * Usage:
 *   node src/daemon.mjs [--bridge-port 31594] [--http-port 8787] [--verbose]
 *
 * Default bridge port 31594 = the port Teamcraft's bundled bridge listens on
 * (apps/electron/src/pcap/packet-capture.ts in ffxiv-teamcraft).
 */

import { createServer } from "http";
import { readFile } from "fs/promises";
import { dirname, join, extname } from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import pcap from "@ffxiv-teamcraft/pcap-ffxiv";
import { mapForTerritory, mapById, convertPosition } from "./coords.mjs";
import { readFileSync, writeFileSync, existsSync, watch } from "fs";

const { CaptureInterface } = pcap;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Derived data (built by scripts/build-node-data.mjs + build-hunting-log.mjs).
// Loaded into mutable bindings + watched, so rebuilding data hot-reloads the
// daemon — no restart needed during development.
const DATA_DIR = join(__dirname, "../data");
const readData = (f) => JSON.parse(readFileSync(join(DATA_DIR, f), "utf-8"));

let nodeDb, itemNames, monsterDb, mobNames, mapsIndex, fateDb, npcDb,
	huntingLog, mobMaps, itemNodes, allItemNames, treasureDb, fishingDb,
	vistaDb, aetherDb, npcRoles;

// Newer layer files may not exist yet on a data/ built by an older checkout —
// serve empty rather than crashing, so `npm run rebuild-data` can catch up.
const readDataOptional = (f) => {
	try { return readData(f); } catch { console.warn(`[data] ${f} missing — run npm run rebuild-data`); return {}; }
};

function loadData() {
	nodeDb = readData("nodes.json");
	itemNames = readData("item-names.json");
	monsterDb = readData("monsters.json");
	mobNames = readData("mob-names.json");
	mapsIndex = readData("maps-index.json");
	fateDb = readData("fates.json");
	npcDb = readData("npcs.json");
	huntingLog = readData("hunting-log.json");
	mobMaps = readData("mob-maps.json");
	itemNodes = readData("item-nodes.json");
	allItemNames = readData("item-names-all.json");
	treasureDb = readDataOptional("treasures.json");
	fishingDb = readDataOptional("fishing-spots.json");
	vistaDb = readDataOptional("vistas.json");
	aetherDb = readDataOptional("aether-currents.json");
	npcRoles = readDataOptional("npc-roles.json"); // { npcId: "q"|"s"|"qs" }
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

// User-placed custom markers, persisted to disk: { mapId: [ {id, x, y, label, color} ] }
const MARKERS_FILE = join(__dirname, "../custom-markers.json");
let customMarkers = {};
try {
	if (existsSync(MARKERS_FILE)) customMarkers = JSON.parse(readFileSync(MARKERS_FILE, "utf-8"));
} catch (e) {
	console.warn("[markers] could not load:", e.message);
}
const saveMarkers = () => writeFileSync(MARKERS_FILE, JSON.stringify(customMarkers));

function readBody(req) {
	return new Promise((resolve) => {
		let b = "";
		req.on("data", (c) => (b += c));
		req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
	});
}

// --- CLI args ---------------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (name, def) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const BRIDGE_PORT = Number(argVal("--bridge-port", 31594));
const HTTP_PORT = Number(argVal("--http-port", 8787));
const VERBOSE = args.includes("--verbose");

// --- State ------------------------------------------------------------------
const state = {
	map: null, // current map entry from maps.json
	pos: null, // last converted position
	rotation: null,
	connected: false,
};

// Persist last zone/position so a daemon restart doesn't need a zone change
// to show the map again. Stale-zone caveat: if you switch zones while the
// daemon is down, this restores the old zone until the next initZone.
const STATE_FILE = join(__dirname, "../.state.json");
try {
	if (existsSync(STATE_FILE)) {
		const saved = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
		state.map = saved.map ?? null;
		state.pos = saved.pos ?? null;
		state.rotation = saved.rotation ?? null;
		if (state.map) console.log(`[map] restored last state: map ${state.map.id}`);
	}
} catch (e) {
	console.warn("[map] could not restore saved state:", e.message);
}

let lastSave = 0;
function persistState(force = false) {
	const now = Date.now();
	if (!force && now - lastSave < 5000) return;
	lastSave = now;
	try {
		writeFileSync(STATE_FILE, JSON.stringify({ map: state.map, pos: state.pos, rotation: state.rotation }));
	} catch (e) {
		console.warn("[map] state save failed:", e.message);
	}
}

// --- HTTP + WebSocket server --------------------------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const server = createServer(async (req, res) => {
	if (req.url === "/favicon.ico") {
		res.writeHead(204);
		res.end();
		return;
	}
	if (req.url.startsWith("/nodes")) {
		const mapId = Number(new URL(req.url, "http://localhost").searchParams.get("map"));
		const list = Object.entries(nodeDb)
			.filter(([, n]) => n.map === mapId)
			.map(([id, n]) => ({
				id: Number(id),
				...n,
				items: n.items.map((i) => ({ id: i, name: itemNames[i] ?? `#${i}` })),
				hiddenItems: n.hiddenItems.map((i) => ({ id: i, name: itemNames[i] ?? `#${i}` })),
			}));
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(list));
		return;
	}
	if (req.url.startsWith("/monsters")) {
		const mapId = String(Number(new URL(req.url, "http://localhost").searchParams.get("map")));
		const mobs = monsterDb[mapId] ?? {};
		const list = Object.entries(mobs).map(([id, m]) => ({
			id: Number(id),
			name: mobNames[id] ?? `#${id}`,
			lmin: m.lmin,
			lmax: m.lmax,
			points: m.points,
		})).sort((a, b) => a.lmin - b.lmin || a.name.localeCompare(b.name));
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(list));
		return;
	}
	if (req.url === "/timed-nodes") {
		// All timed (unspoiled/ephemeral/legendary) nodes across every map, with
		// their map id so the "what's up now" planner can route + jump globally.
		const mapName = Object.fromEntries(mapsIndex.map((m) => [m.id, m.name]));
		const list = Object.entries(nodeDb)
			.filter(([, n]) => n.spawns?.length)
			.map(([id, n]) => ({
				id: Number(id),
				type: n.type,
				level: n.level,
				map: n.map,
				mapName: mapName[n.map] ?? `Map ${n.map}`,
				x: n.x,
				y: n.y,
				spawns: n.spawns,
				duration: n.duration,
				ephemeral: n.ephemeral,
				legendary: n.legendary,
				items: n.items.map((i) => ({ id: i, name: itemNames[i] ?? `#${i}` })),
			}));
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(list));
		return;
	}
	if (req.url.startsWith("/fates") || req.url.startsWith("/vistas")) {
		const u = new URL(req.url, "http://localhost");
		const db = req.url.startsWith("/fates") ? fateDb : vistaDb;
		const list = db[String(Number(u.searchParams.get("map")))] ?? [];
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(list));
		return;
	}
	if (req.url.startsWith("/npcs")) {
		// Attach roles ("q" quest giver / "s" shop / "qs" both) for UI toggles.
		const mapId = String(Number(new URL(req.url, "http://localhost").searchParams.get("map")));
		const list = (npcDb[mapId] ?? []).map((n) => npcRoles[n.id] ? { ...n, role: npcRoles[n.id] } : n);
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(list));
		return;
	}
	if (req.url.startsWith("/treasures")) {
		// Attach the timeworn-map tier name so the UI can group/filter by it.
		const mapId = String(Number(new URL(req.url, "http://localhost").searchParams.get("map")));
		const list = (treasureDb[mapId] ?? []).map((t) => ({
			...t,
			itemName: itemNames[t.item] ?? allItemNames[t.item] ?? `#${t.item}`,
		}));
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(list));
		return;
	}
	if (req.url.startsWith("/fishing-spots")) {
		const mapId = String(Number(new URL(req.url, "http://localhost").searchParams.get("map")));
		const list = (fishingDb[mapId] ?? []).map((s) => ({
			...s,
			fishes: s.fishes.map((f) => ({ id: f, name: itemNames[f] ?? allItemNames[f] ?? `#${f}` })),
		}));
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(list));
		return;
	}
	if (req.url.startsWith("/aether-currents")) {
		const mapId = String(Number(new URL(req.url, "http://localhost").searchParams.get("map")));
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(aetherDb[mapId] ?? { fields: [], quests: [] }));
		return;
	}
	if (req.url.startsWith("/custom")) {
		const u = new URL(req.url, "http://localhost");
		if (req.method === "GET") {
			const mapId = String(Number(u.searchParams.get("map")));
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(customMarkers[mapId] ?? []));
			return;
		}
		if (req.method === "POST") {
			const m = await readBody(req); // {map, x, y, label, color}
			const mapId = String(Number(m.map));
			const marker = { id: Date.now() + Math.floor(Math.random() * 1000), x: m.x, y: m.y, label: m.label || "", color: m.color || "#ffd470", icon: m.icon || "📍" };
			(customMarkers[mapId] ??= []).push(marker);
			saveMarkers();
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(marker));
			return;
		}
		if (req.method === "DELETE") {
			const mapId = String(Number(u.searchParams.get("map")));
			const id = Number(u.searchParams.get("id"));
			if (customMarkers[mapId]) customMarkers[mapId] = customMarkers[mapId].filter((x) => x.id !== id);
			saveMarkers();
			res.writeHead(204);
			res.end();
			return;
		}
	}
	if (req.url.startsWith("/list")) {
		// Import a Teamcraft list by id via Firestore REST (no auth — see project
		// notes). Decode finalItems, keep gatherable ones, attach node locations.
		const listId = new URL(req.url, "http://localhost").searchParams.get("id");
		if (!listId) { res.writeHead(400); res.end("missing id"); return; }
		try {
			const fsUrl = `https://firestore.googleapis.com/v1/projects/ffxivteamcraft/databases/(default)/documents/lists/${encodeURIComponent(listId)}`;
			const doc = await fetch(fsUrl).then((r) => r.json());
			if (doc.error) { res.writeHead(404); res.end(JSON.stringify({ error: doc.error.message })); return; }
			const fields = doc.fields ?? {};
			const listName = fields.name?.stringValue ?? listId;
			// A list doc has TWO arrays: `finalItems` (the outputs, e.g. gear) and
			// `items` (Teamcraft's precomputed full ingredient breakdown — raw mats
			// incl. crystals, with amounts). Gear lists have no gatherable finals,
			// so the gather checklist/routes must come from `items`.
			const decode = (arr) => (arr ?? []).map((v) => {
				const f = v.mapValue.fields;
				const id = Number(f.id?.integerValue ?? 0);
				const amount = Number(f.amount?.integerValue ?? 0);
				const done = Number(f.done?.integerValue ?? 0);
				const nodes = itemNodes[id] ?? [];
				const maps = [...new Set(nodes.map((n) => n.map))];
				return { id, name: allItemNames[id] ?? itemNames[id] ?? `#${id}`, amount, done, gatherable: nodes.length > 0, maps, nodes };
			});
			const finals = decode(fields.finalItems?.arrayValue?.values);
			const items = decode(fields.items?.arrayValue?.values);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ id: listId, name: listName, finals, items }));
		} catch (e) {
			res.writeHead(502);
			res.end(JSON.stringify({ error: e.message }));
		}
		return;
	}
	if (req.url.startsWith("/find-material")) {
		// Search gatherable materials by name (anything in the item->nodes index,
		// which includes mining/botany nodes and fishing holes). Prefix matches
		// rank above substring matches; capped at 20.
		const q = (new URL(req.url, "http://localhost").searchParams.get("q") ?? "").trim().toLowerCase();
		if (q.length < 2) { res.writeHead(200, { "Content-Type": "application/json" }); res.end("[]"); return; }
		const starts = [], contains = [];
		for (const id of Object.keys(itemNodes)) {
			const name = (itemNames[id] ?? allItemNames[id] ?? "").toLowerCase();
			if (!name) continue;
			if (name.startsWith(q)) starts.push(id);
			else if (name.includes(q)) contains.push(id);
			if (starts.length >= 20) break;
		}
		const hits = [...starts, ...contains].slice(0, 20).map((id) => ({
			id: Number(id),
			name: itemNames[id] ?? allItemNames[id],
			nodes: itemNodes[id],
			maps: [...new Set(itemNodes[id].map((n) => n.map))],
		}));
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(hits));
		return;
	}
	if (req.url === "/hunting-log") {
		// Attach which maps each target mob appears on (for jump-to).
		const out = {};
		for (const [cls, entries] of Object.entries(huntingLog)) {
			out[cls] = entries.map((e) => ({
				...e,
				targets: e.targets.map((t) => ({ ...t, maps: mobMaps[t.mobId] ?? [] })),
			}));
		}
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(out));
		return;
	}
	if (req.url === "/maps") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(mapsIndex));
		return;
	}
	if (req.url.startsWith("/map?")) {
		const id = Number(new URL(req.url, "http://localhost").searchParams.get("id"));
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(mapById(id)));
		return;
	}
	if (req.url === "/state") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(state));
		return;
	}
	const file = req.url === "/" ? "index.html" : req.url.slice(1);
	try {
		const data = await readFile(join(__dirname, "../public", file));
		res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
		res.end(data);
	} catch {
		res.writeHead(404);
		res.end("not found");
	}
});

const wss = new WebSocketServer({ server });
function broadcast(obj) {
	const payload = JSON.stringify(obj);
	for (const client of wss.clients) {
		if (client.readyState === 1) client.send(payload);
	}
}
wss.on("connection", (ws) => {
	ws.send(JSON.stringify({ type: "state", state }));
});

server.listen(HTTP_PORT, () => {
	console.log(`[map] UI on http://localhost:${HTTP_PORT} (bridge port ${BRIDGE_PORT})`);
});

// --- Packet capture -----------------------------------------------------------
const WANTED = new Set(["updatePositionHandler", "updatePositionInstance", "initZone", "playerSpawn"]);

const ci = new CaptureInterface({
	region: "Global",
	bridgeTcpPort: BRIDGE_PORT,
	filter: (_header, typeName) => WANTED.has(typeName),
	logger: (p) => {
		// Always surface connection-progress and Deucalion debug lines — silence
		// here previously hid an endless "waiting for bridge" retry loop.
		const important = p.type === "error" || p.type === "warn" || /\[TCP\]|DEUCALION/.test(p.message);
		if (VERBOSE || important) console[p.type === "log" ? "info" : p.type](`[pcap] ${p.message}`);
	},
});

function handlePosition(pos, rotation) {
	if (!state.map) return;
	state.pos = convertPosition(pos, state.map);
	state.rotation = rotation ?? state.rotation;
	broadcast({ type: "pos", pos: state.pos, rotation: state.rotation });
	persistState();
	if (VERBOSE) {
		console.log(
			`[pos] raw(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}) -> map(${state.pos.mapX.toFixed(1)}, ${state.pos.mapY.toFixed(1)})`
		);
	}
}

ci.on("message", (m) => {
	const d = m.parsedIpcData;
	if (!d) return;
	switch (m.type) {
		case "initZone": {
			const map = mapForTerritory(d.zoneId);
			console.log(`[zone] initZone zoneId=${d.zoneId} -> map ${map ? `${map.id} (${map.image})` : "NOT FOUND"}`);
			state.map = map;
			state.pos = null;
			broadcast({ type: "zone", map });
			persistState(true);
			if (map && d.pos) handlePosition(d.pos);
			break;
		}
		case "playerSpawn":
			// Server sends playerSpawn for EVERY nearby player. Ours is the one
			// where sourceActor === targetActor (same filter Teamcraft uses in
			// ipc.service.ts worldId$). Without this the dot jumps to strangers.
			if (m.origin === "S" && d.pos && m.header.sourceActor === m.header.targetActor) {
				handlePosition(d.pos, d.rotation);
			}
			break;
		case "updatePositionHandler":
		case "updatePositionInstance":
			// Client->server movement updates: the player's own position.
			if (m.origin === "C" && d.pos) handlePosition(d.pos, d.rotation);
			break;
	}
});

ci.on("ready", async () => {
	console.log("[pcap] opcodes/constants loaded, connecting to bridge...");
	setTimeout(() => {
		if (!state.connected) {
			console.warn(
				`[pcap] Still not connected after 15s. Check that something is listening:\n` +
				`         lsof -nP -iTCP:${BRIDGE_PORT}\n` +
				`       If Teamcraft holds the only client slot, start a second bridge on\n` +
				`       another port (see README) and run with --bridge-port 31595.`
			);
		}
	}, 15000);
	try {
		await ci.start();
		state.connected = true;
		broadcast({ type: "connected" });
		console.log("[pcap] capture started — move your character in game.");
	} catch (err) {
		console.error("[pcap] failed to start:", err);
		console.error("Is Teamcraft running with Packet Capture enabled (bridge on port " + BRIDGE_PORT + ")?");
		process.exit(1);
	}
});

ci.on("error", (err) => console.error("[pcap] error:", err));

// Keep retrying until the bridge is back — a single attempt used to leave the
// daemon permanently deaf (UI showed stale zone/position) when the bridge was
// restarted or down for more than ~2s. Backs off 2s -> 10s.
let reconnecting = false;
ci.on("stopped", () => {
	state.connected = false;
	broadcast({ type: "disconnected" });
	if (reconnecting) return;
	reconnecting = true;
	let attempt = 0;
	const retry = async () => {
		attempt++;
		try {
			await ci.start();
			state.connected = true;
			reconnecting = false;
			broadcast({ type: "connected" });
			console.log(`[pcap] reconnected (attempt ${attempt}).`);
		} catch (err) {
			const delay = Math.min(2000 * attempt, 10000);
			if (attempt === 1 || attempt % 10 === 0)
				console.error(`[pcap] reconnect attempt ${attempt} failed (${err.message ?? err}) — retrying every ${delay / 1000}s`);
			setTimeout(retry, delay);
		}
	};
	console.log("[pcap] capture stopped — reconnecting in 2s…");
	setTimeout(retry, 2000);
});
