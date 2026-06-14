// Pure: given a placement key, a display work area {x,y,width,height}, and the
// overlay window size {width,height}, return the top-left {x,y} to move the
// overlay to. A margin keeps it off the screen edge. Snapped placements are
// stored as a key (not absolute coords) so they survive resolution/display
// changes — the position is recomputed from the work area each time.
//
// Lives in its own CJS module so main.cjs can require() it and the test can too.
function placementPosition(key, work, size, margin = 12) {
	const left = work.x + margin;
	const right = work.x + work.width - size.width - margin;
	const top = work.y + margin;
	const bottom = work.y + work.height - size.height - margin;
	const cx = Math.round(work.x + (work.width - size.width) / 2);
	const cy = Math.round(work.y + (work.height - size.height) / 2);
	switch (key) {
		case "top-left": return { x: Math.round(left), y: Math.round(top) };
		case "top-right": return { x: Math.round(right), y: Math.round(top) };
		case "bottom-left": return { x: Math.round(left), y: Math.round(bottom) };
		case "bottom-right": return { x: Math.round(right), y: Math.round(bottom) };
		case "center":
		default: return { x: cx, y: cy };
	}
}

module.exports = { placementPosition };
