import {
  point,
  bearing as turfBearing,
  buffer,
  lineString,
  helpers as turf,
  difference,
  flatten,
  length,
  transformScale,
} from "@turf/turf";
import proj4 from "proj4";

import _ from "lodash";

function clampNumberToBetween0And180Degrees(bearing: number) {
  while (bearing < 0) {
    bearing += 180;
  }

  while (bearing >= 180) {
    bearing -= 180;
  }

  return bearing;
}

function getAllSides(polygon: turf.Feature<turf.Polygon, turf.Properties>) {
  const polygonCoords = polygon.geometry.coordinates[0];
  const polygonSides: turf.Feature<turf.LineString>[] = polygonCoords.map(
    (coord, i) =>
      lineString([coord, polygonCoords[(i + 1) % polygonCoords.length]])
  );
  return polygonSides;
}

export function applyHeadland(
  marginPolygon: turf.Feature<turf.Polygon, turf.Properties>,
  headland: number,
  fieldBearing: number,
  _bearingThreshold = 5
) {
  const marginPolygonSides = getAllSides(marginPolygon);

  const sidesDifferentFromBearing: turf.Feature<turf.LineString>[] =
    marginPolygonSides.filter((side) => {
      let sideBearing: number = turfBearing(
        side.geometry.coordinates[0],
        side.geometry.coordinates[1]
      );
      sideBearing = clampNumberToBetween0And180Degrees(sideBearing);
      fieldBearing = clampNumberToBetween0And180Degrees(fieldBearing);
      return Math.abs(sideBearing - fieldBearing) > _bearingThreshold;
    });

  let headlandBuffers: turf.Feature<turf.Polygon>[] = [];

  headlandBuffers = sidesDifferentFromBearing.map((side) => {
    return buffer(side, Math.max(headland, 0.0000001), {
      units: "meters",
      steps: 20,
    });
  });
  // }

  let headlandPolygon = marginPolygon;
  let diff: turf.Feature<turf.Polygon | turf.MultiPolygon> | null = null;
  headlandBuffers.forEach((headlandBuffer) => {
    diff = difference(headlandPolygon, headlandBuffer);
    if (diff) {
      headlandPolygon = flatten(diff).features[0];
    }
  });

  // Restore the cuts to the headlandPolygon
  const headlandPolygonSides = getAllSides(headlandPolygon);

  const idxOfSidesParallelToBearing: number[] = [];

  headlandPolygonSides.forEach((headlandSide, idx) => {
    let sideBearing = turfBearing(
      headlandSide.geometry.coordinates[0],
      headlandSide.geometry.coordinates[1]
    );
    sideBearing = clampNumberToBetween0And180Degrees(sideBearing);
    fieldBearing = clampNumberToBetween0And180Degrees(fieldBearing);
    const sideLength = length(headlandSide, { units: "meters" });

    if (
      Math.abs(sideBearing - fieldBearing) <= _bearingThreshold &&
      sideLength > 2
    ) {
      idxOfSidesParallelToBearing.push(idx);
    }
  });
  console.log("idxOfBearingSides", idxOfSidesParallelToBearing);

  let sidesCloseToBearing = idxOfSidesParallelToBearing.map(
    (idx) => headlandPolygonSides[idx]
  );

  sidesCloseToBearing = [];

  let intersectionPoints: any[] = [];

  // Find cords of headland polygon
  let headlandPolygonCoords = headlandPolygon.geometry.coordinates[0];

  idxOfSidesParallelToBearing.forEach((idx) => {
    console.log("IDX", idx);
    // Find the adjecent sides to parallel one that has length > 2 m

    let beforeIdx = idx;

    while (true) {
      beforeIdx--;

      if (beforeIdx < 0) {
        beforeIdx = headlandPolygonSides.length - 1;
      }

      if (beforeIdx === idx + 1) {
        console.error("beforeIdx === idx", beforeIdx, idx);
        break;
      }

      if (length(headlandPolygonSides[beforeIdx], { units: "meters" }) > 2) {
        break;
      }
    }

    let afterIdx = idx;

    while (true) {
      afterIdx++;

      // console.log('headlandPolygonSides.length', headlandPolygonSides.length)

      if (afterIdx > headlandPolygonSides.length - 1) {
        afterIdx = 0;
      }

      if (afterIdx === idx - 1) {
        console.error("afterIdx === idx", afterIdx, idx);
        break;
      }

      if (length(headlandPolygonSides[afterIdx], { units: "meters" }) > 2) {
        break;
      }
    }

    console.log("beforeIdx", beforeIdx);
    console.log("afterIdx", afterIdx);

    const beforeSide = headlandPolygonSides[beforeIdx];
    const afterSide = headlandPolygonSides[afterIdx];

    const extendedBeforeSide = transformScale(beforeSide, 50, {
      origin: "center",
    });
    const extendedAfterSide = transformScale(afterSide, 50, {
      origin: "center",
    });
    const extendedBearingSide = transformScale(headlandPolygonSides[idx], 50, {
      origin: "center",
    });

    sidesCloseToBearing = [
      ...sidesCloseToBearing,
      extendedBeforeSide,
      extendedAfterSide,
      extendedBearingSide,
    ];

    const mercator = proj4("EPSG:4326", "EPSG:3857");

    function mercatorLineIntersect(line1, line2) {
      // Convert the lines to Mercator coordinates
      const line1Mercator = line1.geometry.coordinates.map((coord) =>
        mercator.forward(coord)
      );
      const line2Mercator = line2.geometry.coordinates.map((coord) =>
        mercator.forward(coord)
      );

      // Define the lines in the form y = mx + b
      const m1 =
        (line1Mercator[1][1] - line1Mercator[0][1]) /
        (line1Mercator[1][0] - line1Mercator[0][0]);
      const b1 = line1Mercator[0][1] - m1 * line1Mercator[0][0];

      const m2 =
        (line2Mercator[1][1] - line2Mercator[0][1]) /
        (line2Mercator[1][0] - line2Mercator[0][0]);
      const b2 = line2Mercator[0][1] - m2 * line2Mercator[0][0];

      // Find the intersection point
      const x = (b2 - b1) / (m1 - m2);
      const y = m1 * x + b1;

      // Convert the intersection point back to geographic coordinates
      const intersection = mercator.inverse([x, y]);

      return point(intersection);
    }

    let intersectionBefore = mercatorLineIntersect(
      beforeSide,
      headlandPolygonSides[idx]
    );

    let intersectionAfter = mercatorLineIntersect(
      afterSide,
      headlandPolygonSides[idx]
    );

    intersectionBefore = turf.featureCollection(intersectionBefore);
    intersectionBefore.features = [intersectionBefore.features];
    intersectionAfter = turf.featureCollection(intersectionAfter);
    intersectionAfter.features = [intersectionAfter.features];

    if (beforeIdx < afterIdx) {
      console.log(
        "headlandPolygonCoords.length 1: ",
        headlandPolygonCoords.length
      );
      headlandPolygonCoords = [
        ..._.slice(headlandPolygonCoords, 0, beforeIdx + 1),
        intersectionBefore.features[0].geometry.coordinates,

        // Add additional points similar to the one above to keep length of headland polygon array
        ...Array(
          _.slice(headlandPolygonCoords, beforeIdx + 1, afterIdx + 1).length - 2
        ).fill(intersectionBefore.features[0].geometry.coordinates),

        intersectionAfter.features[0].geometry.coordinates,
        ..._.slice(headlandPolygonCoords, afterIdx + 1),
      ];
      console.log(
        "headlandPolygonCoords.length 1: ",
        headlandPolygonCoords.length
      );
    }

    if (afterIdx < beforeIdx) {
      console.log(
        "headlandPolygonCoords.length 2: ",
        headlandPolygonCoords.length
      );

      headlandPolygonCoords = [
        // Add additional points similar to the one below to keep length of headland polygon array

        ...Array(_.slice(headlandPolygonCoords, 0, afterIdx + 1).length).fill(
          intersectionAfter.features[0].geometry.coordinates
        ),

        ..._.slice(headlandPolygonCoords, afterIdx + 1, beforeIdx + 1),

        ...Array(_.slice(headlandPolygonCoords, beforeIdx).length - 1).fill(
          intersectionBefore.features[0].geometry.coordinates
        ),
        intersectionAfter.features[0].geometry.coordinates,
      ];

      console.log(
        "headlandPolygonCoords.length 2: ",
        headlandPolygonCoords.length
      );
    }

    // const polygonSides = polygonCoords.map((coord, i) =>
    //   lineString([coord, polygonCoords[(i + 1) % polygonCoords.length]])
    // );

    // console.log("intersectionBefore", intersectionBefore);
    // console.log("intersectionAfter", intersectionAfter);

    intersectionPoints = [
      ...intersectionPoints,
      ...intersectionBefore.features,
      ...intersectionAfter.features,
    ];

    // if (intersectionBefore) intersectionPoints.push(intersectionBefore);
    // if (intersectionAfter) intersectionPoints.push(intersectionAfter);
  });

  headlandPolygonCoords = _.remove(
    headlandPolygonCoords,
    (coord: number[], i) => {
      // remove duplicate points, but keep first and last point the same
      if (i !== 0 && i !== headlandPolygonCoords.length - 1) {
        if (
          coord[0] === headlandPolygonCoords[i - 1][0] &&
          coord[1] === headlandPolygonCoords[i - 1][1]
        ) {
          // console.log(coord[0], headlandPolygonCoords[i - 1][0], i);
          return false;
        }
      }

      return true;
    }
  );

  console.log(
    "headlandPolygonCoordslength Total",
    headlandPolygonCoords.length
  );

  headlandPolygon = turf.polygon([headlandPolygonCoords], { name: "poly1" });

  return {
    headlandSides: headlandBuffers,
    headlandPolygon,
    sidesCloseToBearing,
    intersectionPoints,
  };
}
