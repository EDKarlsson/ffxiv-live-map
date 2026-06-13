import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";

// Characterization / integration suite. Boots the real daemon with --no-capture
// (HTTP + WebSocket, no packet-capture stack) on an ephemeral port and asserts
// each endpoint's response shape. This is the safety net for PR2's router
// rewrite: it must stay green *unchanged* through the modularization.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function freePort() {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.on("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
	});
}

let proc, base, markersFile;

beforeAll(async () => {
	const port = await freePort();
	base = `http://127.0.0.1:${port}`;
	// Point the daemon's custom-markers store at a throwaway temp file so the
	// /custom round-trip never touches the developer's real custom-markers.json.
	markersFile = join(tmpdir(), `ffxiv-test-markers-${port}.json`);
	let stderr = "";
	proc = spawn(process.execPath, [join(root, "src/daemon.mjs"), "--no-capture", "--http-port", String(port)], {
		cwd: root,
		env: { ...process.env, FFXIV_MARKERS_FILE: markersFile },
		stdio: ["ignore", "ignore", "pipe"], // capture stderr so a boot failure is diagnosable
	});
	proc.stderr.on("data", (d) => { stderr += d; });
	const deadline = Date.now() + 20000;
	for (;;) {
		if (proc.exitCode !== null) throw new Error(`daemon exited early (code ${proc.exitCode}):\n${stderr}`);
		try { if ((await fetch(`${base}/maps`)).ok) break; } catch { /* not up yet */ }
		if (Date.now() > deadline) throw new Error(`daemon did not serve /maps within 20s:\n${stderr}`);
		await new Promise((r) => setTimeout(r, 200));
	}
}, 30000);

afterAll(() => {
	proc?.kill();
	try { if (markersFile) unlinkSync(markersFile); } catch { /* never created — fine */ }
});

const json = (path) => fetch(`${base}${path}`).then((r) => r.json());

describe("daemon HTTP endpoints (characterization)", () => {
	it("GET /maps -> non-empty array of {id,name,...}", async () => {
		const maps = await json("/maps");
		expect(Array.isArray(maps)).toBe(true);
		expect(maps.length).toBeGreaterThan(0);
		expect(maps[0]).toHaveProperty("id");
		expect(maps[0]).toHaveProperty("name");
	});

	it("GET /map?id= -> single map with size_factor + image", async () => {
		const maps = await json("/maps");
		const m = await json(`/map?id=${maps[0].id}`);
		expect(m).toHaveProperty("size_factor");
		expect(m).toHaveProperty("image");
	});

	it("GET /nodes?map= -> array; items resolved to {id,name}", async () => {
		// globalSetup guarantees data/nodes.json exists — read it to pick a map
		// that has nodes, then make a single targeted request (no HTTP scanning).
		const nodesDb = JSON.parse(readFileSync(join(root, "data/nodes.json"), "utf-8"));
		const mapId = Object.values(nodesDb).find((n) => n.map)?.map;
		expect(mapId).toBeTruthy();
		const nodes = await json(`/nodes?map=${mapId}`);
		expect(Array.isArray(nodes)).toBe(true);
		expect(nodes.length).toBeGreaterThan(0);
		expect(Array.isArray(nodes[0].items)).toBe(true);
		expect(nodes[0].items[0]).toHaveProperty("name");
	});

	it("GET /timed-nodes -> array with map + spawns", async () => {
		const list = await json("/timed-nodes");
		expect(Array.isArray(list)).toBe(true);
		expect(list.length).toBeGreaterThan(0);
		expect(list[0]).toHaveProperty("spawns");
		expect(list[0]).toHaveProperty("map");
	});

	it("GET /hunting-log -> object keyed by class", async () => {
		const log = await json("/hunting-log");
		expect(typeof log).toBe("object");
		expect(Object.keys(log).length).toBeGreaterThan(0);
	});

	it("GET /find-material?q=copper -> ranked hits with nodes + maps", async () => {
		const hits = await json("/find-material?q=copper");
		expect(Array.isArray(hits)).toBe(true);
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0]).toHaveProperty("nodes");
		expect(hits[0]).toHaveProperty("maps");
	});

	it("GET /find-material with <2 chars -> []", async () => {
		expect(await json("/find-material?q=a")).toEqual([]);
	});

	it("GET /list with a bogus id does not crash the daemon", async () => {
		try { await fetch(`${base}/list?id=__definitely_not_a_real_list__`, { signal: AbortSignal.timeout(8000) }); }
		catch { /* network/timeout is fine — we only assert the daemon survives */ }
		expect((await fetch(`${base}/maps`)).ok).toBe(true);
	});

	it("POST -> GET -> DELETE /custom round-trips a marker", async () => {
		const map = 999999; // isolated test bucket (custom-markers.json is gitignored)
		const created = await fetch(`${base}/custom`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ map, x: 10, y: 20, label: "vitest", icon: "⛏️" }),
		}).then((r) => r.json());
		expect(created).toHaveProperty("id");

		const list = await json(`/custom?map=${map}`);
		expect(list.some((m) => m.id === created.id)).toBe(true);

		const del = await fetch(`${base}/custom?map=${map}&id=${created.id}`, { method: "DELETE" });
		expect(del.status).toBe(204);

		const after = await json(`/custom?map=${map}`);
		expect(after.some((m) => m.id === created.id)).toBe(false);
	});

	it("unknown path -> 404", async () => {
		expect((await fetch(`${base}/no-such-endpoint`)).status).toBe(404);
	});
});
