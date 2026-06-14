// Shared mutable app state. ES module `let` exports are read-only to importers,
// so the cross-module mutable fields live on one object that every module reads
// and writes (state.viewedMap = m, etc.).
export const state = {
	viewedMap: null, // map entry currently displayed
	playerMap: null, // map entry the player is actually in
	lastPos: null,
	lastRot: null,
	follow: true,
};
