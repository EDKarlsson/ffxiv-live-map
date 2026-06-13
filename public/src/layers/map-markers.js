import { layers } from "../core/layers.js";
import { px2ll, pxToCoord } from "../core/coords.js";
import { iconAsset } from "../core/icons.js";
import { viewMap, setFollow } from "../core/view-map.js";

// In-game map markers: place-name labels, POI icons, zone links (pixel coords).
export async function loadMapMarkers(m) {
	layers.maplabels.clearLayers();
	layers.pois.clearLayers();
	layers.zonelinks.clearLayers();
	const mks = await fetch(`/map-markers?map=${m.id}`).then((r) => r.json());
	const jumpTo = async (target) => {
		setFollow(false);
		const tm = await fetch(`/map?id=${target}`).then((r) => r.json());
		if (tm) viewMap(tm);
	};
	for (const mk of mks) {
		const ll = px2ll(mk.x, mk.y);
		if (mk.type === 1 && mk.target) {
			// Zone link — click jumps to the adjacent/linked map.
			const name = mk.targetName ?? mk.label ?? "linked map";
			const icon = mk.icon
				? L.divIcon({ className: "node-icon poi-icon", html: `<img src="${iconAsset(mk.icon)}">`, iconSize: [24, 24], iconAnchor: [12, 12] })
				: L.divIcon({ className: "", html: `<div class="map-label zlink">⮕ ${mk.label || name}</div>`, iconSize: null });
			const lm = L.marker(ll, { icon }).bindTooltip(`Go to ${name}`);
			lm.on("click", () => jumpTo(mk.target));
			layers.zonelinks.addLayer(lm);
			continue;
		}
		// POI icon (aetherytes type 3, aethernet 4, everything else 0). Hover name:
		// the marker's own label, else the MapSymbol name the daemon attached
		// ("Repairs", "Shop", …), else the type kind.
		if (mk.icon) {
			const kind = mk.type === 3 ? "Aetheryte" : mk.type === 4 ? "Aethernet shard" : "";
			const hover = [mk.label?.split("\n")[0] || mk.name, kind].filter(Boolean).join(" — ") || kind;
			const pm = L.marker(ll, {
				icon: L.divIcon({ className: "node-icon poi-icon", html: `<img src="${iconAsset(mk.icon)}">`, iconSize: [24, 24], iconAnchor: [12, 12] }),
				interactive: !!hover,
			});
			if (hover) pm.bindTooltip(hover).bindPopup(`<b>${hover}</b> <span class="nlvl">(${pxToCoord(mk.x, m.size_factor).toFixed(1)}, ${pxToCoord(mk.y, m.size_factor).toFixed(1)})</span>`);
			layers.pois.addLayer(pm);
		}
		// Text label (offset below when it shares the spot with an icon).
		if (mk.label) {
			layers.maplabels.addLayer(L.marker(ll, {
				icon: L.divIcon({ className: "", html: `<div class="map-label" ${mk.icon ? 'style="translate:-50% 8px"' : ""}>${mk.label}</div>`, iconSize: null }),
				interactive: false,
			}));
		}
	}
}
