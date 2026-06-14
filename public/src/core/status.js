// Pure mapping from (WebSocket up?, daemon capture mode) -> status-pill text and
// css class. Deliberately Leaflet-free so it can be unit-tested without a DOM or
// a map. Browse is an intentional state (no packet capture — e.g. reference mode
// while playing on PS5), so it reads neutrally (the "browse" class) rather than
// as a warning; "connecting" is the one that means "position may be stale" while
// the bridge link is still coming up.
export function statusFor(wsUp, mode) {
	if (!wsUp) return { text: "daemon down — retrying", cls: "bad" };
	switch (mode) {
		case "live": return { text: "live", cls: "ok" };
		case "connecting": return { text: "connecting to capture…", cls: "warn" };
		case "browse":
		default: return { text: "browse mode — no live position", cls: "browse" };
	}
}
