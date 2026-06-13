import { IMG } from "./constants.js";

// Leaflet map singleton + the custom panes overlays rely on. Leaflet is loaded
// from the CDN <script> in index.html, so `L` is a global here.
export const map = L.map("map", { crs: L.CRS.Simple, minZoom: -2, maxZoom: 3, zoomSnap: 0.25 });
export const bounds = [[0, 0], [IMG, IMG]];
map.fitBounds(bounds);

// Dedicated pane for the base map image, below the overlay pane (z 400) so
// vector overlays (spawn-area circles, route lines) always render on top of it.
// Without this, the image (added to overlayPane) paints over the circles.
map.createPane("basemap");
map.getPane("basemap").style.zIndex = 250;
// Dedicated SVG renderer in a high pane so spawn-area circles/route lines are
// guaranteed above the base image regardless of add order.
map.createPane("vectors");
map.getPane("vectors").style.zIndex = 450;
export const vectorRenderer = L.svg({ pane: "vectors" });
// Dedicated top pane for the player dot so it's always above every node, label,
// POI and NPC marker (those all share Leaflet's default markerPane, z-index 600).
// Sits above markers + their hover tooltips (650), just below click popups (700).
map.createPane("player");
map.getPane("player").style.zIndex = 680;
