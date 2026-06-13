// Per-category icon sizes, CSS-variable driven, persisted to localStorage. The
// sliders set --sz-* on :root; marker CSS scales inner elements live, so nothing
// needs re-rendering.
const SIZE_CATS = [
	["maplabel", "Map labels"],
	["poi", "Map POIs"],
	["node", "Gathering nodes"],
	["fish", "Fishing holes"],
	["fate", "FATEs"],
	["mob", "Monsters"],
	["npc", "NPCs"],
	["vista", "Vistas"],
	["cur", "Aether currents"],
	["tre", "Treasure"],
	["cust", "Custom markers"],
	["player", "Player dot"],
];

let iconSizes = {};
try { iconSizes = JSON.parse(localStorage.getItem("iconSizes") ?? "{}"); } catch { /* fresh */ }

export function applySizes() {
	for (const [key] of SIZE_CATS) {
		document.documentElement.style.setProperty(`--sz-${key}`, iconSizes[key] ?? 1);
	}
}

export function buildSizePanel() {
	const panel = document.getElementById("sizePanel");
	panel.innerHTML = SIZE_CATS.map(([key, label]) => {
		const v = iconSizes[key] ?? 1;
		return `<div class="srow"><label for="sz-${key}">${label}</label>` +
			`<input type="range" id="sz-${key}" data-k="${key}" min="0.5" max="3" step="0.25" value="${v}">` +
			`<span class="sval" id="szv-${key}">${v}×</span></div>`;
	}).join("");
	[...panel.querySelectorAll("input[type=range]")].forEach((sl) => {
		sl.oninput = () => {
			const k = sl.dataset.k;
			iconSizes[k] = Number(sl.value);
			document.getElementById(`szv-${k}`).textContent = `${sl.value}×`;
			localStorage.setItem("iconSizes", JSON.stringify(iconSizes));
			applySizes();
		};
	});
}

export function resetSizes() {
	iconSizes = {};
	localStorage.removeItem("iconSizes");
	applySizes();
	buildSizePanel();
}
