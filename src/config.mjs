// CLI args + run-mode flags, parsed once at import.
const args = process.argv.slice(2);

export const argVal = (name, def) => {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

export const BRIDGE_PORT = Number(argVal("--bridge-port", 31594));
export const HTTP_PORT = Number(argVal("--http-port", 8787));
export const VERBOSE = args.includes("--verbose");

// Test/dev seams: run the HTTP+WS server without the packet-capture stack
// (--no-capture), or with a synthetic moving character (--mock) for headless
// verification when the game isn't running (CI, or remote with no game).
export const NO_CAPTURE = args.includes("--no-capture");
export const MOCK = args.includes("--mock"); // implies no real capture
export const MOCK_ZONE = Number(argVal("--mock-zone", 129)); // 129 = Limsa Lominsa Lower Decks

// Browse mode: serve the map with NO packet capture by default, but keep capture
// runtime-toggleable AND watch for the game so it auto-attaches when FFXIV
// launches (and detaches when it exits) — the way Teamcraft behaves. The map is
// usable as a reference even with no Mac game running (e.g. playing on PS5).
// Distinct from --no-capture, which is the inert test/CI seam (browse, no monitor).
export const BROWSE = args.includes("--browse");

// Game-presence monitor (browse mode only): poll interval and the process name to
// match with `pgrep -f`. FFXIV runs under Wine on macOS as ffxiv_dx11.exe.
export const GAME_POLL_MS = Number(argVal("--game-poll-ms", 4000));
export const GAME_PROCESS = argVal("--game-process", "ffxiv_dx11.exe");
