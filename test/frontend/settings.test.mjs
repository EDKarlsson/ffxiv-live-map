import { describe, it, expect, beforeEach, vi } from "vitest";

// settings.js owns one namespaced localStorage key and a one-time migration of
// the old scattered keys. It reads localStorage at import, so each test imports a
// fresh module after seeding storage (vi.resetModules + dynamic import).
const importFresh = () => import("../../public/src/core/settings.js");

describe("settings (namespaced config store)", () => {
	beforeEach(() => { localStorage.clear(); vi.resetModules(); });

	it("returns the default when unset, then the stored value", async () => {
		const s = await importFresh();
		expect(s.getSetting("keepZoom", true)).toBe(true); // default
		s.setSetting("keepZoom", false);
		expect(s.getSetting("keepZoom", true)).toBe(false);
	});

	it("persists everything under one namespaced key", async () => {
		const s = await importFresh();
		s.setSetting("foo", 42);
		expect(JSON.parse(localStorage.getItem("flm:settings")).foo).toBe(42);
	});

	it("resetSettings clears everything back to defaults", async () => {
		const s = await importFresh();
		s.setSetting("a", 1);
		s.resetSettings();
		expect(s.getSetting("a", "def")).toBe("def");
	});

	it("tolerates a corrupt (non-object) stored value without throwing", async () => {
		localStorage.setItem("flm:settings", JSON.stringify("not-an-object"));
		vi.resetModules();
		const s = await importFresh();
		expect(s.getSetting("x", "def")).toBe("def");          // coerced back to {}
		expect(() => s.setSetting("x", 1)).not.toThrow();      // would throw on a primitive cache
		expect(s.getSetting("x", "def")).toBe(1);
	});

	it("migrates the legacy keepZoom + iconSizes keys on first load (no regression)", async () => {
		localStorage.setItem("keepZoom", "0");                      // old format: "1"/"0"
		localStorage.setItem("iconSizes", JSON.stringify({ node: 2 }));
		vi.resetModules();
		const s = await importFresh();
		expect(s.getSetting("keepZoom", true)).toBe(false);
		expect(s.getSetting("iconSizes", {})).toEqual({ node: 2 });
		// old keys are removed and folded into the one namespaced object
		expect(localStorage.getItem("keepZoom")).toBe(null);
		expect(localStorage.getItem("iconSizes")).toBe(null);
		expect(JSON.parse(localStorage.getItem("flm:settings"))).toMatchObject({ keepZoom: false, iconSizes: { node: 2 } });
	});
});
