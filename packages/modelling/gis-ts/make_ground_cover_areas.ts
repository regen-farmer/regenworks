import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import { buffer, intersect, mask, helpers as turf, area as turfArea } from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, GeoJsonProperties as Properties } from "geojson";

export function makeGroundCoverAreas(
  stripPolygons: Feature<Polygon | MultiPolygon, Properties>[],
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
  }[],
): {
  groundCoverAreas: Feature<Polygon, Properties>[];
  groundCoverAreasM2: Record<string, number>;
} {
  const groundCoverAreas: Feature<Polygon, Properties>[] = [];
  const groundCoverAreasM2 = {};

  if (!(rows.length > 0)) {
    console.log("No rows in system design");
    return { groundCoverAreas: [], groundCoverAreasM2: {} };
  }

  for (let i = 0; i < stripPolygons.length; i++) {
    const intersectionAreas = stripPolygons[i];
    const currentRowIdx = i % rows.length;

    const groundCoverRaw = rows[currentRowIdx].groundcover?._id ?? rows[currentRowIdx].groundcover;
    // Ensure the ID is converted to a string for consistent key usage
    const groundCoverId = groundCoverRaw ? String(groundCoverRaw) : undefined;

    if (groundCoverId && !groundCoverAreasM2[groundCoverId]) {
      groundCoverAreasM2[groundCoverId] = 0;
    }

    if (groundCoverId && intersectionAreas) {
      if (intersectionAreas.geometry.type === "MultiPolygon") {
        for (const coords of intersectionAreas.geometry.coordinates) {
          const poly = turf.polygon(coords, {
            name: `alleypoly${groundCoverAreas.length}`,
            speciesId: groundCoverId,
          });
          groundCoverAreasM2[groundCoverId] += turfArea(poly);
          groundCoverAreas.push(poly);
        }
      } else if (intersectionAreas.geometry.type === "Polygon") {
        const poly = turf.polygon(intersectionAreas.geometry.coordinates, {
          name: `alleypoly${groundCoverAreas.length}`,
          speciesId: groundCoverId,
        });
        groundCoverAreasM2[groundCoverId] += turfArea(poly);
        groundCoverAreas.push(poly);
      }
    }
  }

  console.log("groundCoverAreas.length", groundCoverAreas.length);
  console.log("groundCoverAreasM2", groundCoverAreasM2);
  return { groundCoverAreas, groundCoverAreasM2 };
}
