# ffxiv-live-map

Standalone live map for FFXIV: a small Node daemon reads your character's
position from game packets (via Teamcraft's pcap stack) and renders it as a
moving dot on the correct zone map in your browser. No game files touched, no
overlay injection — packets in, WebSocket out.

**Status: v1 proof-of-concept** — live player dot on the correct zone map.

## How it works

```
ffxiv_dx11.exe (Wine / XIV on Mac)
   └─ deucalion.dll  (already injected by Teamcraft's bridge)
        └─ named pipe  ──  deucalion-bridge.exe (Wine)  ──  TCP 127.0.0.1:31594
                                                                │
                                              daemon.mjs (@ffxiv-teamcraft/pcap-ffxiv)
                                                                │  WebSocket
                                                  browser UI (Leaflet, dark mode)
```

Packets used (definitions in [pcap-ffxiv](https://github.com/ffxiv-teamcraft/pcap-ffxiv)):

| Packet | Direction | Gives us |
|---|---|---|
| `InitZone` | S→C | territory id on zone change + spawn position |
| `PlayerSpawn` | S→C | initial position |
| `UpdatePositionHandler` | C→S | position `{x,y,z}` + rotation on every move |
| `UpdatePositionInstance` | C→S | same, inside instances |

Raw world floats are converted to in-game map coordinates with each map's
`size_factor` / `offset_x` / `offset_y` from `data/maps.json` (copied from
ffxiv-teamcraft `libs/data/src/lib/json/maps.json`):

```
c = size_factor / 100
mapCoord = (41 / c) * ((raw + offset) * c + 1024) / 2048 + 1
```

Map images come from xivapi (2048×2048 jpg, URL included per map entry).

## Running

Prereqs: Node ≥ 18, FFXIV running, **Teamcraft desktop with Packet Capture
enabled** (its bridge listens on TCP 31594).

```sh
npm install
npm start            # daemon on http://localhost:8787, bridge port 31594
```

Open <http://localhost:8787>, then change zones or move in game.

Flags: `--bridge-port <n>` (default 31594), `--http-port <n>` (default 8787),
`--verbose`.

### Running alongside Teamcraft (required)

**Confirmed 2026-06-12:** Teamcraft's bridge accepts exactly one client — after
Teamcraft connects there is no LISTEN socket left on 31594 (verified with
`lsof`). Deucalion's named pipe *does* support multiple subscribers, so run a
second bridge on its own port:

```sh
scripts/start-bridge.sh           # spawns bridge on 31595 (keep it running)
npm run start:own-bridge          # daemon with --bridge-port 31595
```

The script mirrors Teamcraft's own launch (XIV on Mac wine + prefix,
WINEESYNC/WINEMSYNC/WINEFSYNC env) and finds the bridge exe / deucalion.dll
inside the Teamcraft app bundle. Re-injection is harmless: the DLL is already
loaded, the bridge just attaches a new pipe subscriber.

## Layers & features

- [x] Live player dot on correct zone map (verified in-game)
- [x] Gathering nodes — MIN/BTN/fishing, dotted spawn-area circles, GarlandTools item links
- [x] Timed/unspoiled nodes — live Eorzea-time countdowns, glow when up, sorted panel
- [x] Monsters — per-mob toggles, clustered spawn counts, FATE-spawn coloring
- [x] FATEs — real icons + levels
- [x] NPCs — search-driven (23k indexed), fly-to on single match
- [x] Hunting Log — 12 class/GC logs (XIVAPI v2 MonsterNote), click a target to jump to its spawns
- [x] Teamcraft list import — Firestore REST read, maps each required item's gathering nodes, checklist + jump
- [x] Custom markers — click-to-place with label, persisted server-side
- [x] Map browser — pick any of ~1200 maps (grouped by region), Follow-player toggle
- [x] Data served from XIVAPI v2 asset endpoints (v1 host is frozen)
- [ ] Optimal farming route calculation
- [ ] Aether currents / vistas / treasure spots layers

## Data build

Bundled JSON in `data/` is generated from the local Teamcraft checkout and
XIVAPI v2:

```sh
node scripts/build-node-data.mjs     # nodes, monsters, fates, npcs, maps, item indexes
node scripts/build-hunting-log.mjs   # hunting log (fetches XIVAPI v2 MonsterNote)
```
