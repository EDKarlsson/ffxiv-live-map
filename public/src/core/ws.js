import { handleZone, setPos } from "./player.js";
import { renderCaptureMode } from "../features/capture-toggle.js";
import { renderEmptyState } from "../features/empty-state.js";
import { statusFor } from "./status.js";

// Status reflects two things: the browser->daemon WebSocket link, and the
// daemon's capture mode (browse / connecting / live). The text/class mapping is
// the pure statusFor() in ./status.js (so it's unit-testable without Leaflet).
let wsUp = false, mode = "browse";

function render() {
	const status = document.getElementById("status");
	const { text, cls } = statusFor(wsUp, mode);
	status.textContent = text;
	status.className = cls;
	renderCaptureMode(mode); // keep the capture toggle button in sync with the link
}

export function connect() {
	// Match the page protocol so this also works behind HTTPS (wss vs ws).
	const proto = location.protocol === "https:" ? "wss" : "ws";
	const ws = new WebSocket(`${proto}://${location.host}`);
	ws.onopen = () => { wsUp = true; render(); };
	ws.onclose = () => {
		wsUp = false; render();
		setTimeout(connect, 2000);
	};
	ws.onmessage = (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.type === "state") {
			mode = msg.state.capture ?? "browse";
			render();
			if (msg.state.map) handleZone(msg.state.map);
			if (msg.state.pos) setPos(msg.state.pos, msg.state.rotation);
		} else if (msg.type === "zone") {
			handleZone(msg.map);
		} else if (msg.type === "pos") {
			setPos(msg.pos, msg.rotation);
		} else if (msg.type === "capture") {
			mode = msg.mode;
			render();
		}
		// Re-evaluate the first-run prompt only on messages that can populate
		// state.playerMap (via handleZone) — not on high-frequency `pos` updates,
		// which never change it. This hides the prompt on the first real zone.
		if (msg.type === "state" || msg.type === "zone") renderEmptyState();
	};
}
