import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// settings-store reads .settings.json at import, so each test points
// FFXIV_SETTINGS_FILE at a throwaway temp file and imports a fresh module.
let tmpDir;
afterEach(() => {
	if (tmpDir) { rmSync(tmpDir, { recursive: true, force: true }); tmpDir = null; }
	delete process.env.FFXIV_SETTINGS_FILE;
	vi.resetModules();
});

describe("settings-store (daemon persisted config)", () => {
	it("returns the default when no file exists yet", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "flm-set-"));
		process.env.FFXIV_SETTINGS_FILE = join(tmpDir, ".settings.json");
		vi.resetModules();
		const s = await import("../../src/settings-store.mjs");
		expect(s.getDaemonSetting("captureEnabled", true)).toBe(true);
	});

	it("persists a setting to disk and reloads it on a fresh import", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "flm-set-"));
		const file = join(tmpDir, ".settings.json");
		process.env.FFXIV_SETTINGS_FILE = file;
		vi.resetModules();
		const s = await import("../../src/settings-store.mjs");
		s.setDaemonSetting("captureEnabled", false);
		expect(JSON.parse(readFileSync(file, "utf-8")).captureEnabled).toBe(false);

		// A fresh import (simulating a daemon restart) reads the value back.
		vi.resetModules();
		const s2 = await import("../../src/settings-store.mjs");
		expect(s2.getDaemonSetting("captureEnabled", true)).toBe(false);
	});
});
