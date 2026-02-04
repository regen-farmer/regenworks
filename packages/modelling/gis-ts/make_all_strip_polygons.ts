import {
	buffer,
	mask,
	intersect,
	area as turfArea,
	polygon as turfPolygon,
	multiPolygon as turfMultiPolygon,
} from "@turf/turf";

import type {
  Feature,
  Polygon,
  MultiPolygon,
  LineString,
  GeoJsonProperties as Properties
} from 'geojson';

import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";

/**
 * Generates polygons for ALL strips (rows), not just those with ground cover.
 * This ensures we have accurate area calculations for every strip.
 */
export function makeAllStripPolygons(
	offsetPolygon: Feature<Polygon, Properties>,
	lineIntersectingAreaInsideMargin: Feature<LineString, Properties>,
	widthOfAreaInsideMargin: number,
	rows: {
		sequence: {
			species: ISpeciesSchema | string;
			spacingAfter: number;
		}[];
		headland?: {
			before?: number;
			after?: number;
		};
		offset?: {
			before?: number;
			after?: number;
		};
		groundcover?: ISpeciesSchema | string;
		width: number;
	}[],
): {
	stripPolygons: Feature<Polygon | MultiPolygon, Properties>[];
	stripAreasM2: number[];
} {
	let accumulatingWidth = 0;
	const stripPolygons: Feature<Polygon | MultiPolygon, Properties>[] = [];
	const stripAreasM2: number[] = [];

	let currentRowIdx = 0;

	if (!(rows.length > 0)) {
		console.log("No rows in system design");
		return { stripPolygons: [], stripAreasM2: [] };
	}

	// eslint-disable-next-line no-constant-condition
	while (true) {
		// Complete if there isn't room for more lines
		if (accumulatingWidth > widthOfAreaInsideMargin) {
			break;
		}

		// Create the strip polygon using buffers
		let elongatedDonutBuffer;

		// This requires two buffers to create a "donut" shape for the strip
		if (accumulatingWidth > 0) {
			const bufferSmall = buffer(
				lineIntersectingAreaInsideMargin,
				accumulatingWidth,
				{ units: "meters" },
			);
			const bufferBig = buffer(
				lineIntersectingAreaInsideMargin,
				accumulatingWidth + rows[currentRowIdx].width,
				{ units: "meters" },
			);
			elongatedDonutBuffer = mask(bufferSmall, bufferBig);
		} else {
			elongatedDonutBuffer = buffer(
				lineIntersectingAreaInsideMargin,
				rows[currentRowIdx].width,
				{ units: "meters" },
			);
		}

		// Intersect with the field polygon to get the actual strip area
		const intersectionAreas = intersect({
			type: "FeatureCollection",
			features: [offsetPolygon, elongatedDonutBuffer],
		});

		// Store the polygon and calculate its area
		if (intersectionAreas) {
			if (intersectionAreas.geometry.type === "Polygon") {
				const polygon = turfPolygon(intersectionAreas.geometry.coordinates, {
					name: `strip_${stripPolygons.length}`,
					rowIndex: currentRowIdx,
				});
				stripPolygons.push(polygon);
				stripAreasM2.push(turfArea(polygon));
			} else if (intersectionAreas.geometry.type === "MultiPolygon") {
				// For MultiPolygons, combine into one entry
				const multiPolygon = turfMultiPolygon(intersectionAreas.geometry.coordinates, {
					name: `strip_${stripPolygons.length}`,
					rowIndex: currentRowIdx,
				});
				stripPolygons.push(multiPolygon);
				stripAreasM2.push(turfArea(multiPolygon));
			}
		} else {
			// Even if no intersection, we need to maintain the array index alignment
			stripPolygons.push(null as any);
			stripAreasM2.push(0);
		}

		// Add row width
		accumulatingWidth += rows[currentRowIdx].width;

		// Prepare for next row. Cycle through rows in system design
		currentRowIdx++;
		if (currentRowIdx === rows.length) {
			currentRowIdx = 0;
		}
	}

	console.log("stripPolygons.length", stripPolygons.length);
	console.log("Total strips area (m²):", stripAreasM2.reduce((a, b) => a + b, 0));
	
	return { stripPolygons, stripAreasM2 };
}