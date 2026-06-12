#!/usr/bin/env bash
# Start a second deucalion-bridge on its own port so ffxiv-live-map can run
# alongside Teamcraft (whose bridge on 31594 accepts only one client).
#
# Deucalion's named pipe supports multiple subscribers, and deucalion.dll is
# already injected by Teamcraft — re-running the bridge just attaches another
# pipe client and forwards it over TCP.
#
# Wine paths/env mirror Teamcraft's own bridge launch
# (ffxiv-teamcraft/apps/electron/src/pcap/packet-capture.ts):
#   - XIV on Mac wine binary + prefix
#   - WINEESYNC/WINEMSYNC/WINEFSYNC must match the running game's wineserver
#
# Usage: scripts/start-bridge.sh [port]   (default 31595)

set -euo pipefail

PORT="${1:-31595}"
WINE="/Applications/XIV on Mac.app/Contents/Resources/wine/bin/wine"
WINEPREFIX="$HOME/Library/Application Support/XIV on Mac/wineprefix"
TC_APP="/Applications/FFXIV Teamcraft.app"

die() { echo "ERROR: $1" >&2; exit 1; }

[ -x "$WINE" ] || die "wine not found at $WINE (is XIV on Mac installed there?)"
[ -d "$WINEPREFIX" ] || die "wine prefix not found at $WINEPREFIX"
pgrep -f ffxiv_dx11.exe >/dev/null || die "ffxiv_dx11.exe is not running — start the game first"

# electron-builder may place extra files under Contents/ or Contents/Resources/
find_in_app() {
  local name="$1" hit
  for dir in "$TC_APP/Contents" "$TC_APP/Contents/Resources"; do
    hit=$(find "$dir" -maxdepth 2 -name "$name" 2>/dev/null | head -1)
    [ -n "$hit" ] && { echo "$hit"; return 0; }
  done
  return 1
}

BRIDGE=$(find_in_app "deucalion-bridge.exe") || die "deucalion-bridge.exe not found in $TC_APP"
DLL=$(find_in_app "deucalion.dll") || die "deucalion.dll not found in $TC_APP"

# Unix path -> Wine path (Z: drive)
DLL_WIN="Z:${DLL//\//\\}"

echo "[bridge] wine:   $WINE"
echo "[bridge] prefix: $WINEPREFIX"
echo "[bridge] exe:    $BRIDGE"
echo "[bridge] dll:    $DLL_WIN"
echo "[bridge] port:   $PORT"

exec env \
  WINEPREFIX="$WINEPREFIX" \
  WINEESYNC=1 WINEMSYNC=1 WINEFSYNC=0 WINEDEBUG=-all \
  "$WINE" "$BRIDGE" --dll-path "$DLL_WIN" --port "$PORT"
