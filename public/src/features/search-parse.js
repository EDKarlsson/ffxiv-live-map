// Pure query parsing for the search popup (#24). No DOM / Leaflet, so it's
// unit-testable on its own; the popup glue lives in search.js.

// Canonical categories + the aliases a user can type for each.
export const CATEGORIES = {
	zone: ["zone", "zones", "map", "maps", "z"],
	material: ["material", "materials", "mat", "mineral", "min", "m"],
	npc: ["npc", "npcs", "n"],
	monster: ["monster", "monsters", "mob", "mobs"],
};

// External sites: aliases + the search URL for a term.
export const SITES = {
	garlandtools: { aliases: ["garlandtools", "garland", "gt", "g"], url: (q) => `https://www.garlandtools.org/db/#search/${encodeURIComponent(q)}` },
	universalis:  { aliases: ["universalis", "uni", "market", "u"],  url: (q) => `https://universalis.app/search?q=${encodeURIComponent(q)}` },
	teamcraft:    { aliases: ["teamcraft", "tc", "t"],               url: (q) => `https://ffxivteamcraft.com/search?query=${encodeURIComponent(q)}` },
	wiki:         { aliases: ["wiki", "w"],                          url: (q) => `https://ffxiv.consolegameswiki.com/index.php?search=${encodeURIComponent(q)}` },
};

const aliasIndex = (entries) => {
	const m = {};
	for (const [key, aliases] of entries) for (const a of aliases) m[a] = key;
	return m;
};
const CAT_BY_ALIAS = aliasIndex(Object.entries(CATEGORIES));
const SITE_BY_ALIAS = aliasIndex(Object.entries(SITES).map(([k, v]) => [k, v.aliases]));

// Classify the raw query. Bare text = zone search; "/cat term" picks a category;
// "@site term" an external lookup. An unknown/partial prefix returns cat/site=null
// + the typed prefix, so the UI can hint the matching options.
export function parseQuery(raw) {
	const text = (raw ?? "").replace(/^\s+/, "");
	if (text[0] === "/" || text[0] === "@") {
		const sigil = text[0];
		const m = text.slice(1).match(/^(\S*)(?:\s+([\s\S]*))?$/);
		const prefix = (m[1] ?? "").toLowerCase();
		const term = (m[2] ?? "").trim();
		return sigil === "/"
			? { kind: "category", cat: CAT_BY_ALIAS[prefix] ?? null, prefix, term }
			: { kind: "site", site: SITE_BY_ALIAS[prefix] ?? null, prefix, term };
	}
	return { kind: "zone", term: text.trim() };
}

// The external search URL for a site + term, or null for an unknown site.
export function siteUrl(site, term) {
	return SITES[site] ? SITES[site].url(term) : null;
}
