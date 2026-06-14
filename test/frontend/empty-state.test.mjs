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
// happy-dom without booting the map. The dismiss case runs last because the
// module's session-only `dismissed` flag is a singleton that latches true.
describe("renderEmptyState / initEmptyState (DOM)", () => {
	const mount = () => {
		document.body.innerHTML = `<div id="emptyState" hidden><button id="emptyStateDismiss"></button></div>`;
		return document.getElementById("emptyState");
	};

	it("shows on boot with no position, hides on the first zone", () => {
		const el = mount();
		state.playerMap = null;
		initEmptyState();
		expect(el.hidden).toBe(false);

		state.playerMap = { id: 134 };
		renderEmptyState();
		expect(el.hidden).toBe(true);
	});

	it("hides on manual dismiss even while no position is known", () => {
		const el = mount();
		state.playerMap = null;
		initEmptyState();
		expect(el.hidden).toBe(false);

		document.getElementById("emptyStateDismiss").click();
		expect(el.hidden).toBe(true);
	});
});
