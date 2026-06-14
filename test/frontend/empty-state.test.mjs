import { describe, it, expect } from "vitest";
import { emptyStateVisible, renderEmptyState, initEmptyState } from "../../public/src/features/empty-state.js";
import { state } from "../../public/src/core/state.js";

// The whole point of the first-run prompt is to disappear the instant a position
// is known and to never nag once it is — emptyStateVisible is the rule behind that.
describe("emptyStateVisible", () => {
	it("shows only before the first position is known", () => {
		expect(emptyStateVisible(null, false)).toBe(true);
		expect(emptyStateVisible(undefined, false)).toBe(true); // no map yet, however spelled
	});

	it("hides once a player map is set, and stays hidden", () => {
		expect(emptyStateVisible({ id: 134 }, false)).toBe(false);
	});

	it("a manual dismiss hides it even with no position (browsing / PS5)", () => {
		expect(emptyStateVisible(null, true)).toBe(false);
		expect(emptyStateVisible({ id: 134 }, true)).toBe(false);
	});
});

// DOM wiring: the module reflects the rule onto #emptyState's `hidden` attribute.
// empty-state.js depends only on the leaf state.js (no Leaflet), so it renders in
// happy-dom without booting the map. The whole lifecycle lives in one `it` on
// purpose: the module's session-only `dismissed` flag is a singleton that latches
// true, so splitting these into separate tests would make them order-dependent.
describe("renderEmptyState / initEmptyState (DOM lifecycle)", () => {
	it("shows on boot, auto-hides on first position, and is manually dismissible", () => {
		document.body.innerHTML = `<div id="emptyState" hidden><button id="emptyStateDismiss"></button></div>`;
		const el = document.getElementById("emptyState");

		state.playerMap = null;
		initEmptyState();
		expect(el.hidden).toBe(false);              // boot, no position -> shown

		state.playerMap = { id: 134 };
		renderEmptyState();
		expect(el.hidden).toBe(true);               // first position -> auto-hidden

		// Drive the render rule back to "no position" to re-show it, then prove the
		// manual dismiss (the browsing / PS5 escape hatch) hides it on its own. (The
		// live app never resets playerMap to null; this just exercises the rule.)
		state.playerMap = null;
		renderEmptyState();
		expect(el.hidden).toBe(false);

		document.getElementById("emptyStateDismiss").click();
		expect(el.hidden).toBe(true);               // dismissed -> hidden, no position needed
	});
});
