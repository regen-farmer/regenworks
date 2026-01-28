/**
 * Bridge between Rust WASM and geos-wasm
 *
 * This module provides geometry operations using geos-wasm that can be
 * called from Rust WASM code via wasm-bindgen imports.
 */

import initGeosJs from "geos-wasm";

let geos: Awaited<ReturnType<typeof initGeosJs>> | null = null;

/**
 * Initialize GEOS - must be called before any geometry operations
 */
export async function initGeos(): Promise<void> {
	if (!geos) {
		geos = await initGeosJs();
	}
}

/**
 * Check if GEOS is initialized
 */
export function isGeosReady(): boolean {
	return geos !== null;
}

/**
 * Helper to create a WKT string from polygon coordinates
 * @param rings - Array of rings, each ring is an array of [lng, lat] coordinates
 */
function polygonToWkt(rings: number[][][]): string {
	const ringStrs = rings.map((ring) => {
		const coordStrs = ring.map(([x, y]) => `${x} ${y}`);
		return `(${coordStrs.join(", ")})`;
	});
	return `POLYGON (${ringStrs.join(", ")})`;
}

/**
 * Helper to create a WKT string from line coordinates
 */
function lineToWkt(coords: number[][]): string {
	const coordStrs = coords.map(([x, y]) => `${x} ${y}`);
	return `LINESTRING (${coordStrs.join(", ")})`;
}

/**
 * Parse WKT polygon result back to coordinate arrays
 */
function wktToPolygonCoords(wkt: string): number[][][] {
	// Handle POLYGON ((x y, x y, ...)) or MULTIPOLYGON (((x y, ...)), ((x y, ...)))
	if (wkt.startsWith("MULTIPOLYGON")) {
		// For multipolygon, return just the first/largest polygon for now
		// Extract all polygon parts
		const content = wkt.slice("MULTIPOLYGON ".length);
		const polygons: number[][][][] = [];

		// Simple parser for MULTIPOLYGON
		let depth = 0;
		let start = -1;
		for (let i = 0; i < content.length; i++) {
			if (content[i] === "(") {
				if (depth === 1) start = i;
				depth++;
			} else if (content[i] === ")") {
				depth--;
				if (depth === 1 && start >= 0) {
					const polyWkt = "POLYGON " + content.slice(start, i + 1);
					polygons.push(wktToPolygonCoords(polyWkt));
				}
			}
		}

		// Return largest polygon by number of points
		if (polygons.length === 0) return [];
		return polygons.reduce((a, b) =>
			(a[0]?.length || 0) > (b[0]?.length || 0) ? a : b,
		);
	}

	if (!wkt.startsWith("POLYGON")) {
		return [];
	}

	// Remove "POLYGON " prefix and parse
	const content = wkt.slice("POLYGON ".length).trim();
	const rings: number[][][] = [];

	// Parse each ring
	let ringStart = -1;
	let depth = 0;

	for (let i = 0; i < content.length; i++) {
		if (content[i] === "(") {
			depth++;
			if (depth === 2) ringStart = i + 1;
		} else if (content[i] === ")") {
			if (depth === 2 && ringStart >= 0) {
				const ringStr = content.slice(ringStart, i);
				const coords = ringStr.split(",").map((s) => {
					const [x, y] = s.trim().split(/\s+/).map(Number);
					return [x, y];
				});
				rings.push(coords);
			}
			depth--;
		}
	}

	return rings;
}

/**
 * Buffer a polygon by a distance
 * @param rings - Polygon rings as [[[x,y],...],...]
 * @param distance - Buffer distance (same units as coordinates)
 * @param quadSegs - Number of segments per quadrant for curves (default 8)
 * @returns Buffered polygon rings, or null on error
 */
