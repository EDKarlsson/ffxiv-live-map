#!/usr/bin/env bash
# Single entry point for ffxiv-live-map.
#
# Builds the bundled data on first run, starts a second Deucalion bridge,
# launches the daemon, and opens the map in your browser. Press Ctrl+C to stop
# the daemon and the bridge together.
#
# Prereqs: FFXIV running + FFXIV Teamcraft desktop with Packet Capture enabled
# (Teamcraft injects deucalion.dll; we attach a second bridge on its own port
# because Teamcraft's own bridge on 31594 accepts only one client).
#
# Env overrides: BRIDGE_PORT (default 31595), HTTP_PORT (default 8787).

set -euo pipefail
cd "$(dirname "$0")/.."

BRIDGE_PORT="${BRIDGE_PORT:-31595}"
HTTP_PORT="${HTTP_PORT:-8787}"
URL="http://localhost:${HTTP_PORT}"

# --- Prereq check (start-bridge.sh re-checks, but fail early with one message) -
if ! pgrep -f ffxiv_dx11.exe >/dev/null 2>&1; then
  echo "✖ FFXIV (ffxiv_dx11.exe) isn't running." >&2
  echo "  Start the game and FFXIV Teamcraft (Packet Capture enabled), then re-run." >&2
  exit 1
fi

# --- 1. Build bundled data on first run (no-op once cached) --------------------
node scripts/ensure-data.mjs

# --- 2. Start our Deucalion bridge unless one is already listening -------------
BRIDGE_PID=""
if lsof -nP -iTCP:"${BRIDGE_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[start] reusing bridge already listening on :${BRIDGE_PORT}"
else
  echo "[start] launching Deucalion bridge on :${BRIDGE_PORT}…"
  bash scripts/start-bridge.sh "${BRIDGE_PORT}" &
  BRIDGE_PID=$!
fi

cleanup() {
  if [ -n "${BRIDGE_PID}" ]; then
    pkill -P "${BRIDGE_PID}" 2>/dev/null || true   # our bridge's wine child
    kill "${BRIDGE_PID}" 2>/dev/null || true       # the restart loop
  fi
}
trap cleanup EXIT INT TERM

# --- 3. Wait for the bridge to listen before the daemon connects --------------
# The daemon exits if its first connect fails, and wine takes a moment to bind.
echo "[start] waiting for bridge on :${BRIDGE_PORT}…"
for _ in $(seq 1 60); do
  lsof -nP -iTCP:"${BRIDGE_PORT}" -sTCP:LISTEN >/dev/null 2>&1 && break
  # If we spawned the bridge and it already died, stop waiting.
  if [ -n "${BRIDGE_PID}" ] && ! kill -0 "${BRIDGE_PID}" 2>/dev/null; then
    echo "✖ bridge exited before it started listening. Is Teamcraft running with Packet Capture on?" >&2
    exit 1
  fi
  sleep 0.5
done

# --- 4. Open the browser once the daemon answers (background) ------------------
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

# --- 5. Run the daemon in the foreground (Ctrl+C → trap stops the bridge) ------
echo "[start] starting daemon → ${URL} (bridge :${BRIDGE_PORT})"
node src/daemon.mjs --bridge-port "${BRIDGE_PORT}" --http-port "${HTTP_PORT}"
