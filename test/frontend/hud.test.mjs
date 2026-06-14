import { describe, it, expect } from "vitest";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Thin guard that the HUD markup keeps every control the app wires up — so PR1's
// extraction of the inline <script>/<style> can't silently drop an input or
// panel. The substantive frontend unit tests (TSP, clustering, Eorzea time,
// coord math, set-cover, list-URL parsing) land in PR1, once that logic moves
// into importable public/src/ modules.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "public/index.html"), "utf-8");

const win = new Window();
const doc = new win.DOMParser().parseFromString(html, "text/html");

describe("index.html HUD structure", () => {
	const ids = [
		"map", "hud", "hudToggle", "zoneName", "mapPicker", "contentOnly", "followToggle", "keepZoom",
		"coordsText", "findMe", "captureToggle", "manualPos", "nodeCount", "etClock", "timedPanel",
		"overlaySection", "ovFocused", "ovUnfocused", "ovPassthrough",
		"upJob", "upLevel", "upOnly", "upList",
		"mobSearch", "mobList", "npcSearch", "npcQuest", "npcVendor", "npcInfo",
		"matSearch", "matList", "treasureList", "aetherInfo",
		"huntClass", "huntList", "listId", "listImport", "listInfo", "listItems",
		"routeSource", "routePlan", "routeClear", "routeInfo",
		"placeToggle", "iconPalette", "markerHint", "sizePanel", "sizeReset", "status",
	];

	it.each(ids)("has #%s", (id) => {
		expect(doc.getElementById(id)).not.toBeNull();
	});

	it("bootstraps the app via a <script> (inline pre-PR1, type=module post-PR1)", () => {
		expect(doc.querySelectorAll("script").length).toBeGreaterThan(0);
	});
});
