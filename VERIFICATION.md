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
- **Vistas** — Barracuda Piers: Limsa Upper Decks (9.6, 7.8) / ET 08:00–11:59 /
  Lookout matches the wiki Sightseeing Log table ((9.5, 7.8), 08:00–12:00).
- **Aether currents** — Coerthas Western Highlands + Dravanian Forelands field
  counts (4 each) and coords match the wiki "Aether Currents" page within 0.1;
  quest lists match (5 each).
- **Fishing holes** — from the game's FishingSpot sheet (via TC), not
  crowdsourced; Limsa Lower Decks spot carries the expected starter fish
  (Lominsan Anchovy, Merlthor Goby).

## To confirm in-game

### 1. Hunting Log → jump accuracy
- Open Hunting Log panel, pick **Maelstrom** (your GC).
- Open the in-game Hunting Log (GC tab) and compare a rank's targets + counts.
- Click a target in the app → it should jump to a map where that mob spawns.
  Note: the app jumps to *any* spawn map from crowdsourced data, which may
  differ from the in-game log's single recommended zone. Both are valid — just
  confirm the mob actually appears where the dot lands.

### 2. Teamcraft list import → node match
- Any list works now — the import decodes the full material breakdown, so gear
  lists show their raw mats under "To gather" with remaining amounts.
- For one gatherable item, click it → confirm it jumps to a real node, and the
  gold ring sits where that node actually is in-game.
- Cross-check one item's node vs its GarlandTools page if unsure.

### 3. Farming route → sanity
- Import a multi-item gatherable list, Farming route → source "Teamcraft list".
- Confirm the numbered path visits each required node and roughly matches a
  sensible walking order. (TSP is unit-tested; this is just a sanity look.)

### 4. New layers (added 2026-06-12 — restart the daemon first, hot-reload
### only covers data, not the new endpoints)
- **Fishing holes**: toggle "Fishing holes", go to any ARR coast/river — the
  circle should sit on fishable water; catch one listed fish.
- **Treasure spots**: open "Treasure maps" panel on e.g. Central Shroud, tick
  Timeworn Leather Map — ❌ pins; if you ever hold that map, compare one spot.
- **Vistas**: toggle "Vistas" in Limsa Upper Decks — Barracuda Piers 🔭 at
  (9.6, 7.8); stand there, /lookout in the ET window (+ Fair/Clear skies).
- **Aether currents**: HW-only — defer until you're in Heavensward. Panel
  should show "none on this map (ARR zones have no currents)" everywhere now.
- **Status pill**: with everything live, kill the bridge terminal — pill should
  flip to "no packet capture" within seconds; restart the bridge — it should
  return to "live" on its own (reconnect loop), no daemon restart.
- **Heading arrow**: face north on the in-game compass — the white arrow on
  your dot should point up; face east — arrow points right. (Formula is
  Teamcraft's mappy transform; if it's mirrored/offset, note which way.)
- **NPC roles**: tick "Quest givers" in Limsa Lower Decks — gold dots should
  sit on the guild receptionists (e.g. Wawalago's spot on the fisher pier).

### 5. "What's up now" → live ET
- Set Job + level cap to something you can reach; toggle "Only show up now".
- Pick a node marked **● UP**, click to jump, gather it in-game to confirm the
  window is actually open. Compare the app's ET clock to the in-game ET clock
  (top-right of the game screen) — should match to the minute.

## If something's off

Capture the item/mob name + what the app showed vs in-game, and we trace it to
the data file (`data/*.json`) or the coord/ET math.
