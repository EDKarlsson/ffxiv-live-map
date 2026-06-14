/**
 * Bundles + minifies the frontend into public/dist/ with esbuild.
 *
 *   node scripts/build-web.mjs            # one-off production build (minified)
 *   node scripts/build-web.mjs --watch    # incremental rebuilds for development
 *
 * Two entry points (app.js + styles.css) rather than `import './styles.css'`
 * from app.js — that keeps app.js a valid native ES module the browser can load
 * directly in dev (NODE_ENV !== production), while prod serves the bundle.
 * Leaflet stays a CDN global (`L`), so it isn't bundled.
 */
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
	entryPoints: ["public/src/app.js", "public/styles.css"],
	outdir: "public/dist",
	entryNames: "[name]", // flat output: dist/app.js + dist/styles.css (not dist/src/app.js)
	bundle: true,
	minify: !watch,
	sourcemap: true,
	format: "esm",
	target: "es2022",
	platform: "browser",
	logLevel: "info",
};

if (watch) {
	const ctx = await esbuild.context(options);
	await ctx.watch();
	console.log("[build-web] watching public/src + styles.css -> public/dist …");
} else {
	await esbuild.build(options);
	console.log("[build-web] built public/dist/app.js + styles.css (minified + sourcemaps)");
}
