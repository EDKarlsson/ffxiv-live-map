/**
 * ffxiv-live-map daemon — entry point.
 *
 * Subscribes to FFXIV packets via @ffxiv-teamcraft/pcap-ffxiv in TCP-bridge mode
 * (Deucalion already injected by Teamcraft / deucalion-bridge.exe under Wine),
 * tracks player position + current zone, and pushes updates to the browser UI
 * over WebSocket. The pieces live in focused modules; this file just wires them.
 *
 * Usage:
 *   node src/daemon.mjs [--bridge-port 31594] [--http-port 8787] [--verbose]
 *                       [--no-capture] [--browse] [--mock [--mock-zone <id>]]
 *
 * Default bridge port 31594 = the port Teamcraft's bundled bridge listens on.
 */
import { createServer } from "http";
import { HTTP_PORT, BRIDGE_PORT, NO_CAPTURE, MOCK, BROWSE } from "./config.mjs";
import "./data-store.mjs"; // load + watch derived data (side effect on import)
import "./state.mjs";      // restore persisted zone/position (side effect on import)
import { createRequestHandler } from "./router.mjs";
import { attachWebSocket } from "./ws.mjs";
import { enableCapture, setCaptureMode } from "./capture.mjs";
import { startGameMonitor } from "./game-monitor.mjs";
import { startMock } from "./mock.mjs";

const server = createServer(createRequestHandler());
attachWebSocket(server);
server.listen(HTTP_PORT, () => {
	console.log(`[map] UI on http://localhost:${HTTP_PORT} (bridge port ${BRIDGE_PORT})`);
});

// Run mode:
//   --mock        synthetic moving character (no real capture)
//   --no-capture  inert browse: serve the map, never capture (tests/CI)
//   --browse      browse by default, but watch for the game and auto-attach
//                 capture when FFXIV launches (capture also toggleable via the UI)
//   (default)     attach the real packet-capture stack immediately
if (MOCK) startMock();
else if (NO_CAPTURE) setCaptureMode("browse");
else if (BROWSE) { setCaptureMode("browse"); startGameMonitor(); }
else enableCapture();
