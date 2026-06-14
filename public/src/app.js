// Entry point. Importing the modules creates the Leaflet map, panes and layer
// groups (their top-level code runs once); this file then wires every DOM event
// handler and kicks off the initial data loads. Keeping all wiring here lets the
// feature modules stay side-effect-free at import (and unit-testable).
import { setFollow } from "./core/view-map.js";
import { connect } from "./core/ws.js";
import { findMe } from "./core/player.js";
import { tick } from "./layers/nodes.js";
import { renderMobList } from "./layers/monsters.js";
import { renderNpcs, renderNpcRoles } from "./layers/npcs.js";
import { matSearchInput } from "./features/find-material.js";
import { initWhatsUp, renderUp } from "./features/whats-up.js";
import { buildHunt } from "./features/hunting-log.js";
import { planRoute, clearRoute } from "./features/route.js";
import { listImport } from "./features/list-import.js";
import { initCustomMarkers } from "./features/custom-markers.js";
import { applySizes, buildSizePanel, resetSizes } from "./features/icon-sizes.js";
import { buildPicker } from "./features/map-picker.js";
import { initCaptureToggle } from "./features/capture-toggle.js";
import { initManualPosition } from "./features/manual-position.js";
import { initHudToggle } from "./features/hud-toggle.js";

const $ = (id) => document.getElementById(id);

// --- DOM wiring (was inline next to each section in the old index.html) -------
$("mobSearch").oninput = renderMobList;
$("npcSearch").oninput = renderNpcs;
$("npcQuest").onchange = renderNpcRoles;
$("npcVendor").onchange = renderNpcRoles;
$("matSearch").oninput = matSearchInput;
["upJob", "upLevel", "upOnly"].forEach((id) => $(id).addEventListener("input", renderUp));
$("routePlan").onclick = planRoute;
$("routeClear").onclick = clearRoute;
$("listImport").onclick = listImport;
$("sizeReset").onclick = resetSizes;
$("findMe").onclick = findMe;
$("followToggle").onchange = (e) => setFollow(e.target.checked);

// Zoom-reset on map switch is configurable (persisted). Set before any viewMap
// runs (a WebSocket state restore can call viewMap immediately on connect).
const keepZoomBox = $("keepZoom");
keepZoomBox.checked = (localStorage.getItem("keepZoom") ?? "1") === "1";
keepZoomBox.onchange = () => localStorage.setItem("keepZoom", keepZoomBox.checked ? "1" : "0");

// --- init panels + timers -----------------------------------------------------
initHudToggle();   // collapsible HUD (manual toggle + responsive auto-collapse)
initCustomMarkers();
initCaptureToggle();   // wire the browse/capture toggle before connect() (first WS state msg renders it)
initManualPosition();  // "set position on click" for browse mode
applySizes();
buildSizePanel();
setInterval(tick, 1000);       // ET clock + timed-node panel
setInterval(renderUp, 30000);  // refresh "what's up now" countdowns

// --- boot data ----------------------------------------------------------------
buildPicker();
buildHunt();
initWhatsUp();
connect();
