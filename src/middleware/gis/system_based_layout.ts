import {
	bbox,
	bboxPolygon,
	helpers as turf,
	length as turfLength,
	buffer,
	transformRotate,
	lineSplit,
	along,
	circle,
} from "@turf/turf";
import { IProjectSchema } from "../../models/project.js";
import { ISpeciesSchema } from "../../models/species.js";
import { makeInitialLine } from "./make_line.js";
import { makeTreeRowLines } from "./make_tree_row_lines.js";
import { makeGroundCoverAreas } from "./make_ground_cover_areas.js";
import { applyHeadland } from "./headland.js";
import SystemDesign from "../../models/systemdesign.js";

export function systemBasedLayout(project: IProjectSchema) {
	console.log(JSON.stringify(project));

	let systemdesign = project.systemdesign;
	if (!systemdesign) {
		systemdesign = new SystemDesign({
			margin: 0,
			headland: 0,
			bearing: 0,
			rows: [],
		});
	}

	const systemRows = systemdesign.rows;

	// console.log("HERE1", project.layer)
	const polygon = JSON.parse(project.layer.geometry);

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
	const groundCoverAreas = makeGroundCoverAreas(
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

	treeRowLines.forEach((treeRowLine) => {
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
	});

	const speciesCounts = treeMarkerArray.reduce((counts, marker) => {
		if (!marker.species) return counts;

		const speciesId = marker.species.id;
		if (!counts[speciesId]) {
			counts[speciesId] = {
				species: marker.species,
				count: 0,
			};
		}
		counts[speciesId].count++;
		return counts;
	}, {});

	const speciesCountArray = Object.values(speciesCounts);

	// // Edge System
	// const { edgeTreeCanopyArray, edgeRowArray } = createEdge(project, calibrateDistance, polygon);
	// rowArray.concat(edgeRowArray);
	// treeCanopyArray.concat(edgeTreeCanopyArray);

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
	};
}
