#!/usr/bin/env bash
# Browse mode: run the map with NO packet capture — usable as a reference even
# when FFXIV isn't running on this Mac (e.g. you're playing on PS5). No bridge,
# no game required. Capture can still be toggled on in the UI, and the daemon
# auto-attaches if it detects the Mac game (ffxiv_dx11.exe) — see --browse.
#
# Env overrides: HTTP_PORT (default 8787).

set -euo pipefail
cd "$(dirname "$0")/.."

HTTP_PORT="${HTTP_PORT:-8787}"
URL="http://localhost:${HTTP_PORT}"

# Build bundled data on first run (no-op once cached).
node scripts/ensure-data.mjs

# Open the browser once the daemon answers (background; non-fatal if no opener).
(
  for _ in $(seq 1 60); do
    if curl -sf "${URL}/maps" >/dev/null 2>&1; then
      if command -v open >/dev/null 2>&1; then open "${URL}"
      elif command -v xdg-open >/dev/null 2>&1; then xdg-open "${URL}"
      fi
      break
    fi
    sleep 0.5
  done
) &

echo "[browse] starting daemon in browse mode → ${URL} (no capture; toggle it on in the UI)"
exec node src/daemon.mjs --browse --http-port "${HTTP_PORT}"
