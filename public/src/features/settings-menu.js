// Settings menu (#12) — the single, discoverable surface for persisted prefs.
// A gear button opens a modal holding the keep-zoom / follow toggles (relocated
// from the HUD top) plus reset actions. Persistence flows through core/settings.js.
// Capture on/off is persisted daemon-side (src/settings-store.mjs), so it isn't a
// control here — just a note that it's restored on launch.
import { getSetting, setSetting, resetSettings } from "../core/settings.js";
import { setFollow } from "../core/view-map.js";
import { resetSizes } from "./icon-sizes.js";
import { renderShortcutEditor } from "./shortcuts.js";

const $ = (id) => document.getElementById(id);

export function openSettings() {
	$("settingsModal").hidden = false;
	$("settingsClose").focus(); // move focus into the dialog for keyboard / screen-reader users
}
export function closeSettings() {
	if ($("settingsModal").hidden) return; // already closed — don't steal focus back to the gear
	$("settingsModal").hidden = true;
	$("settingsBtn").focus(); // return focus to the control that opened it
}

export function initSettings() {
	// Keep-zoom: restore the persisted value into the checkbox. view-map.js reads
	// the checkbox directly, so persisting on change is all that's needed here.
	const keep = $("keepZoom");
	keep.checked = getSetting("keepZoom", true);
	keep.onchange = () => setSetting("keepZoom", keep.checked);

	// Follow: setFollow is the single place that sets state.follow AND syncs the
	// #followToggle checkbox, so restoring the persisted default updates both.
	const follow = $("followToggle");
	setFollow(getSetting("follow", true));
	follow.onchange = () => { setFollow(follow.checked); setSetting("follow", follow.checked); };

	// Open / close: gear opens; the ✕, a backdrop click, and Esc close.
	$("settingsBtn").onclick = openSettings;
	$("settingsClose").onclick = closeSettings;
	$("settingsModal").addEventListener("click", (e) => { if (e.target.id === "settingsModal") closeSettings(); });
	// Esc closes only when the dialog is open, so it doesn't shadow other Escape
	// semantics (and can't fight the focus-restore when nothing is open).
	document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("settingsModal").hidden) closeSettings(); });

	// Resets.
	$("sizeResetModal").onclick = resetSizes;
	$("settingsReset").onclick = () => {
		resetSettings();                        // clear the namespaced store…
		keep.checked = getSetting("keepZoom", true);  // …then re-apply defaults to the live UI
		setFollow(getSetting("follow", true)); // setFollow re-checks #followToggle too
		resetSizes();                           // clears iconSizes + re-applies + rebuilds the panel
		renderShortcutEditor();                 // shortcuts were cleared too — refresh the chips
	};
}