export function bufferPolygon(
	rings: number[][][],
	distance: number,
	quadSegs: number = 8,
): number[][][] | null {
	if (!geos) {
		console.error("GEOS not initialized");
		return null;
	}

	try {
		const wkt = polygonToWkt(rings);
		const reader = geos.GEOSWKTReader_create();

		// Read WKT to geometry
		const size = wkt.length + 1;
		const wktPtr = geos.Module._malloc(size);
		geos.Module.stringToUTF8(wkt, wktPtr, size);
		const geomPtr = geos.GEOSWKTReader_read(reader, wktPtr);
		geos.Module._free(wktPtr);

		if (!geomPtr) {
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		// Buffer the geometry
		const bufferedPtr = geos.GEOSBuffer(geomPtr, distance, quadSegs);

		if (!bufferedPtr) {
			geos.GEOSGeom_destroy(geomPtr);
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		// Convert back to WKT
		const writer = geos.GEOSWKTWriter_create();
		const resultWktPtr = geos.GEOSWKTWriter_write(writer, bufferedPtr);
		const resultWkt = geos.Module.UTF8ToString(resultWktPtr);

		// Cleanup
		geos.GEOSFree(resultWktPtr);
		geos.GEOSWKTWriter_destroy(writer);
		geos.GEOSGeom_destroy(bufferedPtr);
		geos.GEOSGeom_destroy(geomPtr);
		geos.GEOSWKTReader_destroy(reader);

		return wktToPolygonCoords(resultWkt);
	} catch (e) {
		console.error("bufferPolygon error:", e);
		return null;
	}
}

/**
 * Buffer a line to create a capsule-shaped polygon
 * @param coords - Line coordinates as [[x,y],...]
 * @param distance - Buffer distance
 * @param quadSegs - Number of segments per quadrant
 * @returns Buffered polygon rings, or null on error
 */
export function bufferLine(
	coords: number[][],
	distance: number,
	quadSegs: number = 8,
): number[][][] | null {
	if (!geos) {
		console.error("GEOS not initialized");
		return null;
	}

	try {
		const wkt = lineToWkt(coords);
		const reader = geos.GEOSWKTReader_create();

		const size = wkt.length + 1;
		const wktPtr = geos.Module._malloc(size);
		geos.Module.stringToUTF8(wkt, wktPtr, size);
		const geomPtr = geos.GEOSWKTReader_read(reader, wktPtr);
		geos.Module._free(wktPtr);

		if (!geomPtr) {
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		const bufferedPtr = geos.GEOSBuffer(geomPtr, distance, quadSegs);

		if (!bufferedPtr) {
			geos.GEOSGeom_destroy(geomPtr);
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		const writer = geos.GEOSWKTWriter_create();
		const resultWktPtr = geos.GEOSWKTWriter_write(writer, bufferedPtr);
		const resultWkt = geos.Module.UTF8ToString(resultWktPtr);

		geos.GEOSFree(resultWktPtr);
		geos.GEOSWKTWriter_destroy(writer);
		geos.GEOSGeom_destroy(bufferedPtr);
		geos.GEOSGeom_destroy(geomPtr);
		geos.GEOSWKTReader_destroy(reader);

		return wktToPolygonCoords(resultWkt);
	} catch (e) {
		console.error("bufferLine error:", e);
		return null;
	}
}

/**
 * Compute the difference of two polygons (poly1 - poly2)
 */
export function difference(
	poly1Rings: number[][][],
	poly2Rings: number[][][],
): number[][][] | null {
	if (!geos) {
		console.error("GEOS not initialized");
		return null;
	}

	try {
		const wkt1 = polygonToWkt(poly1Rings);
		const wkt2 = polygonToWkt(poly2Rings);
		const reader = geos.GEOSWKTReader_create();

		// Read first polygon
		const size1 = wkt1.length + 1;
		const wktPtr1 = geos.Module._malloc(size1);
		geos.Module.stringToUTF8(wkt1, wktPtr1, size1);
		const geomPtr1 = geos.GEOSWKTReader_read(reader, wktPtr1);
		geos.Module._free(wktPtr1);

		// Read second polygon
		const size2 = wkt2.length + 1;
		const wktPtr2 = geos.Module._malloc(size2);
		geos.Module.stringToUTF8(wkt2, wktPtr2, size2);
		const geomPtr2 = geos.GEOSWKTReader_read(reader, wktPtr2);
		geos.Module._free(wktPtr2);

		if (!geomPtr1 || !geomPtr2) {
			if (geomPtr1) geos.GEOSGeom_destroy(geomPtr1);
			if (geomPtr2) geos.GEOSGeom_destroy(geomPtr2);
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		// Compute difference
		const resultPtr = geos.GEOSDifference(geomPtr1, geomPtr2);

		if (!resultPtr) {
			geos.GEOSGeom_destroy(geomPtr1);
			geos.GEOSGeom_destroy(geomPtr2);
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		const writer = geos.GEOSWKTWriter_create();
		const resultWktPtr = geos.GEOSWKTWriter_write(writer, resultPtr);
		const resultWkt = geos.Module.UTF8ToString(resultWktPtr);

		geos.GEOSFree(resultWktPtr);
		geos.GEOSWKTWriter_destroy(writer);
		geos.GEOSGeom_destroy(resultPtr);
		geos.GEOSGeom_destroy(geomPtr1);
		geos.GEOSGeom_destroy(geomPtr2);
		geos.GEOSWKTReader_destroy(reader);

		return wktToPolygonCoords(resultWkt);
	} catch (e) {
		console.error("difference error:", e);
		return null;
	}
}

/**
 * Compute the intersection of two polygons
 */
export function intersection(
	poly1Rings: number[][][],
	poly2Rings: number[][][],
): number[][][] | null {
	if (!geos) {
		console.error("GEOS not initialized");
		return null;
	}

	try {
		const wkt1 = polygonToWkt(poly1Rings);
		const wkt2 = polygonToWkt(poly2Rings);
		const reader = geos.GEOSWKTReader_create();

		const size1 = wkt1.length + 1;
		const wktPtr1 = geos.Module._malloc(size1);
		geos.Module.stringToUTF8(wkt1, wktPtr1, size1);
		const geomPtr1 = geos.GEOSWKTReader_read(reader, wktPtr1);
		geos.Module._free(wktPtr1);

		const size2 = wkt2.length + 1;
		const wktPtr2 = geos.Module._malloc(size2);
		geos.Module.stringToUTF8(wkt2, wktPtr2, size2);
		const geomPtr2 = geos.GEOSWKTReader_read(reader, wktPtr2);
		geos.Module._free(wktPtr2);

		if (!geomPtr1 || !geomPtr2) {
			if (geomPtr1) geos.GEOSGeom_destroy(geomPtr1);
			if (geomPtr2) geos.GEOSGeom_destroy(geomPtr2);
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		const resultPtr = geos.GEOSIntersection(geomPtr1, geomPtr2);

		if (!resultPtr) {
			geos.GEOSGeom_destroy(geomPtr1);
			geos.GEOSGeom_destroy(geomPtr2);
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		const writer = geos.GEOSWKTWriter_create();
		const resultWktPtr = geos.GEOSWKTWriter_write(writer, resultPtr);
		const resultWkt = geos.Module.UTF8ToString(resultWktPtr);

		geos.GEOSFree(resultWktPtr);
		geos.GEOSWKTWriter_destroy(writer);
		geos.GEOSGeom_destroy(resultPtr);
		geos.GEOSGeom_destroy(geomPtr1);
		geos.GEOSGeom_destroy(geomPtr2);
		geos.GEOSWKTReader_destroy(reader);

		return wktToPolygonCoords(resultWkt);
	} catch (e) {
		console.error("intersection error:", e);
		return null;
	}
}

/**
 * Find intersection points between a buffered line and a polygon boundary
 * This is used for tree row generation
 */
export function lineBufferPolygonIntersectionPoints(
	lineCoords: number[][],
	bufferDistance: number,
	polygonRings: number[][][],
): number[][] | null {
	if (!geos) {
		console.error("GEOS not initialized");
		return null;
	}

	try {
		// Buffer the line
		const lineWkt = lineToWkt(lineCoords);
		const polyWkt = polygonToWkt(polygonRings);
		const reader = geos.GEOSWKTReader_create();

		// Read line and buffer it
		const lineSize = lineWkt.length + 1;
		const lineWktPtr = geos.Module._malloc(lineSize);
		geos.Module.stringToUTF8(lineWkt, lineWktPtr, lineSize);
		const lineGeomPtr = geos.GEOSWKTReader_read(reader, lineWktPtr);
		geos.Module._free(lineWktPtr);

		if (!lineGeomPtr) {
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		const bufferedLinePtr = geos.GEOSBuffer(lineGeomPtr, bufferDistance, 8);
		geos.GEOSGeom_destroy(lineGeomPtr);

		if (!bufferedLinePtr) {
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		// Read polygon
		const polySize = polyWkt.length + 1;
		const polyWktPtr = geos.Module._malloc(polySize);
		geos.Module.stringToUTF8(polyWkt, polyWktPtr, polySize);
		const polyGeomPtr = geos.GEOSWKTReader_read(reader, polyWktPtr);
		geos.Module._free(polyWktPtr);

		if (!polyGeomPtr) {
			geos.GEOSGeom_destroy(bufferedLinePtr);
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		// Get boundary of buffered line
		const boundaryPtr = geos.GEOSBoundary(bufferedLinePtr);
		geos.GEOSGeom_destroy(bufferedLinePtr);

		if (!boundaryPtr) {
			geos.GEOSGeom_destroy(polyGeomPtr);
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		// Find intersection points
		const intersectionPtr = geos.GEOSIntersection(boundaryPtr, polyGeomPtr);
		geos.GEOSGeom_destroy(boundaryPtr);
		geos.GEOSGeom_destroy(polyGeomPtr);

		if (!intersectionPtr) {
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		// Convert result to WKT and parse points
		const writer = geos.GEOSWKTWriter_create();
		const resultWktPtr = geos.GEOSWKTWriter_write(writer, intersectionPtr);
		const resultWkt = geos.Module.UTF8ToString(resultWktPtr);

		geos.GEOSFree(resultWktPtr);
		geos.GEOSWKTWriter_destroy(writer);
		geos.GEOSGeom_destroy(intersectionPtr);
		geos.GEOSWKTReader_destroy(reader);

		// Parse points from WKT (could be POINT, MULTIPOINT, LINESTRING, etc.)
		return parsePointsFromWkt(resultWkt);
	} catch (e) {
		console.error("lineBufferPolygonIntersectionPoints error:", e);
		return null;
	}
}

/**
 * Parse points from various WKT geometry types
 */
function parsePointsFromWkt(wkt: string): number[][] {
	const points: number[][] = [];

	if (wkt.startsWith("POINT")) {
		const match = wkt.match(/POINT\s*\(\s*([\d.-]+)\s+([\d.-]+)\s*\)/);
		if (match) {
			points.push([parseFloat(match[1]), parseFloat(match[2])]);
		}
	} else if (wkt.startsWith("MULTIPOINT")) {
		const content = wkt.slice("MULTIPOINT ".length);
		const multipointRegex = /\(\s*([\d.-]+)\s+([\d.-]+)\s*\)/g;
		for (const multipointMatch of content.matchAll(multipointRegex)) {
			points.push([
				parseFloat(multipointMatch[1]),
				parseFloat(multipointMatch[2]),
			]);
		}
	} else if (wkt.startsWith("LINESTRING")) {
		const linestringMatch = wkt.match(/LINESTRING\s*\((.*)\)/);
		if (linestringMatch) {
			const coordPairs = linestringMatch[1].split(",");
			for (const pair of coordPairs) {
				const [x, y] = pair.trim().split(/\s+/).map(Number);
				if (!isNaN(x) && !isNaN(y)) {
					points.push([x, y]);
				}
			}
		}
	} else if (
		wkt.startsWith("MULTILINESTRING") ||
		wkt.startsWith("GEOMETRYCOLLECTION")
	) {
		// Extract all coordinate pairs
		const collectionRegex = /([\d.-]+)\s+([\d.-]+)/g;
		for (const collectionMatch of wkt.matchAll(collectionRegex)) {
			points.push([
				parseFloat(collectionMatch[1]),
				parseFloat(collectionMatch[2]),
			]);
		}
	}

	return points;
}

/**
 * Calculate area of a polygon
 */
export function polygonArea(rings: number[][][]): number | null {
	if (!geos) {
		console.error("GEOS not initialized");
		return null;
	}

	try {
		const wkt = polygonToWkt(rings);
		const reader = geos.GEOSWKTReader_create();

		const size = wkt.length + 1;
		const wktPtr = geos.Module._malloc(size);
		geos.Module.stringToUTF8(wkt, wktPtr, size);
		const geomPtr = geos.GEOSWKTReader_read(reader, wktPtr);
		geos.Module._free(wktPtr);

		if (!geomPtr) {
			geos.GEOSWKTReader_destroy(reader);
			return null;
		}

		const areaPtr = geos.Module._malloc(8);
		geos.GEOSArea(geomPtr, areaPtr);
		const area = geos.Module.getValue(areaPtr, "double");

		geos.Module._free(areaPtr);
		geos.GEOSGeom_destroy(geomPtr);
		geos.GEOSWKTReader_destroy(reader);

		return area;
	} catch (e) {
		console.error("polygonArea error:", e);
		return null;
	}
}

// === JSON wrapper functions for Rust WASM interop ===
// These take/return JSON strings for easy wasm-bindgen compatibility

/**
 * Buffer a polygon - JSON wrapper for WASM
 */
export function bufferPolygonJson(
	ringsJson: string,
	distance: number,
	quadSegs: number,
): string | null {
	try {
		const rings = JSON.parse(ringsJson) as number[][][];
		const result = bufferPolygon(rings, distance, quadSegs);
		return result ? JSON.stringify(result) : null;
	} catch {
		return null;
	}
}

/**
 * Buffer a line - JSON wrapper for WASM
 */
export function bufferLineJson(
	coordsJson: string,
	distance: number,
	quadSegs: number,
): string | null {
	try {
		const coords = JSON.parse(coordsJson) as number[][];
		const result = bufferLine(coords, distance, quadSegs);
		return result ? JSON.stringify(result) : null;
	} catch {
		return null;
	}
}

/**
 * Difference - JSON wrapper for WASM
 */
export function differenceJson(
	poly1Json: string,
	poly2Json: string,
): string | null {
	try {
		const poly1 = JSON.parse(poly1Json) as number[][][];
		const poly2 = JSON.parse(poly2Json) as number[][][];
		const result = difference(poly1, poly2);
		return result ? JSON.stringify(result) : null;
	} catch {
		return null;
	}
}

/**
 * Intersection - JSON wrapper for WASM
 */
export function intersectionJson(
	poly1Json: string,
	poly2Json: string,
): string | null {
	try {
		const poly1 = JSON.parse(poly1Json) as number[][][];
		const poly2 = JSON.parse(poly2Json) as number[][][];
		const result = intersection(poly1, poly2);
		return result ? JSON.stringify(result) : null;
	} catch {
		return null;
	}
}

/**
 * Line buffer polygon intersection points - JSON wrapper for WASM
 */
export function lineBufferPolygonIntersectionPointsJson(
	lineJson: string,
	bufferDistance: number,
	polygonJson: string,
): string | null {
	try {
		const line = JSON.parse(lineJson) as number[][];
		const polygon = JSON.parse(polygonJson) as number[][][];
		const result = lineBufferPolygonIntersectionPoints(
			line,
			bufferDistance,
			polygon,
		);
		return result ? JSON.stringify(result) : null;
	} catch {
		return null;
	}
}

/**
 * Polygon area - JSON wrapper for WASM
 */
export function polygonAreaJson(ringsJson: string): number | null {
	try {
		const rings = JSON.parse(ringsJson) as number[][][];
		return polygonArea(rings);
	} catch {
		return null;
	}
}

// Export all functions for use from Rust WASM
export default {
	initGeos,
	isGeosReady,
	bufferPolygon,
	bufferLine,
	difference,
	intersection,
	lineBufferPolygonIntersectionPoints,
	polygonArea,
	// JSON wrappers for WASM
	bufferPolygonJson,
	bufferLineJson,
	differenceJson,
	intersectionJson,
	lineBufferPolygonIntersectionPointsJson,
	polygonAreaJson,
};
