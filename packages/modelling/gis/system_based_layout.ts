import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import SystemDesign, {
	type ISystemDesignSchema,
} from "@rw/db/schemas/systemdesign.ts";
import {
	along,
	area,
	buffer,
	circle,
	difference,
	type helpers as turf,
	length as turfLength,
} from "@turf/turf";
import { applyHeadland } from "./headland.ts";
import { makeAllStripPolygons } from "./make_all_strip_polygons.ts";
import { makeGroundCoverAreas } from "./make_ground_cover_areas.ts";
import { makeInitialLine } from "./make_line.ts";
import { makeTreeRowLines } from "./make_tree_row_lines.ts";

// Rust model configuration
const RUST_MODEL_URL = process.env.RUST_MODEL_URL || "http://localhost:3002";
const USE_RUST_MODEL = process.env.USE_RUST_MODEL === "true";

/**
 * Call the Rust layout model via HTTP
 */
async function callRustModel(
	systemdesign: ISystemDesignSchema,
	fieldGeometry: string,
) {
	const response = await fetch(`${RUST_MODEL_URL}/layout`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			systemdesign: {
				rows: systemdesign.rows,
				bearing: systemdesign.bearing || 0,
				margin: systemdesign.margin || 0,
				headland: systemdesign.headland || 0,
			},
			fieldGeometry,
		}),
	});

	if (!response.ok) {
		throw new Error(
			`Rust model error: ${response.status} ${response.statusText}`,
		);
	}

	const result = await response.json();
	if (!result.success) {
		throw new Error(`Rust model failed: ${result.error}`);
	}

	return result.data;
}

/**
 * Async version that can use Rust model
 */
export async function systemBasedLayoutAsync(
	systemdesign: ISystemDesignSchema,
	fieldGeometry: string,
) {
	if (USE_RUST_MODEL) {
		try {
			const rustResult = await callRustModel(systemdesign, fieldGeometry);
			console.log(
				`[Rust model] Layout generated in ${rustResult.timingMs?.toFixed(1) || "?"}ms`,
			);
			return rustResult;
		} catch (error) {
			console.warn("[Rust model] Failed, falling back to TypeScript:", error);
			// Fall through to TypeScript implementation
		}
	}

	return systemBasedLayoutSync(systemdesign, fieldGeometry);
}

/**
 * Synchronous TypeScript implementation (original)
 */
