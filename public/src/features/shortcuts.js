// Customizable keyboard shortcuts (#26). Each action just clicks the control that
// already does the thing, so there's no duplicated logic — the capture POST, HUD
// collapse, follow-persist etc. all run exactly as on a real click. Bindings are
// rebindable from the Settings modal and persisted via core/settings.js (#12).
import { getSetting, setSetting } from "../core/settings.js";

const clickEl = (id) => document.getElementById(id)?.click();

// The bindable actions and their default keys. open-search (⌘K) is reserved for
// the search popup (#24); the overlay toggle stays on Electron's global ⌘⇧O.
const ACTIONS = [
	{ id: "find-me",        label: "Find me",          default: "f",       run: () => clickEl("findMe") },
	{ id: "toggle-follow",  label: "Toggle follow",    default: "shift+f", run: () => clickEl("followToggle") },
	{ id: "toggle-capture", label: "Toggle capture",   default: "c",       run: () => clickEl("captureToggle") },
	{ id: "toggle-hud",     label: "Toggle HUD panel", default: "h",       run: () => clickEl("hudToggle") },
	{ id: "open-settings",  label: "Open settings",    default: ",",       run: () => clickEl("settingsBtn") },
];

const MOD_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

// Pure: a normalized combo string for an event, e.g. "f", "shift+f", "meta+k".
// Modifiers in a fixed order so two presses of the same chord always match.
export function comboFromEvent(e) {
	const parts = [];
	if (e.ctrlKey) parts.push("ctrl");
	if (e.metaKey) parts.push("meta");
	if (e.altKey) parts.push("alt");
	if (e.shiftKey) parts.push("shift");
	parts.push((e.key || "").toLowerCase());
	return parts.join("+");
}

// Pure: each action with its effective combo (a custom binding overrides the default).
export function effectiveBindings(custom = {}) {
	const c = custom && typeof custom === "object" && !Array.isArray(custom) ? custom : {};
	return ACTIONS.map((a) => ({ ...a, combo: c[a.id] || a.default }));
}

// Pure: the id of another action already bound to `combo`, or null.
export function findConflict(bindings, combo, exceptId) {
	const hit = bindings.find((b) => b.combo === combo && b.id !== exceptId);
	return hit ? hit.id : null;
}

const LABELS = { meta: "Cmd", ctrl: "Ctrl", alt: "Alt", shift: "Shift" };
export function prettyCombo(combo) {
	return combo.split("+").map((p) => LABELS[p] || (p.length === 1 ? p.toUpperCase() : p)).join("+");
}

const getCustom = () => {
	const v = getSetting("shortcuts", {});
	return v && typeof v === "object" && !Array.isArray(v) ? v : {};
};

const isTypingTarget = (el) =>
	!!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);

let capturing = false; // true while the editor is waiting for a rebind keystroke

export function initShortcuts() {
	// Global dispatcher: a matched combo runs its action. Skipped while typing or
	// rebinding, on pure-modifier presses, once another handler consumed the key,
	// or while the Settings modal is open (you're configuring shortcuts there, so a
	// stray single-key press shouldn't fire a map action behind the dialog).
	document.addEventListener("keydown", (e) => {
		if (capturing || e.defaultPrevented) return;
		const modal = document.getElementById("settingsModal");
		if (modal && !modal.hidden) return;
		if (isTypingTarget(e.target) || MOD_KEYS.has(e.key)) return;
		const b = effectiveBindings(getCustom()).find((x) => x.combo === comboFromEvent(e));
		if (b) { e.preventDefault(); b.run(); }
	});
	renderShortcutEditor();
}

// Exported so "Reset all settings" (settings-menu.js) can refresh the editor after
// it clears the shared store — otherwise the chips would show stale bindings.
export function renderShortcutEditor() {
	const list = document.getElementById("shortcutList");
	if (!list) return;
	// Built with DOM methods + textContent (not innerHTML): a combo can flow from a
	// hand-edited localStorage value, so it must never be interpreted as markup.
	list.textContent = "";
	for (const b of effectiveBindings(getCustom())) {
		const row = document.createElement("div");
		row.className = "srow";
		const name = document.createElement("span");
		name.textContent = b.label;
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "kbd";
		btn.textContent = prettyCombo(b.combo);
		btn.onclick = () => startRebind(b.id, btn);
		row.append(name, btn);
		list.append(row);
	}
	const reset = document.getElementById("shortcutsReset");
	if (reset) reset.onclick = () => { setSetting("shortcuts", {}); renderShortcutEditor(); };
}

function startRebind(actionId, btn) {
	if (capturing) return; // a rebind is already in progress — don't stack listeners
	capturing = true;
	btn.classList.add("capturing");
	btn.textContent = "press a key…";
	const onKey = (e) => {
		// Capture phase + stopImmediatePropagation so the rebind keystroke never
		// reaches the global dispatcher (and can't fire the action it would bind).
		e.preventDefault();
		e.stopImmediatePropagation();
		if (e.key === "Escape") { finish(false); return; } // cancel, keep the old binding
		if (MOD_KEYS.has(e.key)) return;                    // wait for a non-modifier
		const combo = comboFromEvent(e);
		const conflict = findConflict(effectiveBindings(getCustom()), combo, actionId);
		if (conflict) { btn.textContent = `${prettyCombo(combo)} — in use`; return; } // keep capturing
		const custom = getCustom();
		custom[actionId] = combo;
		setSetting("shortcuts", custom);
		finish(true);
	};
	// Any click elsewhere (close button, backdrop, another chip) cancels the capture
	// — otherwise closing the modal mid-rebind would leave `capturing` stuck true and
	// the listener attached, breaking every shortcut until reload.
	const onClickOutside = (e) => { if (!btn.contains(e.target)) finish(false); };
	function finish(saved) {
		capturing = false;
		document.removeEventListener("keydown", onKey, true);
		document.removeEventListener("mousedown", onClickOutside, true);
		if (saved) { renderShortcutEditor(); return; }
		// Restore this chip in place (avoid re-rendering mid-event-propagation).
		btn.classList.remove("capturing");
		const current = effectiveBindings(getCustom()).find((b) => b.id === actionId);
		btn.textContent = current ? prettyCombo(current.combo) : "";
	}
	document.addEventListener("keydown", onKey, true);
	document.addEventListener("mousedown", onClickOutside, true);
}
