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

## Roadmap

- [ ] v1: live player dot on correct zone map ← **you are here**
- [ ] Verify coordinate formula against in-game map (live test)
- [ ] Marker layers: material nodes, monsters (GarlandTools links), hunting log mobs
- [ ] Timed node spawns with Eorzea-time countdowns
- [ ] Multiple custom markers with different icons (beats the in-game 1-flag limit)
- [ ] Teamcraft list import → mark required material locations
- [ ] Optimal farming route calculation
