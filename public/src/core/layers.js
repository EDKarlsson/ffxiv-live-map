import { map } from "./map.js";

// Toggleable Leaflet layer groups + the layer control. Layer modules add their
// markers into these; the control lets the user toggle each. It lives top-left,
// stacked under the zoom control: the right side is the HUD's (which would cover
// a bottom-right control — the bug this placement fixes), and the bottom-left
// holds the status pill, so top-left is the only corner clear of both.
export const layers = {
	min: L.layerGroup().addTo(map),
	btn: L.layerGroup().addTo(map),
	fsh: L.layerGroup(),
	fishing: L.layerGroup(), // fishing holes (fishing-log spots; spearfishing stays in fsh)
	areas: L.layerGroup().addTo(map), // spawn-radius circles (own layer so they're toggleable & stable)
	fates: L.layerGroup(),
	npcs: L.layerGroup().addTo(map),
	vistas: L.layerGroup(),
	currents: L.layerGroup(),
	maplabels: L.layerGroup().addTo(map),
	pois: L.layerGroup().addTo(map),
	zonelinks: L.layerGroup().addTo(map),
};

L.control.layers(null, {
	"Map labels": layers.maplabels,
	"Points of interest": layers.pois,
	"Zone links": layers.zonelinks,
	"Miner nodes": layers.min,
	"Botanist nodes": layers.btn,
	"Spearfishing nodes": layers.fsh,
	"Fishing holes": layers.fishing,
	"Spawn areas": layers.areas,
	"FATEs": layers.fates,
	"Vistas": layers.vistas,
	"Aether currents": layers.currents,
}, { collapsed: false, position: "topleft" }).addTo(map);
