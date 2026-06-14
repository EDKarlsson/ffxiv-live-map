// Collapsible HUD. The 250px side panel crowds the map on a small window (and
// collides with the bottom-right layer control), so it can be hidden — manually
// via a toggle button, and automatically when the window is small (narrow OR
// short).
//
// The manual choice is a *temporary* override: it persists across reloads
// (localStorage) but is cleared the moment the window crosses the small/large
// breakpoint, so resizing always hands control back to the responsive default.
// The toggle button lives OUTSIDE #hud so it stays reachable while collapsed.

const KEY = "hudManual";             // "open" | "collapsed" | absent (= responsive)
const SMALL_W = 900, SMALL_H = 560;  // collapse below either threshold

const isSmall = () => window.innerWidth < SMALL_W || window.innerHeight < SMALL_H;

const getManual = () => {
	const v = localStorage.getItem(KEY);
	return v === "open" || v === "collapsed" ? v : null;
};
const setManual = (v) => { v === null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); };

// Pure decision: a manual override wins; otherwise follow the window size.
// Exported so the rule can be unit-tested without a DOM.
export function hudCollapsed(manual, small) {
	return manual !== null ? manual === "collapsed" : small;
}

function apply() {
	const collapsed = hudCollapsed(getManual(), isSmall());
	document.body.classList.toggle("hud-collapsed", collapsed);
	const btn = document.getElementById("hudToggle");
	if (btn) {
		btn.textContent = collapsed ? "☰" : "✕";
		btn.title = collapsed ? "Show panel" : "Hide panel";
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
