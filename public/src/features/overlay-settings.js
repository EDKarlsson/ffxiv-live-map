import { fracToPct, pctToFrac } from "../core/opacity.js";

// Overlay controls — only meaningful in the desktop app, where the transparent
// always-on-top overlay window reuses this same UI. Its opacity is a *window*
// property, so the sliders round-trip through the preload bridge (window.overlay)
// to Electron's main process. In a plain browser there's no such bridge, so the
// section stays hidden.
export function initOverlaySettings() {
	const api = window.overlay;
	const section = document.getElementById("overlaySection");
	if (!api || !section) return; // not running in the desktop app
	section.hidden = false;

	const fEl = document.getElementById("ovFocused");
	const uEl = document.getElementById("ovUnfocused");
	const fVal = document.getElementById("ovFocusedVal");
	const uVal = document.getElementById("ovUnfocusedVal");
	const pass = document.getElementById("ovPassthrough");

	const showF = () => { fVal.textContent = `${fEl.value}%`; };
	const showU = () => { uVal.textContent = `${uEl.value}%`; };

	// Seed the sliders from the persisted config.
	api.getConfig().then((cfg) => {
		fEl.value = fracToPct(cfg.focused); showF();
		uEl.value = fracToPct(cfg.unfocused); showU();
		if (pass) pass.checked = !!cfg.passthrough;
	});

	const push = () => {
		showF(); showU();
		api.setOpacities(pctToFrac(fEl.value), pctToFrac(uEl.value));
	};
	fEl.addEventListener("input", push);
	uEl.addEventListener("input", push);
	if (pass) pass.addEventListener("change", () => api.setPassthrough(pass.checked));
}
