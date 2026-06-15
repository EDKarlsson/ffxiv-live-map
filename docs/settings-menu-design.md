# Settings menu + persistent configuration — design & implementation plan

Design record for **issue #12** ("Settings menu — persist configuration between sessions
(capture state + prefs)"). Dated 2026-06-14.

## Goal

Give the app a single, discoverable **Settings menu**, back the scattered persisted
preferences with one config layer, and make the **capture on/off state survive a restart**.

Acceptance criteria (from #12):

1. A Settings menu exists in the UI as a single surface for the app's persisted settings.
2. Capture start/stop state is saved and restored across app restarts.
3. Existing frontend prefs (keep-zoom, icon sizes, follow) continue to persist and are
   consolidated under one config surface, editable from the Settings menu.
4. Precedence is defined and honored: **CLI flag > persisted config > built-in default**.
5. No regression to current persisted behavior (keep-zoom and icon sizes still work).

## Decisions

- **Settings menu form — modal + declutter** (chosen over a HUD `<details>` section). A gear
  (`⚙`) button next to the HUD toggle opens a centered modal. The set-and-forget toggles
  **keep-zoom** and **follow** move *out* of the always-visible HUD top and live only in the
  modal. The modal is also the intended future home for the keyboard-shortcut editor (#26).
- **Frontend config — one namespaced key.** All persisted UI prefs go through a single
  `flm:settings` JSON object in `localStorage`, replacing the scattered one-off keys
  (`keepZoom`, `iconSizes`). A one-time migration copies the old keys forward so existing
  users keep their settings (AC 5).
- **Daemon config — a small on-disk file.** The user's capture on/off preference is written
  to `.settings.json` in the writable `STATE_DIR`, next to the existing `.state.json` /
  `custom-markers.json`. This is separate from `config.mjs` (CLI parsing) and from `state.mjs`
  (live zone/position).
- **Out of scope (this PR):** the keyboard-shortcut *editor* is #26; this PR provides the
  Settings menu + config layer it will build on. The HUD-collapse override (`hud-toggle.js`)
  keeps its own deliberately-ephemeral keys — it is cleared on a breakpoint cross, so it is
  not a persisted "setting" in the same sense and is intentionally left as-is.

## Architecture

### Frontend config layer — `public/src/core/settings.js` (new)

A tiny module owning one `localStorage` key. In-memory cache (reads are cheap), wrapped
writes (localStorage throws in private mode / when blocked — degrade to in-memory).

```
getSetting(key, default) -> value | default
setSetting(key, value)   -> persist
resetSettings()          -> clear all
```

On import it runs a **one-time migration**: if `flm:settings` lacks `keepZoom` / `iconSizes`
but the old standalone keys exist, copy them in and remove the old keys.

### Settings menu — `public/src/features/settings-menu.js` (new) + markup

- `index.html`: a `⚙` button (`#settingsBtn`) beside `#hudToggle`, and a `#settingsModal`
  dialog holding the relocated `#keepZoom` and `#followToggle` checkboxes, **Reset icon
  sizes** / **Reset all settings** buttons, and a note that capture state is restored on
  launch. The two checkboxes **keep their existing IDs** so `view-map.js` (`#keepZoom`,
  `setFollow` → `#followToggle`) keeps working — they're moved, not renamed, and the modal is
  hidden (not removed) so they stay in the DOM.
- `settings-menu.js`: `initSettings()` loads the persisted `keepZoom` / `follow` into the
  checkboxes + live state, wires change→persist, opens/closes the modal (gear, ✕, backdrop
  click, Esc), and wires the reset buttons. `keepZoom` / `follow` reads/writes flow through
  `settings.js`.
- `styles.css`: modal overlay + card, and `#settingsBtn` positioned like `#hudToggle`
  (shifts with `body.hud-collapsed`).

### Daemon persistence — `src/settings-store.mjs` (new) + wiring

- `settings-store.mjs` mirrors `markers-store.mjs`: read `.settings.json` on import, expose
  `getDaemonSetting(key, default)` / `setDaemonSetting(key, value)` (writes the file).
  Honors a `FFXIV_SETTINGS_FILE` env override (so tests/packaged app can redirect it).
- `router.mjs` `POST /capture`: after `enableCapture()` / `disableCapture()`, persist
  `captureEnabled = on`.
- `daemon.mjs` startup: in the default (no run-mode-flag) branch, honor the persisted
  preference (see Precedence).

## Precedence

The initial capture mode is decided once at boot. Explicit CLI flags always win; otherwise
the persisted preference; otherwise the built-in default (capture on).

| Condition | Initial mode |
|-----------|--------------|
| `--mock` | synthetic capture |
| `--no-capture` | browse (inert) |
| `--browse` | browse + game monitor |
| else, persisted `captureEnabled === false` | browse + game monitor (so it can still auto-attach) |
| else (persisted true / unset) | `enableCapture()` (default) |

## File-by-file plan

| File | Change |
|------|--------|
| `public/src/core/settings.js` | **new** — namespaced config layer + migration |
| `public/src/features/settings-menu.js` | **new** — modal wiring + pref load/persist |
| `public/index.html` | add `⚙` button + `#settingsModal`; remove `#keepZoom`/`#followToggle` from the HUD top |
| `public/styles.css` | modal + `#settingsBtn` styles |
| `public/src/app.js` | drop the inline keep-zoom/follow wiring; `initSettings()` |
| `public/src/features/icon-sizes.js` | read/write `iconSizes` via `settings.js` |
| `src/settings-store.mjs` | **new** — `.settings.json` read/write |
| `src/router.mjs` | persist `captureEnabled` on `POST /capture` |
| `src/daemon.mjs` | precedence in the startup branch |
| `.gitignore` | ignore `.settings.json` |

## Testing

- `test/frontend/settings.test.mjs` (new, happy-dom): `getSetting`/`setSetting`/`resetSettings`,
  and the old-key migration (via `vi.resetModules()` + seeded `localStorage`).
- `test/backend/settings-store.test.mjs` (new, node): persist → reload via a temp
  `FFXIV_SETTINGS_FILE`; default when no file.
- `test/backend/endpoints.test.mjs`: pass `FFXIV_SETTINGS_FILE` (temp) to the spawned daemon so
  `POST /capture` can't write into the repo, and assert the toggle persisted `captureEnabled`.

## Risks / edge cases

- **No regression (AC 5):** migration carries old `keepZoom` / `iconSizes` forward; covered by a test.
- **`view-map.js` reads `#keepZoom`:** the checkbox is *relocated, not removed*, and the modal is
  hidden (not detached), so `getElementById` still resolves. Same for `setFollow` → `#followToggle`.
- **Stray file in tests:** `POST /capture` now writes `.settings.json`; the `FFXIV_SETTINGS_FILE`
  override + the endpoints-test temp path + `.gitignore` keep it out of the repo.
- **`localStorage` unavailable** (private mode): all reads/writes wrapped — degrade to in-memory.
- **Follow behind a click:** an accepted trade-off of the "declutter" choice; `Find me` remains in
  the HUD for the common recenter action.
