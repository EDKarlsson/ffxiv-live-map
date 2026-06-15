// Spotlight-style search popup (#24). Bare text searches zones; "/cat term" picks
// a category (zone / material / npc / monster); "@site term" opens an external
// search. Opened via the #26 keyboard shortcut (default ⌘K). Reuses the existing
// jump logic (find-material's matJump, the map-picker's goToMap) rather than
// duplicating it; npc/monster go through the global /search endpoint.
import { matJump } from "./find-material.js";
import { searchZones, goToMap } from "./map-picker.js";
import { map } from "../core/map.js";
import { coordLL } from "../core/coords.js";
import { parseQuery, siteUrl, CATEGORIES, SITES } from "./search-parse.js";

const $ = (id) => document.getElementById(id);
let results = [];  // [{ label, sub, run, keepOpen? }]
let active = -1;
let timer = null;

export function openSearch() {
	$("searchModal").hidden = false;
	const input = $("searchInput");
	input.value = "";
	input.focus();
	setResults([]);
}
export function closeSearch() {
	if ($("searchModal").hidden) return;
	$("searchModal").hidden = true;
}

function setResults(list) { results = list; active = list.length ? 0 : -1; render(); }

function render() {
	const box = $("searchResults");
	box.textContent = ""; // DOM build, not innerHTML — labels are game data
	results.forEach((r, i) => {
		const row = document.createElement("div");
		row.className = "sresult" + (i === active ? " active" : "");
		const label = document.createElement("span");
		label.textContent = r.label;
		row.append(label);
		if (r.sub) {
			const sub = document.createElement("span");
			sub.className = "smeta";
			sub.textContent = r.sub;
			row.append(sub);
		}
		// mousedown (not click) so the result runs before the input blurs/closes.
		row.onmousedown = (e) => { e.preventDefault(); choose(i); };
		box.append(row);
	});
}

function choose(i) {
	const r = results[i];
	if (!r) return;
	if (!r.keepOpen) closeSearch();
	r.run();
}

const zoneResults = (term) =>
	searchZones(term).map((z) => ({ label: z.label, sub: "zone", run: () => goToMap(z.id) }));

async function update() {
	const p = parseQuery($("searchInput").value);
	if (p.kind === "zone") return setResults(p.term.length < 2 ? [] : zoneResults(p.term));
	if (p.kind === "site") {
		if (!p.site) return setResults(hint("@", Object.keys(SITES), p.prefix));
		const url = siteUrl(p.site, p.term);
		return setResults(p.term ? [{ label: `Search ${p.site} for “${p.term}”`, sub: "↗ new tab", run: () => window.open(url, "_blank", "noopener") }] : []);
	}
	// category
	if (!p.cat) return setResults(hint("/", Object.keys(CATEGORIES), p.prefix));
	if (p.cat === "zone") return setResults(p.term.length < 2 ? [] : zoneResults(p.term));
	if (p.term.length < 2) return setResults([]);
	if (p.cat === "material") {
		const hits = await fetch(`/find-material?q=${encodeURIComponent(p.term)}`).then((r) => r.json());
		return setResults(hits.map((h) => ({ label: h.name, sub: `${h.nodes.length} spots · ${h.maps.length} maps`, run: () => matJump(h) })));
	}
	const hits = await fetch(`/search?cat=${p.cat}&q=${encodeURIComponent(p.term)}`).then((r) => r.json());
	setResults(hits.map((h) => ({ label: h.name, sub: h.sub, run: () => jumpTo(h.map, h.x, h.y) })));
}

async function jumpTo(mapId, x, y) {
	await goToMap(mapId);
	if (x != null && y != null) map.flyTo(coordLL(x, y), 2);
}

// Prefix hints: clicking one fills the sigil+name and keeps the popup open.
function hint(sigil, keys, prefix) {
	return keys.filter((k) => k.startsWith(prefix)).map((k) => ({
		label: `${sigil}${k}`, sub: sigil === "/" ? "category" : "site", keepOpen: true,
		run: () => { const i = $("searchInput"); i.value = `${sigil}${k} `; i.focus(); update(); },
	}));
}

export function initSearch() {
	// The #26 open-search shortcut (⌘K) opens us via this event — decoupled from
	// shortcuts.js so that module stays Leaflet-free.
	document.addEventListener("flm:open-search", openSearch);
	const input = $("searchInput");
	input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 200); });
	input.addEventListener("keydown", (e) => {
		if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, results.length - 1); render(); }
		else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
		else if (e.key === "Enter") { e.preventDefault(); if (active >= 0) choose(active); }
		else if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
	});
	// Click the dim backdrop to dismiss.
	$("searchModal").addEventListener("mousedown", (e) => { if (e.target.id === "searchModal") closeSearch(); });
}
