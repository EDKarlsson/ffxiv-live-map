import { describe, it, expect } from "vitest";
import { comboFromEvent, effectiveBindings, findConflict, prettyCombo } from "../../public/src/features/shortcuts.js";

// The shortcut layer's correctness lives in three pure functions: turning an event
// into a stable combo string, resolving custom-over-default bindings, and catching
// conflicts before a rebind is saved. The keydown dispatch + editor are thin glue.
describe("comboFromEvent", () => {
	it("normalizes a plain key", () => {
		expect(comboFromEvent({ key: "f" })).toBe("f");
		expect(comboFromEvent({ key: "," })).toBe(",");
	});

	it("orders modifiers consistently and lowercases the key", () => {
		expect(comboFromEvent({ key: "F", shiftKey: true })).toBe("shift+f");
		expect(comboFromEvent({ key: "k", metaKey: true })).toBe("meta+k");
		expect(comboFromEvent({ key: "K", ctrlKey: true, shiftKey: true })).toBe("ctrl+shift+k");
	});
});

describe("effectiveBindings", () => {
	it("uses the defaults when there are no custom bindings", () => {
		const b = effectiveBindings({});
		expect(b.find((x) => x.id === "find-me").combo).toBe("f");
		expect(b.find((x) => x.id === "toggle-follow").combo).toBe("shift+f");
	});

	it("lets a custom binding override the default", () => {
		expect(effectiveBindings({ "find-me": "g" }).find((x) => x.id === "find-me").combo).toBe("g");
	});

	it("tolerates a corrupt (non-object) custom value", () => {
		expect(() => effectiveBindings("bad")).not.toThrow();
		expect(effectiveBindings("bad").find((x) => x.id === "find-me").combo).toBe("f");
	});
});

describe("findConflict", () => {
	it("returns the id already using a combo, ignoring the action itself", () => {
		const b = effectiveBindings({});
		expect(findConflict(b, "c", "find-me")).toBe("toggle-capture"); // 'c' is capture's default
		expect(findConflict(b, "c", "toggle-capture")).toBe(null);      // self never conflicts
		expect(findConflict(b, "z", "find-me")).toBe(null);             // unused key
	});
});

describe("prettyCombo", () => {
	it("renders modifiers and uppercases the key", () => {
		expect(prettyCombo("shift+f")).toBe("Shift+F");
		expect(prettyCombo("meta+k")).toBe("Cmd+K");
		expect(prettyCombo(",")).toBe(",");
	});
});
