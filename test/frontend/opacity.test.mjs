import { describe, it, expect } from "vitest";
import { clamp01, fracToPct, pctToFrac } from "../../public/src/core/opacity.js";

// The overlay sliders store opacity as fractions (Electron setOpacity) but show
// whole percentages; this is the conversion + clamping behind that, and the one
// piece of the overlay feature that runs in the browser (the rest is Electron glue).
describe("opacity helpers", () => {
	it("clamp01 bounds to [0,1] and coerces strings/NaN", () => {
		expect(clamp01(-0.5)).toBe(0);
		expect(clamp01(1.5)).toBe(1);
		expect(clamp01(0.42)).toBe(0.42);
		expect(clamp01("0.3")).toBe(0.3);
		expect(clamp01(NaN)).toBe(0);
	});

	it("fracToPct / pctToFrac round-trip whole percents", () => {
		for (const pct of [0, 10, 55, 100]) {
			expect(fracToPct(pctToFrac(pct))).toBe(pct);
		}
	});

	it("fracToPct rounds to a whole percent", () => {
		expect(fracToPct(0.555)).toBe(56);
		expect(fracToPct(1)).toBe(100);
	});

	it("pctToFrac clamps out-of-range percents", () => {
		expect(pctToFrac(150)).toBe(1);
		expect(pctToFrac(-20)).toBe(0);
	});
});
