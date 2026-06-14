// In-app toggle for live packet capture. The map runs in browse mode by default
// (no capture — usable as a reference even with no Mac game, e.g. on PS5); this
// button attaches/detaches the capture stack on demand by POSTing /capture. The
// daemon broadcasts the resulting mode over WebSocket, and ws.js calls
// renderCaptureMode() to settle the button — so the button reflects the real
// server state, not an optimistic guess.

let pending = false;

// Reflect the current capture mode on the button. Called by ws.js on every
// capture/state message. Safe to call before the button exists (no-op).
export function renderCaptureMode(mode) {
	const btn = document.getElementById("captureToggle");
	if (!btn) return;
	pending = false;
	btn.disabled = false;
	if (mode === "live") {
		btn.textContent = "⏹ Disable capture";
		btn.dataset.on = "1";
	} else if (mode === "connecting") {
		btn.textContent = "Connecting… (click to stop)";
		btn.dataset.on = "1";
	} else { // browse
		btn.textContent = "▶ Enable capture";
		btn.dataset.on = "0";
	}
}

export function initCaptureToggle() {
	const btn = document.getElementById("captureToggle");
	if (!btn) return;
	btn.onclick = async () => {
		if (pending) return;
		const turnOn = btn.dataset.on !== "1"; // off (or unknown) -> turn on
		const prevText = btn.textContent;
		pending = true;
		btn.disabled = true;
		btn.textContent = turnOn ? "Connecting…" : "Stopping…";
		try {
			// fetch only rejects on network errors, so check res.ok too — a 4xx/5xx
			// would otherwise leave the button stuck (no WS mode update would arrive).
			const res = await fetch("/capture", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ on: turnOn }),
			});
			if (!res.ok) throw new Error(`/capture responded ${res.status}`);
			// On success, don't set the label here — the daemon's WebSocket broadcast
			// drives renderCaptureMode() with the authoritative mode.
		} catch (e) {
			console.error("capture toggle failed:", e);
			pending = false;
			btn.disabled = false;
			btn.textContent = prevText;
		}
	};
}
