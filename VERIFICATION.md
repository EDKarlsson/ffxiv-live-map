# In-game verification checklist

Position, gathering nodes, node coordinates, and ET timers are already
live-verified. These four newer features work on paper (data cross-checked vs
the wiki and GarlandTools) but need a quick in-game confirmation.

Run with the daemon + bridge up (`scripts/start-bridge.sh` + `npm run
start:own-bridge`), map open at http://localhost:8787.

## Already pre-verified (data correctness, 2026-06-12)

- **Hunting Log** parsing — Gladiator 01-05 match consolegameswiki exactly
  (Little Ladybug ×3, Star Marmot ×3, Cactuar ×3, Snapping Shrew ×3, Hammer
  Beak ×3). Source is the game's own MonsterNote table via XIVAPI v2.
- **Timed-node ET window** — Spruce Log node = Providence Point, Lv50 Botanist,
  Unspoiled, ET 09:00: matches GarlandTools. ET math already live-verified.
- **Legendary flag** corrected to use the folklore field (was over-flagged).

## To confirm in-game

### 1. Hunting Log → jump accuracy
- Open Hunting Log panel, pick **Maelstrom** (your GC).
- Open the in-game Hunting Log (GC tab) and compare a rank's targets + counts.
- Click a target in the app → it should jump to a map where that mob spawns.
  Note: the app jumps to *any* spawn map from crowdsourced data, which may
  differ from the in-game log's single recommended zone. Both are valid — just
  confirm the mob actually appears where the dot lands.

### 2. Teamcraft list import → node match
- Import a list that contains **raw gathered mats** (not a pure crafting list —
  gear lists resolve to bought intermediates with no gatherables).
- For one gatherable item, click it → confirm it jumps to a real node, and the
  gold ring sits where that node actually is in-game.
- Cross-check one item's node vs its GarlandTools page if unsure.

### 3. Farming route → sanity
- Import a multi-item gatherable list, Farming route → source "Teamcraft list".
- Confirm the numbered path visits each required node and roughly matches a
  sensible walking order. (TSP is unit-tested; this is just a sanity look.)

### 4. "What's up now" → live ET
- Set Job + level cap to something you can reach; toggle "Only show up now".
- Pick a node marked **● UP**, click to jump, gather it in-game to confirm the
  window is actually open. Compare the app's ET clock to the in-game ET clock
  (top-right of the game screen) — should match to the minute.

## If something's off

Capture the item/mob name + what the app showed vs in-game, and we trace it to
the data file (`data/*.json`) or the coord/ET math.
