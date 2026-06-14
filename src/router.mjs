import { readFile } from "fs/promises";
import { dirname, join, extname, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { db } from "./data-store.mjs";
import { state } from "./state.mjs";
import { customMarkers, saveMarkers } from "./markers-store.mjs";
import { readBody, MIME, mapParam, getParam, sendJson } from "./http-util.mjs";
import { mapById } from "./coords.mjs";
import { enableCapture, disableCapture } from "./capture.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "../public");

// Production index.html (dev asset tags rewritten to /dist/) is built once and
// cached — the root path is hit on every page load.
let prodHtmlCache = null;

// Ordered route table. Each route returns true once it has handled the request
// (mirrors the original `if (url.startsWith(...)) { …; return }` chain); requests
// matching nothing fall through to the static-file fallback below.
const routes = [
	(req, res) => {
		if (req.url !== "/favicon.ico") return false;
		res.writeHead(204); res.end(); return true;
	},
	(req, res) => {
		if (!req.url.startsWith("/nodes")) return false;
		const mapId = mapParam(req);
		const list = Object.entries(db.nodeDb)
			.filter(([, n]) => n.map === mapId)
			.map(([id, n]) => ({
				id: Number(id),
				...n,
				items: n.items.map((i) => ({ id: i, name: db.itemNames[i] ?? `#${i}` })),
				hiddenItems: n.hiddenItems.map((i) => ({ id: i, name: db.itemNames[i] ?? `#${i}` })),
			}));
		sendJson(res, list); return true;
	},
	(req, res) => {
		if (!req.url.startsWith("/monsters")) return false;
		const mobs = db.monsterDb[String(mapParam(req))] ?? {};
		const list = Object.entries(mobs).map(([id, m]) => ({
			id: Number(id),
			name: db.mobNames[id] ?? `#${id}`,
			lmin: m.lmin,
			lmax: m.lmax,
			points: m.points,
		})).sort((a, b) => a.lmin - b.lmin || a.name.localeCompare(b.name));
		sendJson(res, list); return true;
	},
	(req, res) => {
		if (req.url !== "/timed-nodes") return false;
		// All timed nodes across every map, with their map id so the "what's up now"
		// planner can route + jump globally.
		const mapName = Object.fromEntries(db.mapsIndex.map((m) => [m.id, m.name]));
		const list = Object.entries(db.nodeDb)
			.filter(([, n]) => n.spawns?.length)
			.map(([id, n]) => ({
				id: Number(id), type: n.type, level: n.level, map: n.map,
				mapName: mapName[n.map] ?? `Map ${n.map}`,
				x: n.x, y: n.y, spawns: n.spawns, duration: n.duration,
				ephemeral: n.ephemeral, legendary: n.legendary,
				items: n.items.map((i) => ({ id: i, name: db.itemNames[i] ?? `#${i}` })),
			}));
		sendJson(res, list); return true;
	},
	(req, res) => {
		if (!(req.url.startsWith("/fates") || req.url.startsWith("/vistas"))) return false;
		const source = req.url.startsWith("/fates") ? db.fateDb : db.vistaDb;
		sendJson(res, source[String(mapParam(req))] ?? []); return true;
	},
	(req, res) => {
		if (!req.url.startsWith("/npcs")) return false;
		// Attach roles ("q" quest giver / "s" shop / "qs" both) for UI toggles.
		const list = (db.npcDb[String(mapParam(req))] ?? []).map((n) => db.npcRoles[n.id] ? { ...n, role: db.npcRoles[n.id] } : n);
		sendJson(res, list); return true;
	},
	(req, res) => {
		if (!req.url.startsWith("/treasures")) return false;
		const list = (db.treasureDb[String(mapParam(req))] ?? []).map((t) => ({
			...t, itemName: db.itemNames[t.item] ?? db.allItemNames[t.item] ?? `#${t.item}`,
		}));
		sendJson(res, list); return true;
	},
	(req, res) => {
		if (!req.url.startsWith("/fishing-spots")) return false;
		const list = (db.fishingDb[String(mapParam(req))] ?? []).map((s) => ({
			...s, fishes: s.fishes.map((f) => ({ id: f, name: db.itemNames[f] ?? db.allItemNames[f] ?? `#${f}` })),
		}));
		sendJson(res, list); return true;
	},
	(req, res) => {
		if (!req.url.startsWith("/map-markers")) return false;
		// In-game map markers: labels, POI icons, zone links (pixel coords). Attach
		// the target map's display name to links; attach the MapSymbol name to
		// icon-only POIs for the hover tooltip (NOT as a text label).
		const mapName = Object.fromEntries(db.mapsIndex.map((m) => [m.id, m.name]));
		const list = (db.mapMarkerDb[String(mapParam(req))] ?? []).map((mk) => {
			if (mk.type === 1 && mk.target) return { ...mk, targetName: mapName[mk.target] ?? mk.label };
			if (!mk.label && db.mapSymbols[mk.icon]) return { ...mk, name: db.mapSymbols[mk.icon] };
			return mk;
		});
		sendJson(res, list); return true;
	},
	(req, res) => {
		if (!req.url.startsWith("/aether-currents")) return false;
		sendJson(res, db.aetherDb[String(mapParam(req))] ?? { fields: [], quests: [] }); return true;
	},
	async (req, res) => {
		if (!req.url.startsWith("/custom")) return false;
		if (req.method === "GET") {
			sendJson(res, customMarkers[String(mapParam(req))] ?? []); return true;
		}
		if (req.method === "POST") {
			const m = await readBody(req); // {map, x, y, label, color}
			if (![m.map, m.x, m.y].every((v) => Number.isFinite(Number(v)))) {
				res.writeHead(400); res.end("invalid marker"); return true;
			}
			const mapId = String(Number(m.map));
			const marker = { id: Date.now() + Math.floor(Math.random() * 1000), x: m.x, y: m.y, label: m.label || "", color: m.color || "#ffd470", icon: m.icon || "📍" };
			(customMarkers[mapId] ??= []).push(marker);
			saveMarkers();
			sendJson(res, marker); return true;
		}
		if (req.method === "DELETE") {
			const mapId = String(mapParam(req));
			const id = Number(getParam(req, "id"));
			if (customMarkers[mapId]) customMarkers[mapId] = customMarkers[mapId].filter((x) => x.id !== id);
			saveMarkers();
			res.writeHead(204); res.end(); return true;
		}
		return false; // other methods fall through (matches the original)
	},
	async (req, res) => {
		if (!req.url.startsWith("/list")) return false;
		// Import a Teamcraft list by id via Firestore REST (no auth). Decode both
		// arrays, keep gatherable items, attach node locations.
		const listId = getParam(req, "id");
		if (!listId) { res.writeHead(400); res.end("missing id"); return true; }
		try {
			const fsUrl = `https://firestore.googleapis.com/v1/projects/ffxivteamcraft/databases/(default)/documents/lists/${encodeURIComponent(listId)}`;
			const doc = await fetch(fsUrl).then((r) => r.json());
			if (doc.error) { res.writeHead(404); res.end(JSON.stringify({ error: doc.error.message })); return true; }
			const fields = doc.fields ?? {};
			const listName = fields.name?.stringValue ?? listId;
			const decode = (arr) => (arr ?? []).filter((v) => v?.mapValue?.fields).map((v) => {
				const f = v.mapValue.fields;
				const id = Number(f.id?.integerValue ?? 0);
				const amount = Number(f.amount?.integerValue ?? 0);
				const done = Number(f.done?.integerValue ?? 0);
				const nodes = db.itemNodes[id] ?? [];
				const maps = [...new Set(nodes.map((n) => n.map))];
				return { id, name: db.allItemNames[id] ?? db.itemNames[id] ?? `#${id}`, amount, done, gatherable: nodes.length > 0, maps, nodes };
			});
			const finals = decode(fields.finalItems?.arrayValue?.values);
			const items = decode(fields.items?.arrayValue?.values);
			sendJson(res, { id: listId, name: listName, finals, items });
		} catch (e) {
			res.writeHead(502); res.end(JSON.stringify({ error: e.message }));
		}
		return true;
	},
	(req, res) => {
		if (!req.url.startsWith("/find-material")) return false;
		// Search gatherable materials by name; prefix matches rank above substring,
		// capped at 20.
		const q = (getParam(req, "q") ?? "").trim().toLowerCase();
		if (q.length < 2) { sendJson(res, "[]"); return true; }
		const starts = [], contains = [];
		for (const id of Object.keys(db.itemNodes)) {
			const name = (db.itemNames[id] ?? db.allItemNames[id] ?? "").toLowerCase();
			if (!name) continue;
			if (name.startsWith(q)) starts.push(id);
			else if (name.includes(q)) contains.push(id);
			if (starts.length >= 20) break;
		}
		const hits = [...starts, ...contains].slice(0, 20).map((id) => ({
			id: Number(id),
			name: db.itemNames[id] ?? db.allItemNames[id],
			nodes: db.itemNodes[id],
			maps: [...new Set(db.itemNodes[id].map((n) => n.map))],
		}));
		sendJson(res, hits); return true;
	},
	(req, res) => {
		if (req.url !== "/hunting-log") return false;
		// Attach which maps each target mob appears on (for jump-to).
		const out = {};
		for (const [cls, entries] of Object.entries(db.huntingLog)) {
			out[cls] = entries.map((e) => ({
				...e, targets: e.targets.map((t) => ({ ...t, maps: db.mobMaps[t.mobId] ?? [] })),
			}));
		}
		sendJson(res, out); return true;
	},
	(req, res) => {
		if (req.url !== "/maps") return false;
		sendJson(res, db.mapsIndex); return true;
	},
	(req, res) => {
		if (!req.url.startsWith("/map?")) return false;
		sendJson(res, mapById(Number(getParam(req, "id")))); return true;
	},
	(req, res) => {
		if (req.url !== "/state") return false;
		sendJson(res, state); return true;
	},
	async (req, res) => {
		if (!req.url.startsWith("/capture")) return false;
		// Runtime capture control for the UI's browse/capture toggle. GET reports the
		// current mode; POST {on:true|false} attaches/detaches the packet-capture
		// stack. The mode transition itself is broadcast over WebSocket (via
		// setCaptureMode), so this just echoes the immediate state back to the caller.
		if (req.method === "GET") { sendJson(res, { mode: state.capture }); return true; }
		if (req.method === "POST") {
			// readBody() resolves {} on empty/invalid JSON, so require an explicit
			// boolean `on` — else a malformed body would silently disable capture.
			const { on } = await readBody(req);
			if (typeof on !== "boolean") { res.writeHead(400); res.end("expected { on: boolean }"); return true; }
			if (on) enableCapture(); else await disableCapture();
			sendJson(res, { mode: state.capture }); return true;
		}
		return false;
	},
];

export function createRequestHandler() {
	return async (req, res) => {
		try {
			for (const route of routes) {
				if (await route(req, res)) return;
			}
			// Static fallback: serve files from public/. Resolve + boundary-check so a
			// `/../…` URL can't escape the public dir (the daemon binds all interfaces).
			const file = req.url === "/" ? "index.html" : req.url.slice(1);
			// In production serve the minified bundle: rewrite index.html's dev asset
			// tags (/styles.css, /src/app.js) to the built /dist/ versions. Dev mode
			// keeps loading the unbundled source modules (no build step needed).
			if (file === "index.html" && process.env.NODE_ENV === "production") {
				prodHtmlCache ??= (await readFile(join(PUBLIC_DIR, "index.html"), "utf-8"))
					.replaceAll("/styles.css", "/dist/styles.css")
					.replaceAll("/src/app.js", "/dist/app.js");
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(prodHtmlCache);
				return;
			}
			const full = resolve(PUBLIC_DIR, file);
			if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + sep)) {
				res.writeHead(403); res.end("forbidden"); return;
			}
			try {
				const data = await readFile(full);
				res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
				res.end(data);
			} catch {
				res.writeHead(404);
				res.end("not found");
			}
		} catch (e) {
			// A handler threw (e.g. unexpected data shape) — don't leave it as an
			// unhandled rejection; surface a 500 if nothing was sent yet.
			console.error("[http] request failed:", e);
			if (!res.headersSent) { res.writeHead(500); res.end("internal error"); }
		}
	};
}