export function systemBasedLayoutSync(
	systemdesign: ISystemDesignSchema,
	fieldGeometry: string,
) {
	if (!systemdesign) {
		systemdesign = new SystemDesign({
			margin: 0,
			headland: 0,
			bearing: 0,
			rows: [],
		});
	}

	const systemRows = systemdesign.rows;

	// Parse and validate the geometry
	let polygon;
	try {
		polygon = JSON.parse(fieldGeometry);
		if (!polygon || !polygon.geometry) {
			console.error("Invalid polygon structure:", polygon);
			throw new Error("Invalid polygon structure");
		}
	} catch (error) {
		console.error("Failed to parse field geometry:", error);
		throw error;
	}

	// MARGIN
	let marginPolygon;
	try {
		// Ensure margin is a valid number and not too large
		const margin = systemdesign.margin || 0;
		if (margin > 0) {
			marginPolygon = buffer(polygon, -margin, {
				units: "meters",
			});

			// If buffer returns null (can happen with invalid geometries or too large margins)
			if (!marginPolygon) {
				console.warn("Buffer operation returned null, using original polygon");
				marginPolygon = polygon;
			}
		} else {
			// If no margin, use original polygon
			marginPolygon = polygon;
		}
	} catch (error) {
		console.error("Buffer operation failed:", error);
		// Fall back to original polygon if buffer fails
		marginPolygon = polygon;
	}

	// HEADLAND
	// Ensure bearing is a valid number
	const bearing =
		typeof systemdesign.bearing === "number" ? systemdesign.bearing : 0;
	const headland =
		typeof systemdesign.headland === "number" ? systemdesign.headland : 0;

	const {
		headlandSides,
		headlandPolygon,
		sidesCloseToBearing,
		intersectionPoints,
	} = applyHeadland(marginPolygon, headland, bearing);

	const {
		lineIntersectingPolygon: lineIntersectingAreaInsideMargin,
		widthOfPolygon: widthOfAreaInsideMargin,
	} = makeInitialLine(bearing, headlandPolygon);

	// TREE ROW LINES
	const treeRowLines = makeTreeRowLines(
		headlandPolygon,
		lineIntersectingAreaInsideMargin,
		widthOfAreaInsideMargin,
		systemdesign.rows as any,
	);

	// ALL STRIP POLYGONS (for accurate area calculations)
	const { stripPolygons, stripAreasM2 } = makeAllStripPolygons(
		headlandPolygon,
		lineIntersectingAreaInsideMargin,
		widthOfAreaInsideMargin,
		systemdesign.rows as any,
	);

	// GROUND COVER AREAS (for display/visualization)
	const { groundCoverAreas, groundCoverAreasM2 } = makeGroundCoverAreas(
		headlandPolygon,
		lineIntersectingAreaInsideMargin,
		widthOfAreaInsideMargin,
		systemdesign.rows as any,
	);

	// INDIVIDUAL TREES
	const treeMarkerArray: any[] = [];

	for (const treeRowLine of treeRowLines) {
		if (
			systemRows[treeRowLine.systemDesignRowIndex].sequence.reduce(
				(acc, curr) => acc + curr.spacingAfter,
				0,
			) > 0
		) {
			const sequence = systemRows[treeRowLine.systemDesignRowIndex].sequence;
			let treeSequenceIdx = 0;
			let distance = 0;
			while (distance < turfLength(treeRowLine.line, { units: "meters" })) {
				const point = along(treeRowLine.line, distance, { units: "meters" });

				// Reduced radius from 2m to 1.4m (~30% smaller) so later rendering need not rescale
				const newCircle = circle(point.geometry.coordinates, 1.4, {
					units: "meters",
				});
				treeMarkerArray.push({
					species: sequence[treeSequenceIdx].species,
					point,
					circle: newCircle,
				});
				distance += sequence[treeSequenceIdx].spacingAfter;
				treeSequenceIdx = (treeSequenceIdx + 1) % sequence.length;
			}
		}
	}

	const speciesCounts = treeMarkerArray.reduce(
		(counts: Record<string, { species: any; count: number }>, marker: any) => {
			// console.log('marker.species', marker.species)
			if (!marker.species) return counts;

			const key = String(
				(marker.species as any)?._id ??
					(marker.species as any)?.id ??
					marker.species,
			);
			if (!counts[key]) {
				counts[key] = {
					species: marker.species,
					count: 0,
				};
			}
			counts[key].count++;
			return counts;
		},
		{} as Record<string, { species: any; count: number }>,
	);

	console.log("speciesCounts", speciesCounts);

	const speciesCountArray = Object.values(speciesCounts);
	// console.log('speciesCountArray',speciesCountArray)
	// // Edge System
	// const { edgeTreeCanopyArray, edgeRowArray } = createEdge(project, calibrateDistance, polygon);
	// rowArray.concat(edgeRowArray);
	// treeCanopyArray.concat(edgeTreeCanopyArray);

	// const marginGeometry = difference({
	// type: "FeatureCollection",
	// features: [polygon, headlandPolygon]})
	// const marginArea = area(marginGeometry);

	// console.log("Margin area", marginArea, area(marginArea))

	return {
		speciesCountArray,
		headlandSides,
		sidesCloseToBearing,
		treeRowLines,
		headlandPolygon,
		marginPolygon,
		groundCoverAreas,
		intersectionPoints,
		treeMarkerArray,
		groundCoverAreasM2,
		stripPolygons,
		stripAreasM2,
		// marginGeometry,
		// marginArea
	};
}

/**
 * Default export - synchronous TypeScript implementation
 * Use systemBasedLayoutAsync() to leverage the Rust model when USE_RUST_MODEL=true
 */
export const systemBasedLayout = systemBasedLayoutSync;
