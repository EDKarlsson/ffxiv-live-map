/**
 * Generates build/icon.icns for electron-builder — no image-library dependency.
 * Draws a rounded-rect dark icon with the app's blue player-dot + heading arrow,
 * writes a 1024px PNG, then uses macOS `sips` + `iconutil` to produce the .icns.
 *
 *   node scripts/make-icon.mjs
 */
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { deflateSync } from "zlib";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "build");
const SIZE = 1024;

// --- draw RGBA ---------------------------------------------------------------
const buf = Buffer.alloc(SIZE * SIZE * 4);
const set = (x, y, r, g, b, a = 255) => {
	const i = (y * SIZE + x) * 4;
	buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
};
const margin = 36, radius = 210;
const inRounded = (x, y) => {
	const lo = margin + radius, hi = SIZE - margin - radius;
	const qx = Math.max(lo, Math.min(x, hi)), qy = Math.max(lo, Math.min(y, hi));
	if (x < margin || x > SIZE - margin || y < margin || y > SIZE - margin) return false;
	return Math.hypot(x - qx, y - qy) <= radius;
};
const cx = 512, cy = 540;
for (let y = 0; y < SIZE; y++) {
	for (let x = 0; x < SIZE; x++) {
		if (!inRounded(x, y)) { set(x, y, 0, 0, 0, 0); continue; }
		let r = 27, g = 31, b = 41; // #1b1f29 dark bg
		const d = Math.hypot(x - cx, y - cy);
		if (d <= 250 && d > 222) { r = 255; g = 255; b = 255; }       // white ring
		else if (d <= 222) { r = 77; g = 163; b = 255; }             // #4da3ff player dot
		set(x, y, r, g, b);
	}
}
// heading arrow (white triangle) above the dot, apex up
for (let y = 215; y <= 300; y++) {
	const half = ((y - 215) / 85) * 60;
	for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) if (inRounded(x, y)) set(x, y, 255, 255, 255);
}

// --- encode PNG --------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
	const tb = Buffer.from(type, "ascii");
	const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])));
	return Buffer.concat([len, tb, data, crc]);
};
const stride = SIZE * 4 + 1;
const raw = Buffer.alloc(SIZE * stride);
for (let y = 0; y < SIZE; y++) buf.copy(raw, y * stride + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(BUILD, { recursive: true });
const pngPath = join(BUILD, "icon-1024.png");
writeFileSync(pngPath, png);
console.log(`[make-icon] wrote ${pngPath} (${png.length} bytes)`);

// --- PNG -> .icns via macOS sips + iconutil ----------------------------------
if (process.platform !== "darwin") {
	console.warn("[make-icon] not macOS — wrote the PNG only; run on macOS to produce icon.icns.");
	process.exit(0);
}
const iconset = join(BUILD, "icon.iconset");
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset);
for (const s of [16, 32, 128, 256, 512]) {
	for (const [px, name] of [[s, `icon_${s}x${s}.png`], [s * 2, `icon_${s}x${s}@2x.png`]]) {
		spawnSync("sips", ["-z", String(px), String(px), pngPath, "--out", join(iconset, name)], { stdio: "ignore" });
	}
}
const r = spawnSync("iconutil", ["-c", "icns", iconset, "-o", join(BUILD, "icon.icns")], { stdio: "inherit" });
rmSync(iconset, { recursive: true, force: true });
if (r.status !== 0) { console.error("[make-icon] iconutil failed"); process.exit(1); }
console.log(`[make-icon] wrote ${join(BUILD, "icon.icns")}`);
