import {
  helpers as turf,
  lineIntersect,
  buffer,
  along,
  length,
  bearing as turfBearing,
  transformRotate,
} from "@turf/turf";

import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";

function calculateHeadlandOffset(
  offset?:
    | {
        before?: number | undefined;
        after?: number | undefined;
      }
    | undefined,
): { before: number; after: number } {
  let before = 0;
  let after = 0;

  if (offset) {
    if (offset.before) {
      before += offset.before;
    }
    if (offset.after) {
      after += offset.after;
    }
  }

  return { before, after };
}

export function makeTreeRowLines(
  offsetPolygon: turf.Feature<turf.Polygon, turf.Properties>,
  lineIntersectingAreaInsideMargin: turf.Feature<turf.LineString, turf.Properties>,
  widthOfAreaInsideMargin: number,
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
  line: turf.Feature<turf.LineString, turf.Properties>;
  systemDesignRowIndex: number;
}[] {
  let accumulatingWidth = 0;
  const treeRowArray: {
    line: turf.Feature<turf.LineString, turf.Properties>;
    systemDesignRowIndex: number;
  }[] = [];
  let currentRowIdx = 0;

  if (!(rows.length > 0)) {
    return [];
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Add half row width
    accumulatingWidth += rows[currentRowIdx].width === 0 ? 0 : rows[currentRowIdx].width / 2;

    // Complete if there isn't room for more lines
    if (accumulatingWidth > widthOfAreaInsideMargin) {
      break;
    }

    // Find intersection points for new line
    const bufferLine = buffer(lineIntersectingAreaInsideMargin, accumulatingWidth, {
      units: "meters",
    });
    const bufferLineIntersectionPoints = lineIntersect(bufferLine, offsetPolygon);

    // Order intersection points
    let sortedIntersectionPoints: turf.Feature<turf.Point, turf.Properties>[] = [];

    const uniqueX = new Set(bufferLineIntersectionPoints.features.map((f: turf.Feature) => (f.geometry as turf.Point).coordinates[0])).size;
    const uniqueY = new Set(bufferLineIntersectionPoints.features.map((f: turf.Feature) => (f.geometry as turf.Point).coordinates[1])).size;
    const totalFeats = bufferLineIntersectionPoints.features.length;

    if (uniqueX === totalFeats) {
      sortedIntersectionPoints = [...bufferLineIntersectionPoints.features].sort(
        (a, b) => (a.geometry as turf.Point).coordinates[0] - (b.geometry as turf.Point).coordinates[0],
      );
    } else if (uniqueY === totalFeats) {
      sortedIntersectionPoints = [...bufferLineIntersectionPoints.features].sort(
        (a, b) => (a.geometry as turf.Point).coordinates[1] - (b.geometry as turf.Point).coordinates[1],
      );
    } else {
      console.error(
        "Duplicates in both coordinates! Can't sort row intersections with area withing margin",
      );
    }

    // Handle each segment if there are multiple tree rows
    for (let k = 0; k < sortedIntersectionPoints.length / 2; k++) {
      let treeRow = turf.lineString(
        [
          sortedIntersectionPoints[k * 2].geometry.coordinates,
          sortedIntersectionPoints[k * 2 + 1].geometry.coordinates,
        ],
        { name: `line-${treeRowArray.length}` },
      );

      const rowBearing = turfBearing(
        treeRow.geometry.coordinates[0],
        treeRow.geometry.coordinates[1],
      );
      const lineIntersectingAreaInsideMarginBearing = turfBearing(
        lineIntersectingAreaInsideMargin.geometry.coordinates[0],
        lineIntersectingAreaInsideMargin.geometry.coordinates[1],
      );

      if (Math.abs(rowBearing - lineIntersectingAreaInsideMarginBearing) > 1) {
        treeRow = transformRotate(treeRow, 180);
      }

      const { before, after } = calculateHeadlandOffset(rows[currentRowIdx].offset);

      if (before + after >= length(treeRow, { units: "meters" })) {
        // eslint-disable-next-line no-continue
        continue;
      }

      treeRow = turf.lineString(
        [
          along(treeRow, before, { units: "meters" }).geometry.coordinates,
          along(treeRow, length(treeRow, { units: "meters" }) - after, {
            units: "meters",
          }).geometry.coordinates,
        ],
        { name: `line-${treeRowArray.length}` },
      );

      // Fix direction

      // let lineBearing = turfBearing(lineIntersectingPolygon.geometry.coordinates[0], lineIntersectingPolygon.geometry.coordinates[1])

      // if (lineBearing < 0) {
      //   lineBearing+=360;
      // }

      // console.log(`### Line bearing ${lineBearing}, should be ${bearing}`)

      // if (Math.abs(lineBearing - bearing) > 1) {
      //   lineIntersectingPolygon = transformRotate(lineIntersectingPolygon, 180);
      // }

      // lineBearing = turfBearing(lineIntersectingPolygon.geometry.coordinates[0], lineIntersectingPolygon.geometry.coordinates[1])
      // if (lineBearing < 0) {
      //   lineBearing+=360;
      // }
      // console.log(`### Line bearing ${lineBearing}, should be ${bearing}`)

      // Add offset before

      treeRowArray.push({ line: treeRow, systemDesignRowIndex: currentRowIdx });
    }

    // Add second half of the row width
    accumulatingWidth += rows[currentRowIdx].width === 0 ? 0 : rows[currentRowIdx].width / 2;

    // Prepare for next row. Cycle through rows in system design
    currentRowIdx++;
    if (currentRowIdx === rows.length) {
      currentRowIdx = 0;
    }
  }

  return treeRowArray;
}
