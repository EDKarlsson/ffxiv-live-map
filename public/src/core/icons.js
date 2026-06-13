// Node type enum + icons (Teamcraft nodeTypeName/nodeTypeIcon pipes) and the
// XIVAPI v2 asset URL builders. Pure string helpers — no Leaflet/DOM.
export const TYPE_NAMES = ["Mineral (MIN)", "Rocky (MIN)", "Tree (BTN)", "Vegetation (BTN)", "Fishing", "Spearfishing"];
const ICONS = ["060438", "060437", "060433", "060432", "060445", "060465"];
const TIMED_ICONS = ["060464", "060463", "060462", "060461", "060445", "060466"];

// XIVAPI v2 asset endpoint (v1 /i/ hotlinks are deprecated).
export const gameIcon = (id) => `https://v2.xivapi.com/api/asset?path=ui/icon/060000/${id}.tex&format=png`;

// Same, but for numeric icon ids in any folder (folder = id floored to 1000s —
// e.g. 63919 lives in ui/icon/063000/, not 060000).
export const iconAsset = (id) => {
	const s = String(id).padStart(6, "0");
	const folder = String(Math.floor(id / 1000) * 1000).padStart(6, "0");
	return `https://v2.xivapi.com/api/asset?path=ui/icon/${folder}/${s}.tex&format=png`;
};

export const iconUrl = (n) => gameIcon((n.limited || n.spawns.length ? TIMED_ICONS : ICONS)[n.type]);
