import { describe, it, expect } from "vitest";
import { hudCollapsed } from "../../public/src/features/hud-toggle.js";

// The collapse decision is the heart of the feature: a manual override (from the
// toggle button) must win, but with no override the HUD follows the window size
// (auto-collapse when small). The breakpoint crossing that *clears* the override
// is integration behavior; this pins the pure rule it falls back to.
describe("hudCollapsed", () => {
	it("with no manual override, follows the window size", () => {
		expect(hudCollapsed(null, true)).toBe(true);   // small window -> collapsed
		expect(hudCollapsed(null, false)).toBe(false); // large window -> open
	});

	it("a manual override wins over the window size", () => {
		expect(hudCollapsed("collapsed", false)).toBe(true); // forced shut on a large window
		expect(hudCollapsed("open", true)).toBe(false);      // forced open on a small window
	});
});
