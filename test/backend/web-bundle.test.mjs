import { describe, it, beforeAll, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Runs the real esbuild build, which bundles the whole public/src import graph —
// so this catches bundle-time errors (bad import paths, etc.) that the per-module
// unit tests can't (they import pure leaves, not the full app.js graph).
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "public/dist");

describe("web bundle (esbuild)", () => {
	beforeAll(() => {
		rmSync(dist, { recursive: true, force: true });
		const r = spawnSync(process.execPath, [join(root, "scripts/build-web.mjs")], { cwd: root, stdio: "pipe" });
		if (r.status !== 0) throw new Error(`build:web failed:\n${r.stderr}`);
	}, 30000);

	it("produces a minified app.js that bundled the module graph", () => {
		const js = readFileSync(join(dist, "app.js"), "utf-8");
		expect(js.length).toBeGreaterThan(1000);
		expect(js.split("\n").length).toBeLessThan(10); // minified
		expect(js).toContain('L.map("map"'); // core/map.js made it into the bundle
	});

	it("produces a styles.css bundle + sourcemaps", () => {
		expect(existsSync(join(dist, "styles.css"))).toBe(true);
		expect(existsSync(join(dist, "app.js.map"))).toBe(true);
		expect(existsSync(join(dist, "styles.css.map"))).toBe(true);
	});
});
