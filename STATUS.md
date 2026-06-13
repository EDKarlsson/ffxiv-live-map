# ffxiv-live-map — Status

*Snapshot: 2026-06-12, ~28 commits. A standalone live FFXIV map: reads your
character position from game packets and renders it (plus gathering, monster,
FATE, NPC, hunting-log layers) on the correct zone map in a browser.*

## How to run

Two terminals (game + Teamcraft with Packet Capture on must already be running):

```sh
scripts/start-bridge.sh        # 2nd Deucalion bridge on :31595 (auto-restarts)
npm run start:own-bridge       # daemon on http://localhost:8787 (bridge :31595)
```

Open <http://localhost:8787>. First run builds `data/` (~20s, from Teamcraft
GitHub + XIVAPI v2; cached). Teamcraft's own bridge (:31594) is single-client,
so we run our own on :31595 — that's why `start-bridge.sh` exists.

## Architecture

```
ffxiv_dx11.exe (Wine) ─ deucalion.dll ─ pipe ─ deucalion-bridge.exe ─ TCP :31595
  └ src/daemon.mjs (@ffxiv-teamcraft/pcap-ffxiv) ─ WebSocket + REST ─ public/index.html (Leaflet)
```

- `src/daemon.mjs` — packet capture → tracks position/zone → WebSocket push;
  serves bundled data via REST (`/nodes /monsters /fates /npcs /maps /map
  /timed-nodes /hunting-log /list /custom /treasures /fishing-spots /vistas
  /aether-currents`). Hot-reloads `data/` on change; reconnects to a dropped
  bridge indefinitely (2s→10s backoff).
- `src/coords.mjs` — raw packet floats → in-game map coords / image pixels.
  Reads `data/maps.json`. Rewrites map image URLs to XIVAPI v2.
- `public/index.html` — single-file Leaflet UI, all layers + HUD panels.
- `scripts/build-node-data.mjs` + `build-hunting-log.mjs` +
  `build-extra-layers.mjs` (vistas + aether currents from XIVAPI v2) —
  generate `data/`. `tc-data-source.mjs` fetches Teamcraft JSON from GitHub
  (staging) with cache.

## Features (all built; verification status noted)

| Feature | Status |
|---|---|
| Live player dot | ✅ live-verified in-game |
| Gathering nodes (MIN/BTN), spawn-area circles, GarlandTools links | ✅ live-verified |
| Timed-node ET countdowns + spin/glow when active | ✅ live-verified (legendary node) |
| "What's up now" global timed-node planner (job/level filter) | ⚠️ data-verified, not in-game |
| Monsters (per-mob toggles, clustered counts, FATE color) | ✅ coords live-verified |
| FATEs (icons + levels) | ⚠️ not in-game verified |
| NPCs (search-driven, 23k) | ⚠️ not in-game verified |
| Hunting Log (12 class/GC logs) | ⚠️ data EXACT vs wiki; jump not in-game verified |
| Teamcraft list import (Firestore REST) → node locations | ✅ live-verified incl. click-through; decodes BOTH `finalItems` and `items` so gear lists show "To gather" mats with remaining amounts (PAL 64-68 list → 28 gatherables) |
| Custom markers (emoji icons, server-persisted) | ✅ CRUD verified |
| Farming route (TSP, list-mode primary) | ✅ TSP unit-tested |
| Map browser (932 maps, content filter, floor labels) | ✅ |
| Fishing holes (335 spots, fish lists; fish jumpable from list import) | ✅ live-verified (Lower La Noscea) |
| Treasure dig spots (965, per-tier toggles) | ⚠️ TC crowdsourced data, not in-game verified (needs holding a map) |
| Vistas (340, ET window + emote + open-now) | ✅ live-verified (Lower La Noscea); Barracuda Piers matches wiki |
| Aether currents (152 field + quest lists, HW+) | ✅ render verified (CWH via map browser); ground truth waits for HW |
| Capture-status pill (live / no-capture / daemon down) | ⚠️ new, not tested against a real bridge drop |
| Material search → jump + ring nodes (incl. fish) | ✅ endpoint verified (copper/anchovy); jump uses the live-verified node coords |
| Icon-size sliders (per category, localStorage-persisted) | ✅ CSS-var driven; scales inner elements only (Leaflet owns the marker root transform) |
| NPC role toggles (quest givers gold / vendors green) | ✅ live-verified in Limsa |
| Player heading arrow (rotation) | ✅ live-verified vs in-game map arrow (Limsa, facing north) |

