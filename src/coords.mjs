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
import { join } from "path";
import { DATA_DIR } from "./paths.mjs";

const maps = JSON.parse(readFileSync(join(DATA_DIR, "maps.json"), "utf-8"));

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
/**
 * Rewrite Teamcraft's xivapi v1 image URL (frozen host) to the maintained
 * XIVAPI v2 map-composition endpoint:
 *   https://xivapi.com/m/s1t1/s1t1.01.jpg -> https://v2.xivapi.com/api/asset/map/s1t1/01
 */
function withV2Image(map) {
	if (!map) return null;
	const m = map.image?.match(/\/m\/([^/]+)\/[^/]+\.(\d+)\.jpg$/);
	return m ? { ...map, image: `https://v2.xivapi.com/api/asset/map/${m[1]}/${m[2]}` } : map;
}

export function mapById(id) {
	return withV2Image(maps[id] ?? null);
}

export function mapForTerritory(territoryId) {
	const candidates = Object.values(maps).filter((m) => m.territory_id === territoryId);
	if (candidates.length === 0) return null;
	return withV2Image(candidates.find((m) => m.index === 0) ?? candidates[0]);
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
