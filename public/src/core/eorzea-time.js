// Eorzea Time + the timed-node / vista window math. Pure (no Leaflet/DOM).
// Math per ffxiv-node-timer: 1 ET hour = 175 real seconds.
export const ET_MULT = 3600 / 175;
export const etHoursNow = () => (Date.now() / 1000) * ET_MULT / 3600 % 24;

// Is a timed gathering node up now, and how many real seconds until it changes?
export function nodeStatus(n) {
	const cur = etHoursNow();
	const durH = n.duration / 60; // ET minutes
	let best = null;
	for (const h of n.spawns) {
		const sinceOpen = (cur - h + 24) % 24;
		if (sinceOpen < durH) return { up: true, secsLeft: (durH - sinceOpen) * 175 };
		const untilOpen = (h - cur + 24) % 24;
		if (!best || untilOpen < best) best = untilOpen;
	}
	return { up: false, secsLeft: best * 175 };
}

export const fmtMins = (s) => {
	// Round to whole minutes first, then split into h/m — rounding the minute
	// part independently could produce "1h60m" (e.g. 7199s).
	const mins = Math.max(0, Math.round(s / 60));
	return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60}m` : `${mins}m`;
};

// Vista sightseeing-log ET windows (HMM-encoded, e.g. 1159 = 11:59).
export const fmtVT = (t) => `${String(Math.floor(t / 100)).padStart(2, "0")}:${String(t % 100).padStart(2, "0")}`;
export const vistaAlways = (v) => v.minTime === 0 && (v.maxTime === 0 || v.maxTime === 2359);
export function vistaOpen(v) {
	if (vistaAlways(v)) return true;
	const h = etHoursNow();
	const cur = Math.floor(h) * 100 + Math.floor((h * 60) % 60);
	return v.minTime <= v.maxTime ? cur >= v.minTime && cur <= v.maxTime : cur >= v.minTime || cur <= v.maxTime;
}
