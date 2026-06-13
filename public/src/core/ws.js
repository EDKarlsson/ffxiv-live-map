import { handleZone, setPos } from "./player.js";

// Status pill tracks TWO links: browser->daemon (WebSocket) AND daemon->bridge
// (packet capture). Showing "live" on WebSocket alone silently served a stale
// zone/position whenever the bridge was down.
let wsUp = false, captureUp = false;

function renderStatus() {
	const status = document.getElementById("status");
	if (!wsUp) { status.textContent = "daemon down — retrying"; status.className = "bad"; }
	else if (!captureUp) { status.textContent = "no packet capture — bridge down? (position may be stale)"; status.className = "warn"; }
	else { status.textContent = "live"; status.className = "ok"; }
}

export function connect() {
	// Match the page protocol so this also works behind HTTPS (wss vs ws).
	const proto = location.protocol === "https:" ? "wss" : "ws";
	const ws = new WebSocket(`${proto}://${location.host}`);
	ws.onopen = () => { wsUp = true; renderStatus(); };
	ws.onclose = () => {
		wsUp = false; renderStatus();
		setTimeout(connect, 2000);
	};
	ws.onmessage = (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.type === "state") {
			captureUp = !!msg.state.connected;
			renderStatus();
			if (msg.state.map) handleZone(msg.state.map);
			if (msg.state.pos) setPos(msg.state.pos, msg.state.rotation);
		} else if (msg.type === "zone") {
			handleZone(msg.map);
		} else if (msg.type === "pos") {
			setPos(msg.pos, msg.rotation);
		} else if (msg.type === "connected" || msg.type === "disconnected") {
			captureUp = msg.type === "connected";
			renderStatus();
		}
	};
}
