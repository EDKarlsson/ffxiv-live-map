import { describe, it, expect } from "vitest";
import { gameIcon, iconAsset, iconUrl, TYPE_NAMES } from "../../public/src/core/icons.js";

describe("icon url builders", () => {
	it("gameIcon builds a 060000-folder asset url", () => {
		expect(gameIcon("060438")).toBe("https://v2.xivapi.com/api/asset?path=ui/icon/060000/060438.tex&format=png");
	});

	it("iconAsset floors the folder to the 1000s and zero-pads", () => {
		expect(iconAsset(63919)).toBe("https://v2.xivapi.com/api/asset?path=ui/icon/063000/063919.tex&format=png");
		expect(iconAsset(71341)).toContain("/071000/071341.tex");
	});

	it("iconUrl uses timed icons for nodes with spawns, plain otherwise", () => {
		expect(iconUrl({ type: 0, spawns: [2], limited: false })).toContain("060464"); // TIMED_ICONS[0]
		expect(iconUrl({ type: 0, spawns: [], limited: false })).toContain("060438"); // ICONS[0]
	});

	it("TYPE_NAMES covers the 6 node types", () => {
		expect(TYPE_NAMES).toHaveLength(6);
	});
});
