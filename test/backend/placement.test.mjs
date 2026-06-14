import { describe, it, expect } from "vitest";
import { placementPosition } from "../../electron/placement.cjs";

// The overlay's snap-to-corner/center positions are computed from the display
// work area + window size; this is that pure math (the rest is Electron glue).
// A 1920x1080 work area at the origin, a 520x380 overlay, margin 12.
const work = { x: 0, y: 0, width: 1920, height: 1080 };
const size = { width: 520, height: 380 };

describe("placementPosition", () => {
	it("center is exact middle", () => {
		expect(placementPosition("center", work, size)).toEqual({ x: 700, y: 350 });
	});

	it("corners respect the margin", () => {
		expect(placementPosition("top-left", work, size)).toEqual({ x: 12, y: 12 });
		expect(placementPosition("top-right", work, size)).toEqual({ x: 1388, y: 12 });
		expect(placementPosition("bottom-left", work, size)).toEqual({ x: 12, y: 688 });
		expect(placementPosition("bottom-right", work, size)).toEqual({ x: 1388, y: 688 });
	});

	it("honors a work area offset (e.g. the menu bar)", () => {
		const off = { x: 0, y: 25, width: 1920, height: 1055 };
		expect(placementPosition("top-left", off, size)).toEqual({ x: 12, y: 37 });
	});

	it("unknown/free key falls back to center", () => {
		expect(placementPosition("free", work, size)).toEqual({ x: 700, y: 350 });
	});
});
