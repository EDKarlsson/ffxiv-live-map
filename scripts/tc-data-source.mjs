/**
 * Teamcraft data source — fetches the canonical JSON files from the
 * ffxiv-teamcraft GitHub repo (staging branch, always current) with a local
 * cache so repeated builds don't re-download.
 *
 * Why GitHub over a local checkout: the bundled data this app ships is derived
 * data; pulling the upstream source directly means anyone can rebuild it (and
 * it stays current with Teamcraft) without cloning the whole monorepo.
 *
 * Override order:
 *   --local <dir>   read from a local libs/data/src/lib/json dir instead
 *   --refresh       ignore cache, re-download
 *   --branch <ref>  use a different branch/tag (default: staging)
 *
 * Cache lives in scripts/.tc-cache/ (gitignored).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, ".tc-cache");

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const LOCAL_DIR = argVal("--local");
const BRANCH = argVal("--branch") ?? "staging";
const REFRESH = args.includes("--refresh");

const rawUrl = (file) =>
	`https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/${BRANCH}/libs/data/src/lib/json/${file}`;

/** Load one Teamcraft JSON file (by filename, e.g. "nodes.json"). */
export async function loadTcJson(file) {
	if (LOCAL_DIR) return JSON.parse(readFileSync(join(LOCAL_DIR, file), "utf-8"));

	if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
	const cached = join(CACHE_DIR, `${BRANCH}__${file}`);
	if (!REFRESH && existsSync(cached)) return JSON.parse(readFileSync(cached, "utf-8"));

	const url = rawUrl(file);
	process.stderr.write(`[tc-data] fetching ${file} from ${BRANCH}…\n`);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
	const text = await res.text();
	writeFileSync(cached, text);
	return JSON.parse(text);
}

export const dataSourceInfo = () =>
	LOCAL_DIR ? `local: ${LOCAL_DIR}` : `github: ffxiv-teamcraft@${BRANCH}`;
