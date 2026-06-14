import { describe, it, expect } from "vitest";
import { clusterPoints } from "../../public/src/core/cluster.js";

describe("clusterPoints", () => {
	it("merges points in the same grid cell into one averaged cluster", () => {
		const pts = [[1.0, 1.0, 0], [1.1, 1.0, 0], [1.0, 1.1, 0]];
		const out = clusterPoints(pts, 0.6);
		expect(out).toHaveLength(1);
		expect(out[0].n).toBe(3);
		expect(out[0].x).toBeCloseTo((1.0 + 1.1 + 1.0) / 3, 6);
		expect(out[0].fate).toBe(false);
	});

	it("keeps points in different cells separate", () => {
		expect(clusterPoints([[0, 0, 0], [10, 10, 0]], 0.6)).toHaveLength(2);
	});

	it("flags a cluster as fate when any member is a fate spawn", () => {
		expect(clusterPoints([[1, 1, 0], [1.1, 1, 1]], 0.6)[0].fate).toBe(true);
	});
});
