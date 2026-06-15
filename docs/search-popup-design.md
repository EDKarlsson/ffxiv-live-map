# Spotlight-style search popup — design & implementation plan

Design record for **issue #24**. Dated 2026-06-14. Uses the keyboard-shortcut
system from #26 (the `⌘K` / `open-search` action it reserved) and the config
layer / modal conventions from #12.

## Goal

One keyboard-driven popup to find and jump to anything, plus quick external lookups.
Acceptance criteria (from #24):

1. A popup opens via a shortcut (default **⌘K**) and closes on Esc.
2. `/{category} text` searches the right dataset and, on selection, navigates the map —
   zones switch the displayed map; map-located results fly to the spot.
3. `/zone …` finds a zone and goes to it.
4. `@{site} text` opens the corresponding external search in a new tab.
5. Results are keyboard-navigable.

## Decisions

- **Opened by the #26 shortcut.** `open-search` is added to the shortcut registry with a
  default of `⌘K` (`meta+k`); it calls `openSearch()`. (Reserved by #26.)
- **Bare text = zone search.** The headline ask ("search a zone and go to it") is the
  no-prefix default; `/cat` switches category, `@site` does an external lookup. Typing just
  `/` or `@` lists the available categories / sites as you narrow the prefix.
- **Reuse, don't duplicate.** Material results reuse `find-material.js`'s `matJump` (jump +
  ring the item's nodes); zones reuse the map-picker's maps list + `viewMap`. Small exports
  are added rather than re-implementing.
- **npc / monster go through one new `/search` endpoint** that filters the already-loaded
  `npcDb` / `mobNames`+`mobMaps` server-side (capped) — no new data, mirrors `/find-material`.
- **v1 categories:** `zone`, `material` (alias `mineral`), `npc`, `monster` — the ones the
  request named. `fate` / `vista` / `item` are easy follow-ups on the same scaffolding.
- **Sites:** garlandtools, universalis, teamcraft, wiki (consolegameswiki) — open an external
  search URL in a new tab.

## Query grammar — `parseQuery(raw)` (pure)

| Input | Result |
|-------|--------|
| `limsa` | `{ kind: "zone", term: "limsa" }` |
| `/npc nanamo` | `{ kind: "category", cat: "npc", term: "nanamo" }` |
| `/min copper` | `{ kind: "category", cat: "material", term: "copper" }` (alias) |
| `/z`(partial) | `{ kind: "category", cat: null, prefix: "z" }` → show category hints |
| `@uni iron` | `{ kind: "site", site: "universalis", term: "iron" }` |

Canonical categories + aliases and the site list live next to `parseQuery` so the helper
is the single source of truth (and unit-testable).

## Architecture — `public/src/features/search.js` (new)

- `parseQuery`, `siteUrl(site, term)` — pure, tested.
- `openSearch()` / `closeSearch()` — toggle `#searchModal`, focus the input.
- `initSearch()` — wires the input (debounced), keyboard nav (↑/↓/Enter/Esc), and result
  clicks; installs nothing global beyond what the shortcut provides.
- Per-kind run:
  - **zone** → filter the maps list → `goToMap(id)`.
  - **material** → `GET /find-material?q=` → `matJump(hit)` (jump + ring).
  - **npc / monster** → `GET /search?cat=&q=` → `goToMap(map)` + `flyTo`.
  - **site** → Enter opens `siteUrl(site, term)` in a new tab.
- Typing guard: the popup input is a normal text field, so the #26 dispatcher's
  input-guard keeps shortcuts from firing while you type the query.

## Backend — `GET /search?cat=<npc|monster>&q=<text>` (new, `src/router.mjs`)

- `npc` → flatten `db.npcDb` (map → npcs), match name/title, return `{name, sub, map, x, y}` (cap 20).
- `monster` → match `db.mobNames`, take the first of `db.mobMaps[id]`, look up a spawn point in
  `db.monsterDb[map][id].points[0]`, return `{name, sub, map, x, y}` (cap 20).
- `<2` chars → `[]` (same contract as `/find-material`).

## Files

| File | Change |
|------|--------|
| `public/src/features/search.js` | **new** — popup, parser, per-kind search + nav, keyboard |
| `public/index.html` | `#searchModal` markup |
| `public/styles.css` | popup + results styles |
| `public/src/app.js` | `initSearch()` |
| `public/src/features/shortcuts.js` | add the `open-search` action (default `⌘K`) |
| `public/src/features/find-material.js` | export `matJump` for reuse |
| `public/src/features/map-picker.js` | export `searchZones` + `goToMap` |
| `src/router.mjs` | the `/search` endpoint |
| `test/frontend/search.test.mjs` | **new** — `parseQuery`, `siteUrl` |
| `test/backend/endpoints.test.mjs` | `/search?cat=npc` shape + `<2`-char `[]` |

## Risks / edge cases

- **Debounce** the input (250 ms, like find-material) so per-keystroke server scans of 23k
  NPCs stay cheap.
- **Keyboard nav** wraps; Enter on the active row runs its action; Esc closes (and is handled
  before the global dispatcher via the input focus guard).
- **Unknown / partial category or site** → show the matching options as hints rather than an
  error; Enter with no valid target is a no-op.
- **Results built with DOM/textContent**, not innerHTML (names/titles are game data).
- **`⌘K` default is Mac-oriented** (`meta+k`); rebindable via #26. A `mod` normalization for
  Windows/Linux is a follow-up.
