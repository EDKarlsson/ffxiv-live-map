/**
 * Vitest globalSetup — make sure the derived data/ files exist before the
 * backend integration tests boot the daemon. ensure-data.mjs is a no-op once
 * the files are present, so this only pays the ~20s build cost on a cold tree.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export default function setup() {
	const r = spawnSync(process.execPath, [join(root, "scripts/ensure-data.mjs")], { stdio: "inherit" });
	if (r.error) throw r.error;
	if (r.status !== 0) throw new Error("ensure-data failed in test globalSetup");
}
