# ffxiv-live-map

Standalone live map for FFXIV: a small Node daemon reads your character's
position from game packets (via Teamcraft's pcap stack) and renders it as a
moving dot on the correct zone map in your browser — together with gathering
nodes (with Eorzea-time windows), monsters, FATEs, NPCs, fishing holes,
treasure dig spots, vistas, aether currents, Hunting Log targets, Teamcraft
list import, and TSP farming routes. No game files touched, no overlay
injection — packets in, WebSocket out.

📖 **Full documentation is in the [Wiki](https://github.com/EDKarlsson/ffxiv-live-map/wiki)** —
[User Guide](https://github.com/EDKarlsson/ffxiv-live-map/wiki/User-Guide) ·
[Architecture](https://github.com/EDKarlsson/ffxiv-live-map/wiki/Architecture) ·
[Running & Advanced](https://github.com/EDKarlsson/ffxiv-live-map/wiki/Running-and-Advanced) ·
[Data & Build](https://github.com/EDKarlsson/ffxiv-live-map/wiki/Data-and-Build) ·
[FAQ](https://github.com/EDKarlsson/ffxiv-live-map/wiki/FAQ)

## Screenshots

**Live player position** — your character (with heading arrow) on the correct
zone map, alongside in-game place labels, specialty POI icons, and clickable
zone links.

![Live player dot in Limsa Lominsa Lower Decks](docs/img/01-live-dot-limsa.png)

**Gathering nodes** — MIN/BTN nodes with dashed spawn-area circles; every popup
links the items straight to GarlandTools.

![Gathering node with its spawn-area circle and GarlandTools item links](docs/img/02-gathering-nodes.png)

**Timed nodes & "what's up now"** — live Eorzea-time countdowns; an active node
glows on the map while the global planner lists every unspoiled node currently up.

![A timed node glowing, with the timed-node panel and what's-up-now planner](docs/img/03-timed-node-glow.png)

**Teamcraft list import** — paste a list URL and it pulls Teamcraft's full
ingredient breakdown: a "To gather" checklist with remaining amounts and how
many maps each material spans, gold rings on every matching node, and a route
over them.

![Importing a Teamcraft gear list — the To-gather checklist with node rings and a route](docs/img/05-list-import.png)

**Farming routes** — a TSP-ordered path over a zone's gathering nodes, numbered
from where you're standing.

![A numbered farming route across South Shroud](docs/img/04-farming-route.png)

## A note on packet capture & ToS

Live position comes from [Deucalion](https://github.com/ff14wed/deucalion),
the same packet-capture stack FFXIV Teamcraft uses: a DLL reads the game's
already-decrypted network buffers in-process. Nothing is injected into
gameplay, nothing is sent to the server, and no game files are modified —
but like ALL third-party tools (including Teamcraft itself), this sits in
Square Enix's ToS gray area. Use at your own discretion.

Everything except the live player dot works without packet capture — the
daemon serves all map layers regardless of whether a bridge is connected.

## Quickstart

**Prereqs:** Node ≥ 18, FFXIV running, and **FFXIV Teamcraft desktop with
Packet Capture enabled** — Teamcraft injects Deucalion (the packet-capture DLL)
into the game, and this app attaches to it. (Browse mode needs only Node — see below.)

```sh
npm install
npm start
```

`npm start` builds the bundled data on first run, starts a Deucalion bridge,
launches the daemon, and opens the map in your browser at <http://localhost:8787>.
Leave it running and move around in game to see your dot; press **Ctrl+C** to
stop the daemon and the bridge together.

- **Browse mode** — `npm run browse` serves every layer with **no packet capture**
  (no bridge, no running game): a handy reference while you play on PS5.
- **Desktop app** — `npm run app` runs the whole stack in an Electron window with
  an always-on-top, click-through overlay over the game (needs Node ≥ 22.12).

→ See the wiki's [Running & Advanced](https://github.com/EDKarlsson/ffxiv-live-map/wiki/Running-and-Advanced)
for the `.dmg` build, ports, and daemon flags.

## What it does

- **Live player dot** on the correct zone map, with a heading arrow from packet rotation.
- **Gathering** — MIN/BTN/fishing/spearfishing nodes with spawn-area circles, GarlandTools
  links, and live Eorzea-time windows for timed/unspoiled nodes (glow when up), plus a
  global "what's up now" planner across every map.
- **Reference layers** — monsters, FATEs, NPCs (23k indexed), Hunting Log (12 logs), vistas,
  aether currents, treasure dig spots, and in-game place labels / POI icons / zone links.
- **Planning** — Teamcraft list import (checklist + node rings), material search, and
  TSP farming routes numbered from where you stand.
- **Runs without the game** — browse mode serves every layer with no capture; toggle capture
  on (or set a position manually) from the UI at any time.
- **Desktop overlay** — an always-on-top mini-map over the game with configurable focused /
  unfocused opacity, click-through, and corner/free-float placement.

Full walkthrough of every panel and layer is in the
[User Guide](https://github.com/EDKarlsson/ffxiv-live-map/wiki/User-Guide).

## Documentation

All prose docs live in the **[Wiki](https://github.com/EDKarlsson/ffxiv-live-map/wiki)**:

- **[User Guide](https://github.com/EDKarlsson/ffxiv-live-map/wiki/User-Guide)** — using the app: the map, every HUD panel and layer, browse mode, the overlay, custom markers, routes, list import.
- **[Architecture](https://github.com/EDKarlsson/ffxiv-live-map/wiki/Architecture)** — how it works: the daemon, the Deucalion bridge, the second-bridge rationale, coordinate math, packets.
- **[Running & Advanced](https://github.com/EDKarlsson/ffxiv-live-map/wiki/Running-and-Advanced)** — prereqs, run commands, the `.dmg` build, ports, daemon flags, Node/Electron versions.
- **[Data & Build](https://github.com/EDKarlsson/ffxiv-live-map/wiki/Data-and-Build)** — data sources, the build scripts, rebuilding after a patch, attribution.
- **[FAQ](https://github.com/EDKarlsson/ffxiv-live-map/wiki/FAQ)** — ToS, blank map, PS5 / browse mode, the second bridge, Node versions, the unsigned `.dmg`, and more.

## Data attribution

Game/world data is sourced from [FFXIV Teamcraft](https://ffxivteamcraft.com)
(MIT-licensed repo) and [XIVAPI v2](https://v2.xivapi.com); node and mob spawn
positions are community-crowdsourced via Teamcraft's mappy system; player
position comes from local packet capture ([Deucalion](https://github.com/ff14wed/deucalion)).
No game files are modified. Full attribution in
[Data & Build](https://github.com/EDKarlsson/ffxiv-live-map/wiki/Data-and-Build#attribution).

FINAL FANTASY XIV © SQUARE ENIX CO., LTD. All game content and materials are
trademarks and copyrights of Square Enix. This is an unaffiliated fan tool.

## License

[MIT](LICENSE)
