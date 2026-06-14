// Settings menu (#12) — the single, discoverable surface for persisted prefs.
// A gear button opens a modal holding the keep-zoom / follow toggles (relocated
// from the HUD top) plus reset actions. Persistence flows through core/settings.js.
// Capture on/off is persisted daemon-side (src/settings-store.mjs), so it isn't a
// control here — just a note that it's restored on launch.
import { getSetting, setSetting, resetSettings } from "../core/settings.js";
import { setFollow } from "../core/view-map.js";
import { resetSizes } from "./icon-sizes.js";

const $ = (id) => document.getElementById(id);

export function openSettings() { $("settingsModal").hidden = false; }
export function closeSettings() { $("settingsModal").hidden = true; }

export function initSettings() {
	// Keep-zoom: restore the persisted value into the checkbox. view-map.js reads
	// the checkbox directly, so persisting on change is all that's needed here.
	const keep = $("keepZoom");
	keep.checked = getSetting("keepZoom", true);
	keep.onchange = () => setSetting("keepZoom", keep.checked);

	// Follow: restore the persisted default into live state (+ checkbox) via
	// setFollow, then persist on change.
	setFollow(getSetting("follow", true));
	$("followToggle").onchange = (e) => { setFollow(e.target.checked); setSetting("follow", e.target.checked); };

	// Open / close: gear opens; the ✕, a backdrop click, and Esc close.
	$("settingsBtn").onclick = openSettings;
	$("settingsClose").onclick = closeSettings;
	$("settingsModal").addEventListener("click", (e) => { if (e.target.id === "settingsModal") closeSettings(); });
	document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSettings(); });

	// Resets.
	$("sizeResetModal").onclick = resetSizes;
	$("settingsReset").onclick = () => {
		resetSettings();                        // clear the namespaced store…
		keep.checked = getSetting("keepZoom", true);  // …then re-apply defaults to the live UI
		setFollow(getSetting("follow", true));
		resetSizes();                           // clears iconSizes + re-applies + rebuilds the panel
	};
}
