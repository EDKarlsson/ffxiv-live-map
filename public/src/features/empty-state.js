// First-run empty state. Until the daemon captures a zone transition, the map
// renders blank and state.playerMap is null (public/src/core/state.js) — which
// reads as "broken" rather than "waiting for input". This shows a prompt telling
// the user the one thing that fixes it: change zones in-game. It hides the moment
// a position is known, and can be dismissed manually for people who are only
// browsing maps (no capture / playing on PS5).
import { state } from "../core/state.js";

// A manual dismiss is session-only on purpose: it's an escape hatch for browsing,
// not a preference. Once a real position arrives the prompt is gone for good
// anyway (see emptyStateVisible), so there's nothing worth persisting.
let dismissed = false;

// Pure decision (unit-testable without a DOM): show only before the first player
// position is known, and only if the user hasn't dismissed it. playerMap is set
// once on the first zone capture and never reset back to null — not even on a WS
// reconnect — so this can't spuriously reappear after a position is established.
export function emptyStateVisible(playerMap, isDismissed) {
	return playerMap == null && !isDismissed;
}

let lastHidden = null; // skip redundant DOM writes: renderEmptyState() runs on every
                       // WS message, including high-frequency `pos` updates as the
                       // player moves (same guard as hud-toggle.js's lastCollapsed).

export function renderEmptyState() {
	const el = document.getElementById("emptyState");
	if (!el) return;
	const hide = !emptyStateVisible(state.playerMap, dismissed);
	if (hide === lastHidden) return;
	lastHidden = hide;
	el.hidden = hide;
}

export function initEmptyState() {
	const btn = document.getElementById("emptyStateDismiss");
	if (btn) btn.onclick = () => { dismissed = true; renderEmptyState(); };
	renderEmptyState(); // show on boot while no position is known
}
