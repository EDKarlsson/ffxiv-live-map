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
import { mapForTerritory, convertPosition } from "./coords.mjs";
import { readFileSync } from "fs";

const { CaptureInterface } = pcap;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Gathering nodes (built by scripts/build-node-data.mjs from Teamcraft data)
const nodeDb = JSON.parse(readFileSync(join(__dirname, "../data/nodes.json"), "utf-8"));
const itemNames = JSON.parse(readFileSync(join(__dirname, "../data/item-names.json"), "utf-8"));

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

let reconnecting = false;
ci.on("stopped", () => {
	state.connected = false;
	broadcast({ type: "disconnected" });
	if (reconnecting) return;
	reconnecting = true;
	console.log("[pcap] capture stopped — reconnecting in 2s…");
	setTimeout(async () => {
		try {
			await ci.start();
			state.connected = true;
			broadcast({ type: "connected" });
			console.log("[pcap] reconnected.");
		} catch (err) {
			console.error("[pcap] reconnect failed:", err);
		} finally {
			reconnecting = false;
		}
	}, 2000);
});
