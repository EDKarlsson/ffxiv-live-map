/**
 * Coordinate conversion between raw world floats (from packets) and
 * in-game map coordinates / map-image pixels.
 *
 * Formula source: widely used community formula (xivapi docs / Teamcraft).
 * c = size_factor / 100
 * mapCoord = (41 / c) * ((raw + offset) * c + 1024) / 2048 + 1
 *
 * VERIFY-LIVE: confirmed against live packets? -> pending first POC run.
 * Map data: data/maps.json copied from ffxiv-teamcraft
 * (libs/data/src/lib/json/maps.json) — fields: territory_id, size_factor,
 * offset_x, offset_y, image (2048x2048 jpg on xivapi).
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const maps = JSON.parse(readFileSync(join(__dirname, "../data/maps.json"), "utf-8"));

/** In-game map coordinate (the numbers you see on the in-game map, ~1..42). */
export function toMapCoord(raw, offset, sizeFactor) {
	const c = sizeFactor / 100;
	return (41 / c) * (((raw + offset) * c + 1024) / 2048) + 1;
}

/** Pixel position on the 2048x2048 map image. */
export function toPixel(raw, offset, sizeFactor) {
	const c = sizeFactor / 100;
	return (raw + offset) * c + 1024;
}

/**
 * Find the map entry for a territory id (InitZone.zoneId).
 * Several maps can share a territory (e.g. multi-floor); prefer index 0.
 */
export function mapById(id) {
	return maps[id] ?? null;
}

export function mapForTerritory(territoryId) {
	const candidates = Object.values(maps).filter((m) => m.territory_id === territoryId);
	if (candidates.length === 0) return null;
	return candidates.find((m) => m.index === 0) ?? candidates[0];
}

export function convertPosition(pos, map) {
	// Packet axis convention: pos.x = east-west, pos.y = ALTITUDE, pos.z = north-south.
	// Map-Y must come from pos.z — same swap Teamcraft does in
	// apps/client/.../mappy/mappy-reporter.ts (y: position.pos.z, z: position.pos.y).
	return {
		raw: pos,
		altitude: pos.y,
		mapX: toMapCoord(pos.x, map.offset_x, map.size_factor),
		mapY: toMapCoord(pos.z, map.offset_y, map.size_factor),
		pixelX: toPixel(pos.x, map.offset_x, map.size_factor),
		pixelY: toPixel(pos.z, map.offset_y, map.size_factor),
	};
}
