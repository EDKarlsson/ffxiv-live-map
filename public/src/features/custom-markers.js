import { map } from "../core/map.js";
import { state } from "../core/state.js";
import { IMG } from "../core/constants.js";
import { coordLL, pxToCoord } from "../core/coords.js";

const customLayer = L.layerGroup().addTo(map);
let placing = false;
let selectedIcon = "📍";
// Emoji render everywhere with no external assets.
const MARKER_ICONS = ["📍", "⛏️", "🌿", "🎣", "⭐", "❗", "💰", "🗺️", "⚔️", "🏠", "🚩", "🔑"];

function addCustomMarker(cm) {
	const mk = L.marker(coordLL(cm.x, cm.y), {
		icon: L.divIcon({ className: "", html: `<div class="custom-pin">${cm.icon || "📍"}</div>`, iconSize: [24, 24], iconAnchor: [12, 22] }),
	}).bindPopup(`<b>${cm.icon || ""} ${cm.label || "Marker"}</b> <span class="nlvl">(${cm.x.toFixed(1)}, ${cm.y.toFixed(1)})</span><br><a href="#" data-del="${cm.id}">delete</a>`);
	mk.on("popupopen", (e) => {
		e.popup.getElement().querySelector("[data-del]").onclick = async (ev) => {
			ev.preventDefault();
			await fetch(`/custom?map=${state.viewedMap.id}&id=${cm.id}`, { method: "DELETE" });
			customLayer.removeLayer(mk);
		};
	});
	customLayer.addLayer(mk);
}

export async function loadCustom(m) {
	customLayer.clearLayers();
	const list = await fetch(`/custom?map=${m.id}`).then((r) => r.json());
	list.forEach(addCustomMarker);
}

// Build the icon palette and wire place-mode toggle + click-to-place (init-time).
export function initCustomMarkers() {
	const palette = document.getElementById("iconPalette");
	palette.innerHTML = MARKER_ICONS.map((ic) => `<span data-ic="${ic}" class="${ic === selectedIcon ? "sel" : ""}">${ic}</span>`).join("");
	[...palette.children].forEach((sp) => {
		sp.onclick = () => {
			selectedIcon = sp.dataset.ic;
			[...palette.children].forEach((s) => s.classList.toggle("sel", s === sp));
		};
	});

	document.getElementById("placeToggle").onchange = (e) => {
		placing = e.target.checked;
		document.getElementById("map").classList.toggle("placing", placing);
		document.getElementById("markerHint").textContent = placing
			? "Click the map to drop a marker." : "Place mode off. Click a marker to delete.";
	};

	map.on("click", async (e) => {
		if (!placing || !state.viewedMap) return;
		const x = pxToCoord(e.latlng.lng, state.viewedMap.size_factor);
		const y = pxToCoord(IMG - e.latlng.lat, state.viewedMap.size_factor);
		const label = prompt(`Label for marker at (${x.toFixed(1)}, ${y.toFixed(1)}):`, "");
		if (label === null) return;
		const cm = await fetch("/custom", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ map: state.viewedMap.id, x, y, label, icon: selectedIcon }),
		}).then((r) => r.json());
		addCustomMarker(cm);
	});
}
