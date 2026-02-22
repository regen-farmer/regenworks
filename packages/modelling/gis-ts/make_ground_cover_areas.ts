import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import {
	buffer,
	intersect,
	mask,
	helpers as turf,
	area as turfArea,
} from "@turf/turf";

export function makeGroundCoverAreas(
	stripPolygons: turf.Feature<turf.Polygon | turf.MultiPolygon, turf.Properties>[],
	rows: {
		sequence: {
			species: ISpeciesSchema;
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
		groundcover?: ISpeciesSchema;
		width: number;
	}[]
): {
	groundCoverAreas: turf.Feature<turf.Polygon | turf.MultiPolygon, turf.Properties>[];
	groundCoverAreasM2: any;
} {
	const groundCoverAreas: turf.Feature<turf.Polygon | turf.MultiPolygon, turf.Properties>[] = [];
	const groundCoverAreasM2 = {};

	if (!(rows.length > 0)) {
		console.log("No rows in system design");
		return { groundCoverAreas: [], groundCoverAreasM2: {} };
	}

	for (let i = 0; i < stripPolygons.length; i++) {
		const intersectionAreas = stripPolygons[i];
		const currentRowIdx = i % rows.length;

		const groundCoverRaw =
			rows[currentRowIdx].groundcover?._id ?? rows[currentRowIdx].groundcover;
		// Ensure the ID is converted to a string for consistent key usage
		const groundCoverId = groundCoverRaw?.toString?.() ?? groundCoverRaw;
		if (groundCoverId && !groundCoverAreasM2[groundCoverId]) {
			groundCoverAreasM2[groundCoverId] = 0;
		}

		if (groundCoverId && intersectionAreas) {
			// Clone and update the polygon properties
			const area = JSON.parse(JSON.stringify(intersectionAreas));
			area.properties = area.properties || {};
			area.properties.name = `alleypoly${groundCoverAreas.length}`;
			area.properties.speciesId = groundCoverId;
			
			// We already calculated total strip areas in makeAllStripPolygons, but this
			// aggregates it per-species. We can calculate it directly here via turfArea
			groundCoverAreasM2[groundCoverId] += turfArea(area);
			groundCoverAreas.push(area);
		}
	}

	console.log("groundCoverAreas.length", groundCoverAreas.length);
	console.log("groundCoverAreasM2", groundCoverAreasM2);
	return { groundCoverAreas, groundCoverAreasM2 };
}
