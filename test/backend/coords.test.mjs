import { describe, it, expect } from "vitest";
import { toMapCoord, toPixel, convertPosition, mapById, mapForTerritory } from "../../src/coords.mjs";

// Pure coordinate math — the formula is documented in src/coords.mjs:
//   c = size_factor / 100
//   mapCoord = (41 / c) * ((raw + offset) * c + 1024) / 2048 + 1
//   pixel    = (raw + offset) * c + 1024
// These tests pin that behavior so the modularization PRs can't silently drift it.
describe("coords math", () => {
	const map = { offset_x: 0, offset_y: 0, size_factor: 100 }; // c = 1

	it("toMapCoord: raw 0 / offset 0 / size 100 -> 21.5 (map center)", () => {
		// (41/1) * (1024/2048) + 1 = 20.5 + 1
		expect(toMapCoord(0, 0, 100)).toBeCloseTo(21.5, 6);
	});

	it("toPixel: raw 0 / offset 0 / size 100 -> 1024 (image center)", () => {
		expect(toPixel(0, 0, 100)).toBe(1024);
	});

	it("toPixel scales by c = size_factor/100", () => {
		expect(toPixel(100, 0, 200)).toBe(100 * 2 + 1024);
	});

	it("toMapCoord and toPixel are mutually consistent", () => {
		// Documented relation: pixel = (mapCoord - 1) * 2048 * c / 41
		const sf = 200, c = sf / 100, raw = 37, off = -15;
		const mc = toMapCoord(raw, off, sf);
		const px = toPixel(raw, off, sf);
		expect((mc - 1) * 2048 * c / 41).toBeCloseTo(px, 5);
	});

	it("convertPosition uses pos.x + pos.z for the map plane (pos.y is altitude)", () => {
		const p = convertPosition({ x: 50, y: 999, z: -30 }, map);
		expect(p.mapX).toBeCloseTo(toMapCoord(50, 0, 100), 6);
		expect(p.mapY).toBeCloseTo(toMapCoord(-30, 0, 100), 6); // z, not y
		expect(p.altitude).toBe(999);
		expect(p.pixelX).toBe(toPixel(50, 0, 100));
		expect(p.pixelY).toBe(toPixel(-30, 0, 100));
	});

	it("mapForTerritory(129) resolves a real map with a size_factor + xivapi image", () => {
		const m = mapForTerritory(129); // Limsa Lominsa Lower Decks
		expect(m).toBeTruthy();
		expect(typeof m.size_factor).toBe("number");
		expect(m.image).toContain("xivapi.com");
	});

	it("mapById returns null for an unknown id", () => {
		expect(mapById(-12345)).toBeNull();
	});
});
