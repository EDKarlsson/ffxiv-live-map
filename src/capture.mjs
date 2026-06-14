import pcap from "@ffxiv-teamcraft/pcap-ffxiv";
import { mapForTerritory, convertPosition } from "./coords.mjs";
import { state, persistState } from "./state.mjs";
import { broadcast } from "./ws.mjs";
import { BRIDGE_PORT, VERBOSE } from "./config.mjs";

const { CaptureInterface } = pcap;
const WANTED = new Set(["updatePositionHandler", "updatePositionInstance", "initZone", "playerSpawn"]);

// Capture link status is the single source of truth for the UI status pill.
// Setting it broadcasts so the pill updates the instant the link changes:
//   "browse"     — not capturing (intentional: no game / PS5 reference mode)
//   "connecting" — capture stack up, trying to reach the Deucalion bridge
//   "live"       — connected and receiving position packets
export function setCaptureMode(mode) {
	if (state.capture === mode) return;
	state.capture = mode;
	broadcast({ type: "capture", mode });
}
export const captureMode = () => state.capture;

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

// The live CaptureInterface, or null when we're in browse mode (not capturing).
// Capture is now a runtime concern — enable/disable on demand (a UI toggle) and
// the game monitor auto-attaches/detaches as FFXIV starts/stops — so the stack
// is built and torn down here rather than once at boot.
let ci = null;
let reconnecting = false;
let reconnectTimer = null; // pending backoff timer, so enable/disable can cancel it

function buildCi() {
	return new CaptureInterface({
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
}

// Connect (or reconnect) the current interface, backing off 2s -> 10s until the
// bridge answers. A single attempt used to leave the daemon permanently deaf
// when the bridge was down for more than ~2s; an initial-connect failure used to
// exit the process. Capture is optional now, so we keep retrying instead — the
// map stays usable as a browse view meanwhile, and capture attaches when the
// bridge appears. enable/disableCapture cancel the pending timer (reconnectTimer)
// and detach listeners, so a manual stop quietly ends the loop without a flag.
function scheduleReconnect() {
	setCaptureMode("connecting");
	if (reconnecting) return;
	reconnecting = true;
	let attempt = 0;
	const retry = async () => {
		reconnectTimer = null;
		if (!ci) { reconnecting = false; return; } // disabled while waiting
		attempt++;
		try {
			await ci.start();
			reconnecting = false;
			setCaptureMode("live");
			console.log(`[pcap] connected (attempt ${attempt}).`);
		} catch (err) {
			const delay = Math.min(2000 * attempt, 10000);
			if (attempt === 1 || attempt % 10 === 0)
				console.error(`[pcap] connect attempt ${attempt} failed (${err.message ?? err}) — retrying every ${delay / 1000}s`);
			reconnectTimer = setTimeout(retry, delay);
		}
	};
	reconnectTimer = setTimeout(retry, 2000);
}

function wire() {
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
		if (!ci) return; // disabled between construction and ready
		const instance = ci; // so a later disable/re-enable suppresses this warn
		console.log("[pcap] opcodes/constants loaded, connecting to bridge...");
		setTimeout(() => {
			if (ci === instance && state.capture !== "live") {
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
			setCaptureMode("live");
			console.log("[pcap] capture started — move your character in game.");
		} catch (err) {
			// Don't exit (old behavior) — capture is optional; keep retrying.
			console.error(`[pcap] initial start failed (${err.message ?? err}) — retrying; the map works in browse mode meanwhile.`);
			scheduleReconnect();
		}
	});

	ci.on("error", (err) => console.error("[pcap] error:", err));
	ci.on("stopped", () => {
		console.log("[pcap] capture stopped.");
		scheduleReconnect();
	});
}

// Start capturing (idempotent). Builds the CaptureInterface; its 'ready' handler
// performs the actual connect. Cancels any pending reconnect first. No-op if
// already capturing.
export function enableCapture() {
	if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
	if (ci) return ci;
	setCaptureMode("connecting");
	ci = buildCi();
	wire();
	return ci;
}

// Stop capturing and return to browse mode (idempotent). Cancels any pending
// reconnect, then detaches listeners *before* stopping — so the resulting
// 'stopped' event can't re-trigger a reconnect — and marks browse up front, so a
// concurrent re-enable isn't clobbered by a late write after the await resolves.
export async function disableCapture() {
	if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
	if (!ci) { setCaptureMode("browse"); return; }
	const old = ci;
	ci = null;
	reconnecting = false;
	old.removeAllListeners();
	setCaptureMode("browse");
	try { await old.stop(); } catch (e) { console.warn("[pcap] stop failed:", e?.message ?? e); }
}

// Back-compat alias for the default boot path (daemon with no run-mode flags).
export const startCapture = enableCapture;
