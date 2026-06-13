import { describe, it, expect } from "vitest";
import { px2ll, coordToPx, pxToCoord, coordLL } from "../../public/src/core/coords.js";
import { state } from "../../public/src/core/state.js";

describe("frontend coords", () => {
	it("coordToPx / pxToCoord are inverses", () => {
		for (const sf of [100, 200, 95, 400]) {
			for (const coord of [1, 10, 21.5, 42]) {
				expect(pxToCoord(coordToPx(coord, sf), sf)).toBeCloseTo(coord, 6);
			}
		}
	});

	it("coordToPx(1, sf) === 0 (map coord 1 maps to pixel 0)", () => {
		expect(coordToPx(1, 100)).toBe(0);
	});

	it("px2ll flips y into Leaflet Simple CRS (IMG - y)", () => {
		expect(px2ll(100, 200)).toEqual([2048 - 200, 100]);
	});

	it("coordLL uses the viewed map's size_factor", () => {
		state.viewedMap = { size_factor: 100 };
		expect(coordLL(10, 20)).toEqual([2048 - coordToPx(20, 100), coordToPx(10, 100)]);
	});
});
