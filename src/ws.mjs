import { WebSocketServer } from "ws";
import { state } from "./state.mjs";

let wss = null;

export function attachWebSocket(server) {
	wss = new WebSocketServer({ server });
	wss.on("connection", (ws) => {
		ws.send(JSON.stringify({ type: "state", state }));
	});
}

export function broadcast(obj) {
	if (!wss) return;
	const payload = JSON.stringify(obj);
	for (const client of wss.clients) {
		if (client.readyState === 1) client.send(payload);
	}
}
