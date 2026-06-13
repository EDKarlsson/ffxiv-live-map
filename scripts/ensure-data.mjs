/**
 * Ensure the derived data/ files exist, building them if missing.
 * Runs as an npm `prestart` hook so a fresh clone builds data on first launch
 * (fetched from the Teamcraft GitHub repo + XIVAPI v2). The data/ dir is
 * gitignored — it's derived, not source.
 *
 * Pass --force to rebuild regardless.
 */

import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "../data");
const force = process.argv.includes("--force");

// Sentinels — one per build script. If any is missing, (re)build everything.
// treasures.json covers the build-node-data additions (treasure + fishing);
// vistas.json covers build-extra-layers (vistas + aether currents).
const needed = ["nodes.json", "maps.json", "hunting-log.json", "treasures.json", "vistas.json"];
const missing = needed.filter((f) => !existsSync(join(DATA, f)));

if (!force && missing.length === 0) {
	process.exit(0);
}

console.log(force ? "[ensure-data] forced rebuild…" : `[ensure-data] building data (missing: ${missing.join(", ")})…`);
for (const script of ["build-node-data.mjs", "build-hunting-log.mjs", "build-extra-layers.mjs"]) {
	const r = spawnSync(process.execPath, [join(__dirname, script)], { stdio: "inherit" });
	if (r.status !== 0) {
		console.error(`[ensure-data] ${script} failed (exit ${r.status}).`);
		process.exit(1);
	}
}
console.log("[ensure-data] data ready.");
