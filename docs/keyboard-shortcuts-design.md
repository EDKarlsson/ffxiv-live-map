# Customizable keyboard shortcuts — design & implementation plan

Design record for **issue #26**. Dated 2026-06-14. Builds on the Settings menu +
config layer from #12.

## Goal

Give common actions keyboard shortcuts, rebindable from the Settings menu and
persisted. Acceptance criteria (from #26):

1. A defined set of actions have working default keyboard shortcuts in the browser app.
2. Shortcuts can be rebound and reset from the Settings menu, with conflict detection.
3. Custom bindings persist across sessions (via #12's config layer).
4. Shortcuts don't fire while typing in text inputs.

## Decisions

- **Actions are thin wrappers over existing controls.** Every bindable action just
  *clicks the control that already does the thing* (`#findMe`, `#followToggle`,
  `#captureToggle`, `#hudToggle`, `#settingsBtn`), so there's zero duplicated logic —
  the capture POST, HUD collapse, follow-persist, etc. all run exactly as on a real click.
- **Single-key defaults**, GitHub-style (`f`, `c`, `h`, `,`, `Shift+F`), because the
  guard below keeps them from firing while typing. All are rebindable.
- **Persistence via #12.** Custom bindings live under `getSetting("shortcuts")` /
  `setSetting("shortcuts", …)` in the one `flm:settings` object.
- **Editor lives in the Settings modal** — a "Keyboard shortcuts" section, exactly the
  home #12 was built to host.
- **Overlay toggle stays on the Electron global `⌘⇧O`** (registered in `main.cjs`). A
  browser binding for it would double-fire with the global shortcut when the window is
  focused, so it's intentionally *not* in the browser set. Reconciling the two is noted
  as future work in #26.
- **`open-search` (the `⌘K` action) is reserved for #24** (the search popup doesn't exist
  yet); it'll be added when #24 lands.

## Default action set

| Action id | Does | Default key |
|-----------|------|-------------|
| `find-me` | click **📍 Find me** | `f` |
| `toggle-follow` | toggle **Follow player** | `Shift+F` |
| `toggle-capture` | toggle **capture / browse** | `c` |
| `toggle-hud` | collapse / expand the **HUD** | `h` |
| `open-settings` | open the **⚙ Settings** modal | `,` |

## Architecture — `public/src/features/shortcuts.js` (new)

Pure, unit-testable core + thin DOM glue:

- `comboFromEvent(e)` → a normalized combo string, e.g. `"f"`, `"shift+f"`, `"mod+k"`.
  Modifiers in a fixed order (`ctrl`/`meta`/`alt`/`shift`) + the lowercased key.
- `effectiveBindings(custom)` → `[{id, label, combo, run}]`, each action's `custom[id] ??
  default`.
- `findConflict(bindings, combo, exceptId)` → the id already using `combo`, or `null`
  (powers the editor's conflict check).
- `initShortcuts()` — installs a `document` keydown handler and renders the editor:
  - **Guard:** ignore when the target is an `input`/`textarea`/`select`/`contenteditable`,
    or while a rebind capture is in progress.
  - On a matching combo: `preventDefault()` and run the action.
  - **Editor** in `#shortcutList`: one row per action with a "click to rebind" button that
    captures the next keydown (with conflict rejection), plus **Reset shortcuts**.

## Files

| File | Change |
|------|--------|
| `public/src/features/shortcuts.js` | **new** — registry, pure combo/binding helpers, keydown handler, editor |
| `public/index.html` | a "Keyboard shortcuts" section in the Settings modal (`#shortcutList` + reset) |
| `public/styles.css` | editor row styles |
| `public/src/app.js` | `initShortcuts()` |
| `test/frontend/shortcuts.test.mjs` | **new** — `comboFromEvent`, `effectiveBindings`, `findConflict` |

## Risks / edge cases

- **Typing:** the input/contenteditable guard keeps single-key shortcuts out of text fields.
- **Rebind capture:** while capturing a new key the global handler is suppressed, so the
  captured key sets the binding instead of firing the action; `Escape` cancels the capture.
- **Conflicts:** rebinding to a combo another action uses is rejected with a message; defaults
  are conflict-free.
- **Corrupt storage:** `getSetting("shortcuts")` is coerced to a plain object (same guard as
  the other settings consumers).
- **Leaflet:** the map's own keyboard nav is arrow/`+`/`-`; the default letter shortcuts don't
  collide, and `preventDefault` only runs on a matched combo.
