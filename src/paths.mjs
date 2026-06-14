import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// Derived data (read-only at runtime). In dev it lives in the repo's data/; the
// packaged Electron app sets FFXIV_DATA_DIR to its bundled Resources/data, since
// the app bundle is read-only.
export const DATA_DIR = process.env.FFXIV_DATA_DIR || join(REPO, "data");

// Writable runtime files (.state.json, custom-markers.json). The packaged app
// sets FFXIV_STATE_DIR to its userData dir (the bundle itself is read-only).
export const STATE_DIR = process.env.FFXIV_STATE_DIR || REPO;
