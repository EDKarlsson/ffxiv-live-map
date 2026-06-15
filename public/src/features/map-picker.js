import { state } from "../core/state.js";
import { viewMap, setFollow } from "../core/view-map.js";

// Map browser: ~1200 maps grouped by region, with a "content only" filter.
let mapNameById = {};
let allMaps = [];
const mapLabel = (m) => `${m.name}${m.sub ? " — " + m.sub : ""}${m.index ? ` · Floor ${m.index + 1}` : ""}`;

export async function buildPicker() {
	allMaps = await fetch("/maps").then((r) => r.json());
	for (const m of allMaps) mapNameById[m.id] = mapLabel(m);
	renderPicker();
	const sel = document.getElementById("mapPicker");
	sel.onchange = () => { if (sel.value) goToMap(sel.value); };
	document.getElementById("contentOnly").onchange = renderPicker;
	if (state.viewedMap) applyPickerSelection(state.viewedMap); // options loaded after first zone restore
}

export function renderPicker() {
	const contentOnly = document.getElementById("contentOnly").checked;
	let shown = allMaps.filter((m) => !contentOnly || m.hasData);
	// Defensive: if filtering blanks the list (e.g. stale data without hasData),
	// fall back to showing everything rather than an empty picker.
	if (contentOnly && shown.length === 0) shown = allMaps;
	const groups = {};
	for (const m of shown) (groups[m.region] ??= []).push(m);
	const sel = document.getElementById("mapPicker");
	sel.innerHTML = `<option value="">— select a map (${shown.length}) —</option>` + Object.keys(groups).sort().map((region) =>
		`<optgroup label="${region}">` + groups[region]
			.sort((a, b) => a.name.localeCompare(b.name) || a.index - b.index)
			.map((m) => `<option value="${m.id}">${mapLabel(m)}</option>`).join("") +
		`</optgroup>`).join("");
	if (state.viewedMap) sel.value = String(state.viewedMap.id);
}

// Switch to a map by id (used by the picker and the search popup, #24).
export async function goToMap(id) {
	setFollow(false);
	viewMap(await fetch(`/map?id=${id}`).then((r) => r.json()));
}

// Filter the loaded maps by name for the search popup (#24) → [{id, label}].
export function searchZones(q, limit = 20) {
	const needle = q.trim().toLowerCase();
	if (!needle) return [];
	const hits = [];
	for (const m of allMaps) {
		const label = mapLabel(m);
		if (label.toLowerCase().includes(needle)) {
			hits.push({ id: m.id, label });
			if (hits.length >= limit) break;
		}
	}
	return hits;
}

// Reflect the viewed map in the picker + zone label (works once options exist).
export function applyPickerSelection(m) {
	const name = mapNameById[m.id];
	document.getElementById("zoneName").textContent = name || `Map #${m.id} (territory ${m.territory_id})`;
	const sel = document.getElementById("mapPicker");
	if (name) sel.value = String(m.id);
}
