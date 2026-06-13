import { describe, it, expect } from "vitest";
import { ET_MULT, etHoursNow, nodeStatus, fmtMins, fmtVT, vistaAlways, vistaOpen } from "../../public/src/core/eorzea-time.js";

describe("eorzea time", () => {
	it("ET_MULT = 3600/175 (1 ET hour = 175 real s)", () => {
		expect(ET_MULT).toBeCloseTo(3600 / 175, 6);
	});

	it("etHoursNow is in [0, 24)", () => {
		const h = etHoursNow();
		expect(h).toBeGreaterThanOrEqual(0);
		expect(h).toBeLessThan(24);
	});

	it("fmtMins formats minutes and hours", () => {
		expect(fmtMins(0)).toBe("0m");
		expect(fmtMins(120)).toBe("2m");
		expect(fmtMins(3600)).toBe("1h0m");
		expect(fmtMins(5400)).toBe("1h30m");
	});

	it("fmtVT formats HMM-encoded vista times", () => {
		expect(fmtVT(1159)).toBe("11:59");
		expect(fmtVT(0)).toBe("00:00");
		expect(fmtVT(905)).toBe("09:05");
	});

	it("vistaAlways detects all-day windows", () => {
		expect(vistaAlways({ minTime: 0, maxTime: 0 })).toBe(true);
		expect(vistaAlways({ minTime: 0, maxTime: 2359 })).toBe(true);
		expect(vistaAlways({ minTime: 800, maxTime: 1200 })).toBe(false);
	});

	it("vistaOpen: an all-day window is always open", () => {
		expect(vistaOpen({ minTime: 0, maxTime: 2359 })).toBe(true);
	});

	it("nodeStatus: up when current ET is inside a spawn window", () => {
		const h = Math.floor(etHoursNow());
		const st = nodeStatus({ spawns: [h], duration: 120 }); // 2 ET-hour window opening at the current hour
		expect(st.up).toBe(true);
		expect(st.secsLeft).toBeGreaterThan(0);
	});

	it("nodeStatus: down + time-to-next when no window is active", () => {
		const far = (Math.floor(etHoursNow()) + 5) % 24;
		const st = nodeStatus({ spawns: [far], duration: 5 });
		expect(st.up).toBe(false);
		expect(st.secsLeft).toBeGreaterThan(0);
	});
});
