import pcap from "@ffxiv-teamcraft/pcap-ffxiv";
import { mapForTerritory, convertPosition } from "./coords.mjs";
import { state, persistState } from "./state.mjs";
import { broadcast } from "./ws.mjs";
import { BRIDGE_PORT, VERBOSE } from "./config.mjs";

const { CaptureInterface } = pcap;
const WANTED = new Set(["updatePositionHandler", "updatePositionInstance", "initZone", "playerSpawn"]);

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

// Subscribe to FFXIV packets via the Deucalion TCP bridge and push zone/position
// updates to the UI. Returns the CaptureInterface.
export function startCapture() {
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
				// where sourceActor === targetActor (same filter Teamcraft uses).
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
	// daemon permanently deaf when the bridge was down for more than ~2s. Backs
	// off 2s -> 10s.
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

	return ci;
}
