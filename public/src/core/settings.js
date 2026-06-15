// Single namespaced store for persisted UI preferences. One localStorage key
// (`flm:settings`) holds a JSON object, so prefs live behind one surface instead
// of scattered one-off keys. Reads use an in-memory cache; writes are wrapped —
// localStorage throws in private mode / when storage is blocked, which would
// otherwise crash boot — so a failure degrades to in-memory-only for the session.
const KEY = "flm:settings";

// Coerce anything that isn't a plain object (corrupt or hand-edited storage —
// a string/number/array) back to {}, so setSetting()'s `cache[key] =` can't throw
// on a primitive at boot.
const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

let cache = (() => {
	try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return isPlainObject(v) ? v : {}; }
	catch { return {}; }
})();

function save() {
	try { localStorage.setItem(KEY, JSON.stringify(cache)); }
	catch { /* storage unavailable — in-memory only this session */ }
}

// One-time migration from the pre-consolidation keys so existing users keep their
// settings (AC: no regression). Copies an old key in only if the namespaced object
// doesn't already have it, then removes the old key.
(function migrateLegacyKeys() {
	let changed = false;
	const take = (oldKey, prop, parse) => {
		if (cache[prop] !== undefined) return;
		try {
			const v = localStorage.getItem(oldKey);
			if (v === null) return;
			cache[prop] = parse(v);
			localStorage.removeItem(oldKey);
			changed = true;
		} catch { /* leave it; defaults apply */ }
	};
	take("keepZoom", "keepZoom", (v) => v === "1");          // was "1"/"0"
	take("iconSizes", "iconSizes", (v) => JSON.parse(v));    // was a JSON object
	if (changed) save();
})();

export function getSetting(key, def) {
	return cache[key] === undefined ? def : cache[key];
}

export function setSetting(key, value) {
	cache[key] = value;
	save();
}

export function resetSettings() {
	cache = {};
	save();
}