See `VERIFICATION.md` for the in-game checklist of the ⚠️ items.

## Key facts / gotchas

- **XIVAPI v2 has NO mob/node spawn coordinates** (static game sheets only).
  Teamcraft's crowdsourced "mappy" data is the only position source. v2 *is*
  used for map images, icons, and the Hunting Log (MonsterNote sheet).
- **Packet axis:** `pos.y` is ALTITUDE; map-Y comes from `pos.z`.
- **Own character:** `playerSpawn` fires for every nearby player — ours is the
  one where `sourceActor === targetActor`.
- **ET math:** 1 Eorzea hour = 175 real seconds; node `duration` is ET minutes.
- **Teamcraft's `legendary` flag is unreliable** (set on 195/225 timed nodes).
  Real Legendary = folklore-gated; we derive it from the `folklore` field.
- **Rebuilding data:** daemon hot-reloads `data/` via fs.watch. A *stale daemon*
  (old data in memory, e.g. started before a rebuild) is the usual cause of
  weird display (duplicate maps, empty filters) — it'll reload on next file
  change, or restart it.
- **Leaflet z-order:** the map image lives in a low `basemap` pane and vector
  overlays in a high `vectors` pane, else the image paints over the circles.
- **Data is gitignored** (`data/`) — derived, rebuilt on first run.
- **Aether currents from sheets:** field currents = EObjName "aether current"
  → EObj.Data → AetherCurrent, coords from Level (search by Object id).
  AetherCurrent has 448 rows but ~145 quest-less ones are padding with no
  EObj — the 152 placed ones are the complete field set (verified vs wiki;
  HW zones really have only 4 field currents each). Quest-locked currents
  have no field position; we list quest names instead. ARR zones: none.
- **XIVAPI v2 search:** space-separated clauses are OR (scored); prefix `+`
  for AND. `Data>=a Data<=b` without `+` matches nearly everything.
- **Daemon restart needed after code changes** — hot-reload covers `data/`
  only. A daemon started before this update serves the old endpoints (no
  /vistas etc.) even after a data rebuild.

## Left to do

1. **In-game verification pass** of the ⚠️ features (VERIFICATION.md) —
   now includes the four new layers + a bridge-drop test of the status pill.
2. ~~Rotation~~ — DONE 2026-06-12: heading arrow on the player dot, Teamcraft
   mappy formula. Verify in-game that the arrow matches facing.
3. **Open-source polish before sharing with Teamcraft devs:** LICENSE file,
   screenshots in README, confirm no personal data in repo (checked: none —
   character/list IDs live only in the guide project). Be upfront that live
   position uses Deucalion packet capture (same ToS-gray area as Teamcraft).
4. ~~NPC role toggles~~ — DONE 2026-06-12 (quest givers from Quest.IssuerStart,
   vendors from shops-by-npc; gold/green dots). Future refinement: more
   "special interaction" categories (inn keepers, aetheryte tickers are EObjs).
5. **Packaging — researched, path decided** (docs/packaging-research.md):
   single-binary Node (core SEA or @yao-pkg/pkg) + GitHub Releases + Homebrew
   tap for installable releases now; Electron later for the overlay (its main
   process IS Node — daemon runs unmodified; Teamcraft precedent).
6. **Mini-map overlay mode** — compact always-on-top transparent window over
   the game. Per the research: Electron BrowserWindow {transparent, frame:
   false, alwaysOnTop} + setIgnoreMouseEvents; works over fullscreen-windowed
   FFXIV. Tauri rejected (macOS transparency = private API + open bugs).
7. **Map labels** — place-name text on the map (toggleable), like the in-game
   map. Likely source: the game's MapMarker sheet via XIVAPI v2 (drives the
   in-game labels); needs probing — do NOT trust icon/type ids from memory.
8. **Real icons for dots/markers** — replace the colored npc/mob dots and
   emoji pins with in-game icons (already have the v2 asset endpoint pattern;
   MapMarker rows carry icon ids per POI type).
9. **Zone links** — clickable exit markers at zone borders that jump to the
   adjacent map (MapMarker map-link entries carry the target map id).
10. **Specialty-location markers** — materia melder, repairs, company chest,
    market boards, aetherytes (TC aetherytes.json exists too), summoning
    bells, chocobokeep, gatekeeper, guilds, grand companies. Mostly MapMarker
    rows with their in-game icons; one build extract likely covers 7/9/10 and
    feeds 8.
