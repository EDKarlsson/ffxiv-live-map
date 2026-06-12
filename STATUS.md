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
  /timed-nodes /hunting-log /list /custom`). Hot-reloads `data/` on change.
- `src/coords.mjs` — raw packet floats → in-game map coords / image pixels.
  Reads `data/maps.json`. Rewrites map image URLs to XIVAPI v2.
- `public/index.html` — single-file Leaflet UI, all layers + HUD panels.
- `scripts/build-node-data.mjs` + `build-hunting-log.mjs` — generate `data/`.
  `tc-data-source.mjs` fetches Teamcraft JSON from GitHub (staging) with cache.

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
| Teamcraft list import (Firestore REST) → node locations | ⚠️ decode verified, not in-game |
| Custom markers (emoji icons, server-persisted) | ✅ CRUD verified |
| Farming route (TSP, list-mode primary) | ✅ TSP unit-tested |
| Map browser (932 maps, content filter, floor labels) | ✅ |

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

## Left to do

1. **In-game verification pass** of the ⚠️ features (VERIFICATION.md).
2. **Layers:** aether currents, vistas, treasure-map (Timeworn) spots — same
   pattern, data in Teamcraft jsons.
3. **Regular fishing holes** — current data only has 64 spearfishing nodes (HW+);
   ARR fishing spots live in a separate `fishing-log` dataset not yet imported.
4. **Rotation** — captured but not rendered (could orient the player dot).
5. **Open-source polish before sharing with Teamcraft devs:** LICENSE file,
   screenshots in README, confirm no personal data in repo (checked: none —
   character/list IDs live only in the guide project). Be upfront that live
   position uses Deucalion packet capture (same ToS-gray area as Teamcraft).
