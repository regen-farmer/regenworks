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
		systemdesign.rows,
	);

	// GROUND COVER AREAS
	const { groundCoverAreas, groundCoverAreasM2 } = makeGroundCoverAreas(
		headlandPolygon,
		lineIntersectingAreaInsideMargin,
		widthOfAreaInsideMargin,
		systemdesign.rows,
	);

	// INDIVIDUAL TREES
	const treeMarkerArray: {
		species: ISpeciesSchema;
		point: turf.Feature<turf.Point, turf.Properties>;
		circle: turf.Feature<turf.Polygon, turf.Properties>;
	}[] = [];

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

	const speciesCounts = treeMarkerArray.reduce((counts, marker) => {
		// console.log('marker.species', marker.species)
		if (!marker.species) return counts;

		// console.log('marker.species', marker.species)
		const speciesId = marker.species.id ?? marker.species;
		if (!counts[speciesId]) {
			counts[speciesId] = {
				species: marker.species,
				count: 0,
			};
		}
		counts[speciesId].count++;
		return counts;
	}, {});

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
		// marginGeometry,
		// marginArea
	};
}
