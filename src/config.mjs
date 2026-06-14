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
