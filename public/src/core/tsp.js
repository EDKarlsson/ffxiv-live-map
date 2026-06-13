// Farming-route TSP over node coords: nearest-neighbor seed + 2-opt improvement
// on an open path. Pure (no Leaflet/DOM) so it's unit-testable on its own.
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function tour(points, start) {
	if (points.length < 2) return points.slice();
	// Nearest-neighbor seed.
	const remaining = points.slice();
	const route = [];
	let cur = start ?? remaining.shift();
	route.push(cur); // seed node is part of the route (bug if only pushed when start set)
	while (remaining.length) {
		let bi = 0, bd = Infinity;
		remaining.forEach((p, i) => { const d = dist(cur, p); if (d < bd) { bd = d; bi = i; } });
		cur = remaining.splice(bi, 1)[0];
		route.push(cur);
	}
	// 2-opt improvement (open path; keep index 0 fixed if it's the start).
	const fixed = start ? 1 : 0;
	let improved = true;
	while (improved) {
		improved = false;
		for (let i = fixed; i < route.length - 1; i++) {
			for (let k = i + 1; k < route.length; k++) {
				const b = route[i];
				const c = route[k], d = route[k + 1];
				// At i === 0 there's no predecessor edge, so omit it. (The old
				// `route[i-1] ?? route[i]` fallback wrongly charged dist(route[0], c)
				// to `after`, suppressing valid prefix-reversal improvements.)
				const before = (i > 0 ? dist(route[i - 1], b) : 0) + (d ? dist(c, d) : 0);
				const after = (i > 0 ? dist(route[i - 1], c) : 0) + (d ? dist(b, d) : 0);
				if (after + 1e-9 < before) {
					let lo = i, hi = k;
					while (lo < hi) { [route[lo], route[hi]] = [route[hi], route[lo]]; lo++; hi--; }
					improved = true;
				}
			}
		}
	}
	return route;
}
