// Collapsible HUD. The 250px side panel crowds the map on a small window (and
// collides with the bottom-right layer control), so it can be hidden — manually
// via a toggle button, and automatically when the window is small (narrow OR
// short).
//
// The manual choice is a *temporary* override: it persists across reloads
// (localStorage) but is cleared the moment the window crosses the small/large
// breakpoint, so resizing always hands control back to the responsive default.
// The toggle button lives OUTSIDE #hud so it stays reachable while collapsed.

// The overlay window (Electron) keeps its own override key, so it defaults to the
// collapsed mini-map — independent of the main window's HUD state — rather than
// inheriting a stray "open" override and covering the game with the full panel.
// A 520px overlay is below the breakpoint, so an empty override = collapsed.
const KEY = (window.overlay && window.overlay.isOverlay) ? "hudManualOverlay" : "hudManual";
const SMALL_W = 900, SMALL_H = 560;  // collapse below either threshold

const isSmall = () => window.innerWidth < SMALL_W || window.innerHeight < SMALL_H;

// Cache the manual override in memory: apply() runs on every resize tick, and
// reading localStorage (synchronous, disk-backed) per tick causes jank. Reads
// and writes are also wrapped — localStorage throws in private mode / when
// storage is blocked, which would otherwise crash the app on boot.
let manualOverride = (() => {
	try { const v = localStorage.getItem(KEY); return v === "open" || v === "collapsed" ? v : null; }
	catch { return null; }
})();
const getManual = () => manualOverride;
const setManual = (v) => {
	manualOverride = v;
	try { v === null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); }
	catch { /* storage unavailable — the in-memory override still works this session */ }
};

// Pure decision: a manual override wins; otherwise follow the window size.
// Exported so the rule can be unit-tested without a DOM.
export function hudCollapsed(manual, small) {
	return manual !== null ? manual === "collapsed" : small;
}

let lastCollapsed = null; // skip redundant DOM writes when a resize doesn't change state

function apply() {
	const collapsed = hudCollapsed(getManual(), isSmall());
	if (collapsed === lastCollapsed) return;
	lastCollapsed = collapsed;
	document.body.classList.toggle("hud-collapsed", collapsed);
	const btn = document.getElementById("hudToggle");
	if (btn) {
		const label = collapsed ? "Show panel" : "Hide panel";
		btn.textContent = collapsed ? "☰" : "✕";
		btn.title = label;
		btn.setAttribute("aria-label", label); // icon-only button: keep the a11y name in sync
		btn.setAttribute("aria-expanded", String(!collapsed));
	}
}

export function initHudToggle() {
	const btn = document.getElementById("hudToggle");
	if (!btn) return;
	btn.onclick = () => {
		// Flip the *effective* state and pin it as the manual override.
		const collapsed = hudCollapsed(getManual(), isSmall());
		setManual(collapsed ? "open" : "collapsed");
		apply();
	};
	let wasSmall = isSmall();
	window.addEventListener("resize", () => {
		const small = isSmall();
		if (small !== wasSmall) { wasSmall = small; setManual(null); } // crossing reverts to responsive
		apply();
	});
	apply();
}
