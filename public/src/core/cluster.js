// Grid-cluster spawn points into averaged cells (A Realm Remapped-style monster
// density). Pure (no Leaflet/DOM). points: [x, y, fate][].
export function clusterPoints(points, grid = 0.6) {
	const cells = new Map();
	for (const [x, y, fate] of points) {
		const key = `${Math.round(x / grid)}:${Math.round(y / grid)}`;
		const c = cells.get(key) ?? { x: 0, y: 0, n: 0, fate: 0 };
		c.x += x; c.y += y; c.n++; c.fate += fate;
		cells.set(key, c);
	}
	return [...cells.values()].map((c) => ({ x: c.x / c.n, y: c.y / c.n, n: c.n, fate: c.fate > 0 }));
}
