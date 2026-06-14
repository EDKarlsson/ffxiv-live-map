import { describe, it, expect } from "vitest";
import { tour, dist } from "../../public/src/core/tsp.js";

const key = (p) => `${p.x},${p.y}`;
const pathLen = (r) => r.slice(1).reduce((s, p, i) => s + dist(r[i], p), 0);

describe("tsp route solver", () => {
	it("dist is euclidean", () => {
		expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
	});

	it("returns points unchanged when fewer than 2", () => {
		expect(tour([])).toEqual([]);
		expect(tour([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
	});

	it("visits every point exactly once", () => {
		const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }];
		const r = tour(pts);
		expect(r).toHaveLength(pts.length);
		expect(new Set(r.map(key))).toEqual(new Set(pts.map(key)));
	});

	it("keeps the provided start fixed at index 0", () => {
		const start = { x: 5, y: 5, isStart: true };
		const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
		const r = tour(pts, start);
		expect(r[0]).toBe(start);
		expect(r).toHaveLength(pts.length + 1);
	});

	it("2-opt finds the perimeter path over square corners (len 30)", () => {
		const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
		expect(pathLen(tour(pts))).toBeLessThanOrEqual(30 + 1e-6);
	});

	it("reaches the brute-force optimum on a small set (open-path correctness)", () => {
		const pts = [{ x: 0, y: 0 }, { x: 1, y: 4 }, { x: 2, y: 0 }, { x: 3, y: 4 }, { x: 4, y: 0 }];
		const permutations = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
		const optimal = Math.min(...permutations(pts).map(pathLen));
		expect(pathLen(tour(pts))).toBeCloseTo(optimal, 6);
	});
});
