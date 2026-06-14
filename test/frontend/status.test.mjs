import { describe, it, expect } from "vitest";
import { statusFor } from "../../public/src/core/status.js";

// The status pill must distinguish intentional browse mode (no capture, calm)
// from the stale-position "connecting" state and an actual daemon outage — the
// whole point of the browse-mode work. statusFor is the pure decision behind it.
describe("statusFor (capture status pill)", () => {
	it("WebSocket down dominates regardless of mode", () => {
		for (const mode of ["browse", "connecting", "live"]) {
			expect(statusFor(false, mode)).toEqual({ text: "daemon down — retrying", cls: "bad" });
		}
	});

	it("live capture -> ok", () => {
		expect(statusFor(true, "live")).toEqual({ text: "live", cls: "ok" });
	});

	it("connecting -> warn (position may be stale)", () => {
		expect(statusFor(true, "connecting").cls).toBe("warn");
	});

	it("browse -> neutral 'browse' class, not a warning", () => {
		const s = statusFor(true, "browse");
		expect(s.cls).toBe("browse");
		expect(s.text).toMatch(/browse mode/i);
	});

	it("unknown / missing mode falls back to browse", () => {
		expect(statusFor(true, undefined).cls).toBe("browse");
	});
});
