# Packaging ffxiv-live-map for Non-Technical Users — Research Report (June 2026)

**App profile:** Node ≥18 ESM daemon (~400 lines), deps `ws` (pure JS) + `@ffxiv-teamcraft/pcap-ffxiv` (verified locally: **zero runtime dependencies**, pure JS lib that talks to a TCP bridge — no native pcap addon). Serves single-file Leaflet UI on localhost:8787, builds JSON data on first run, uses `fs.watch`. Targets: macOS first, Windows second. Future: always-on-top transparent mini-map overlay.

---

## 1. Electron (+ electron-builder)

- **Maturity (2026):** Industry standard, actively maintained. This is what FFXIV Teamcraft itself uses (verified in the local repo `package.json`: `electron-builder` with `mac.target: dmg`, `win.target: squirrel` publishing to GitHub releases, `electron-updater` for auto-update, plus a custom Windows sign script).
- **Bundle size:** ~100–200 MB is the typical Electron bundle range ([Forasoft 2026 publishing guide](https://www.forasoft.com/blog/article/the-pain-of-publishing-electron-apps-on-macos-303)).
- **Dev effort from a Node daemon: very low.** Electron's main process *is* Node — the daemon code runs as-is, no sidecar, no rewrite. Add a `BrowserWindow` pointed at `localhost:8787`.
- **Auto-update:** Built into [electron-builder](https://www.electron.build/docs/mac/) via `electron-updater` with GitHub Releases as the provider — exactly Teamcraft's setup. Caveat: on macOS, auto-update (Squirrel.Mac) requires a **signed** app ([electron-builder auto-update docs](https://www.electron.build/auto-update)).
- **macOS friction (unsigned):** Since Catalina, notarization is a hard requirement for distribution outside the App Store; unsigned apps are blocked by Gatekeeper by default ([Forasoft](https://www.forasoft.com/blog/article/the-pain-of-publishing-electron-apps-on-macos-303), [electron/notarize](https://github.com/electron/notarize)). Pipeline is sign → package → `notarytool` → staple; every binary must be signed with Hardened Runtime. Requires Apple Developer Program ($99/yr).
- **Windows friction (unsigned):** SmartScreen "Unknown publisher" on first run; users click "More info → Run anyway" ([SmartScreen reputation docs](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).
- **Overlay:** Yes — `new BrowserWindow({ transparent: true, frame: false, alwaysOnTop: true })`, plus `win.setAlwaysOnTop(true, 'screen-saver')` levels and `win.setIgnoreMouseEvents()` for click-through ([BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window), [Custom Window Styles tutorial](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)). Known caveat: staying on top of *exclusive-fullscreen* OpenGL/Vulkan games is unreliable ([electron#8530](https://github.com/electron/electron/issues/8530)) — but FFXIV in fullscreen-*windowed* mode (the XIV on Mac setup) is the case that works.

## 2. Tauri v2

- **Maturity:** v2 stable since Oct 2024 ([Wikipedia](https://en.wikipedia.org/wiki/Tauri_(software_framework))), actively maintained.
- **Sidecar pattern:** Officially documented — ["Node.js as a sidecar"](https://v2.tauri.app/learn/sidecar-nodejs/) recommends compiling the daemon with `pkg` into a standalone binary listed in `bundle.externalBin` ([Embedding External Binaries](https://v2.tauri.app/develop/sidecar/)). So no rewrite, but you maintain a Tauri (Rust) shell *plus* a pkg/SEA build of the daemon.
- **Bundle size:** Tauri shell is ~3–10 MB, but the Node sidecar binary adds ~50–80 MB, erasing most of the size advantage.
- **Auto-update:** Official updater plugin ([docs](https://v2.tauri.app/plugin/updater/)); updates must be signed with the updater's minisign key.
- **Overlay:** `"transparent": true` + `"alwaysOnTop": true` in window config — but macOS transparency requires `"macOSPrivateApi": true` ([config reference](https://v2.tauri.app/reference/config/)), which bars App Store distribution, and there are open transparency bugs on macOS: transparency lost after DMG build ([tauri#13415](https://github.com/tauri-apps/tauri/issues/13415)), focus-change glitches ([tauri#8255](https://github.com/tauri-apps/tauri/issues/8255)), border artifacts ([tauri#14394](https://github.com/tauri-apps/tauri/issues/14394)).
- **Cross-compile:** Not feasible ("Tauri relies heavily on native libraries… meaningful cross-compilation is not possible", [v1 docs, still true](https://v1.tauri.app/v1/guides/building/cross-platform/)); standard answer is per-platform CI via [tauri-action](https://v2.tauri.app/distribute/pipelines/github/).
- **Signing friction:** Same macOS notarization and Windows SmartScreen realities as Electron.

## 3. Single-executable Node (SEA / pkg / deno)

- **Node SEA status (big 2026 news):** SEA building moved into Node core — one-step `node --build-sea sea-config.json`, shipped in v25.5.0, possible LTS backports ([Joyee Cheung, Jan 2026](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/)). Current docs confirm **ESM main scripts are now supported** via `"mainFormat": "module"` ([Node SEA docs](https://nodejs.org/api/single-executable-applications.html)) — though only a *single* script is embedded, so bundle first (esbuild). This dep tree is pure JS, so it works; `fs.watch` is normal Node runtime. Cross-platform SEA builds work if `useCodeCache`/`useSnapshot` are off.
- **@yao-pkg/pkg:** actively maintained fork of archived vercel/pkg; works on Node 20/24 out of the box ([npm](https://www.npmjs.com/package/@yao-pkg/pkg), [project site](https://yao-pkg.github.io/pkg/)). Supports embedding multiple files/assets — slightly more ergonomic than raw SEA today.
- **deno compile:** cross-compiles to **all** targets from one machine via `--target`, npm package support since Deno 2 ([deno compile docs](https://docs.deno.com/runtime/reference/cli/compile/)); binaries ~50–130 MB. Would need light porting/testing of the daemon.
- **Size:** any of these ≈ 60–110 MB (a full Node/Deno runtime) — comparable to Electron, just one file.
- **Auto-update:** none built in; "download the new binary" or a self-update check you write.
- **macOS friction:** lower than an .app — a raw binary downloaded by a *browser* still gets the quarantine xattr and a Gatekeeper warning, but `curl`/Homebrew-installed binaries don't (quarantine is applied by the downloading app). A Homebrew tap is the friction-free mac channel for this shape of app.
- **Overlay:** none — UI opens in the user's browser. Disqualifies this path for the future overlay mode on its own.

## 4. Wails / Neutralino / menubar

- **Wails v3:** still alpha (v3.0.0-alpha.98, June 2026 — [releases](https://github.com/wailsapp/wails/releases), [v3 site](https://v3.wails.io/)) and is Go — would mean rewriting the daemon. Not a fit.
- **Neutralinojs:** alive (repos updated through June 2026, [GitHub](https://github.com/neutralinojs/neutralinojs)) but small community and Node would still ship separately. Not meaningfully better.
- **Menubar wrapper:** the [`menubar`](https://www.npmjs.com/package/menubar) npm package (v9.5.2) gives a mac tray app — but it's Electron underneath, so it's really "Electron, nicer UX," not a lighter alternative.

## FFXIV community precedent

- **Teamcraft:** Electron + electron-builder, DMG on macOS, Squirrel.Windows installer publishing to GitHub Releases, `electron-updater` auto-update, ships the deucalion-bridge exe as `extraFiles` (verified directly in the local repo checkout).
- **ACT overlays:** [ngld OverlayPlugin](https://ngld.github.io/OverlayPlugin/) renders overlays with embedded Chromium (CefSharp) inside ACT, with a WebSocket API so the same HTML overlay can run in a plain browser ([dev docs](https://ngld.github.io/OverlayPlugin/devs/)) — the community-standard overlay is "a Chromium window floating over the game," exactly what Electron gives cross-platform.
- **Signing costs for zero-friction installs:** Apple Developer $99/yr; Windows: [Azure Trusted Signing ~$9.99/mo, open to individual developers](https://techcommunity.microsoft.com/blog/microsoft-security-blog/trusted-signing-is-now-open-for-individual-developers-to-sign-up-in-public-previ/4273554) ([overview](https://textslashplain.com/2025/03/12/authenticode-in-2025-azure-trusted-signing/)) — even signed apps need SmartScreen reputation to build ([Microsoft docs](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).

## Recommendation

**(a) Installable releases now — single-binary Node (SEA or @yao-pkg/pkg).**
The dependency tree is pure JS (verified), the UI is already browser-served, and `esbuild → node --build-sea` (or pkg) gives one ~80 MB file per platform with zero code changes and no framework. Ship via GitHub Releases + a Homebrew tap for macOS (avoids Gatekeeper quarantine entirely); Windows users click through one SmartScreen prompt. Days, not weeks, of work.

**(b) Overlay mode later — Electron.**
The overlay requirement is Electron's documented sweet spot (`transparent` + `frame:false` + `alwaysOnTop` + `setIgnoreMouseEvents`), Tauri's macOS transparency is gated behind a private API with open bugs, and — decisively — Electron's main process is Node, so the daemon runs unmodified while Tauri would force a pkg'd sidecar anyway. It also matches the strongest community precedent (Teamcraft, OverlayPlugin).

**They are not the same tool, and that's fine:** the SEA work (bundling the daemon to one file) is a prerequisite you'd reuse inside the Electron build later. Path: SEA binary releases now → wrap the same daemon in Electron for the mini-map overlay → budget $99/yr Apple + ~$10/mo Trusted Signing only when warning-free installs and macOS auto-update (which requires signing) matter.
