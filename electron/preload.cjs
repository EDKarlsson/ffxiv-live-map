// Preload for the Electron windows. contextIsolation + sandbox are on, so the
// renderer (our localhost UI) gets no Node access — this bridge exposes only a
// tiny, explicit `window.overlay` API over IPC. Sandboxed preloads may still
// require('electron') for ipcRenderer/contextBridge.
//
// Opacities are fractions in [0, 1]. The overlay's transparency is a *window*
// property (BrowserWindow.setOpacity), which only the main process can set, so
// the renderer's sliders round-trip through here.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlay", {
	// -> { focused, unfocused, passthrough } (focused/unfocused are fractions 0..1).
	getConfig: () => ipcRenderer.invoke("overlay:getConfig"),
	// Persist + apply the two opacities (fractions 0..1).
	setOpacities: (focused, unfocused) => ipcRenderer.send("overlay:setOpacities", { focused, unfocused }),
	// Click-through: when on, mouse events fall through the overlay to the game behind it.
	setPassthrough: (on) => ipcRenderer.send("overlay:setPassthrough", !!on),
	// Show/hide the overlay window (same action as the View menu / global shortcut).
	toggle: () => ipcRenderer.send("overlay:toggle"),
});
