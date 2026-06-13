import { defineConfig } from "vitest/config";

// Two projects so backend and frontend run in the right environment:
//   - backend: Node — exercises src/ (coords math + the daemon's HTTP API).
//   - frontend: happy-dom — exercises browser-side pure logic + the HUD markup.
// The substantive frontend unit tests arrive with PR1 (once the inline <script>
// is extracted into importable modules); for now the frontend project guards the
// HUD structure.
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "backend",
					environment: "node",
					include: ["test/backend/**/*.test.mjs"],
					// Build derived data/ once before backend tests (no-op if present).
					globalSetup: ["./test/setup/ensure-data.mjs"],
					testTimeout: 30000,
				},
			},
			{
				test: {
					name: "frontend",
					environment: "happy-dom",
					include: ["test/frontend/**/*.test.mjs"],
				},
			},
		],
	},
});
