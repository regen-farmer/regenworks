import {
	type helpers as turf,
	length as turfLength,
	buffer,
	along,
	circle,
	difference,
	area
} from "@turf/turf";

import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import { makeInitialLine } from "./make_line.ts";
import { makeTreeRowLines } from "./make_tree_row_lines.ts";
import { makeGroundCoverAreas } from "./make_ground_cover_areas.ts";
import { makeAllStripPolygons } from "./make_all_strip_polygons.ts";
import { applyHeadland } from "./headland.ts";
import SystemDesign, {
	type ISystemDesignSchema,
} from "@rw/db/schemas/systemdesign.ts";

export function systemBasedLayout(
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

	const polygon = JSON.parse(fieldGeometry);

	// MARGIN
	const marginPolygon = buffer(polygon, -systemdesign.margin, {
		units: "meters",
	});

	// HEADLAND
	const {
		headlandSides,
		headlandPolygon,
		sidesCloseToBearing,
		intersectionPoints,
	} = applyHeadland(marginPolygon, systemdesign.headland, systemdesign.bearing);

	const {
		lineIntersectingPolygon: lineIntersectingAreaInsideMargin,
		widthOfPolygon: widthOfAreaInsideMargin,
	} = makeInitialLine(systemdesign.bearing, headlandPolygon);

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

				const newCircle = circle(point.geometry.coordinates, 2, {
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

	const speciesCounts = treeMarkerArray.reduce((counts: Record<string, { species: any; count: number }>, marker: any) => {
		// console.log('marker.species', marker.species)
		if (!marker.species) return counts;

		const key = String((marker.species as any)?._id ?? (marker.species as any)?.id ?? marker.species);
		if (!counts[key]) {
			counts[key] = {
				species: marker.species,
				count: 0,
			};
		}
		counts[key].count++;
		return counts;
	}, {} as Record<string, { species: any; count: number }>);

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
