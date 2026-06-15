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

const mercator = proj4("EPSG:4326", "EPSG:3857");
const COORDINATE_TOLERANCE = 1e-12;

type Coordinate = [number, number];

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
  const polygonSides: turf.Feature<turf.LineString>[] = polygonCoords.map((coord, i) =>
    lineString([coord, polygonCoords[(i + 1) % polygonCoords.length]]),
  );
  return polygonSides;
}

function sameCoordinate(a: number[], b: number[]) {
  return (
    Math.abs(a[0] - b[0]) <= COORDINATE_TOLERANCE &&
    Math.abs(a[1] - b[1]) <= COORDINATE_TOLERANCE
  );
}

function sharedEndpoint(line1: turf.Feature<turf.LineString>, line2: turf.Feature<turf.LineString>) {
  for (const firstCoord of line1.geometry.coordinates) {
    for (const secondCoord of line2.geometry.coordinates) {
      if (sameCoordinate(firstCoord, secondCoord)) {
        return firstCoord as Coordinate;
      }
    }
  }

  return undefined;
}

function mercatorLineIntersect(
  line1: turf.Feature<turf.LineString>,
  line2: turf.Feature<turf.LineString>,
) {
  const line1Mercator = line1.geometry.coordinates.map((coord) =>
    mercator.forward(coord),
  ) as [Coordinate, Coordinate];
  const line2Mercator = line2.geometry.coordinates.map((coord) =>
    mercator.forward(coord),
  ) as [Coordinate, Coordinate];

  const [[x1, y1], [x2, y2]] = line1Mercator;
  const [[x3, y3], [x4, y4]] = line2Mercator;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(denominator) <= COORDINATE_TOLERANCE) {
    const endpoint = sharedEndpoint(line1, line2);
    if (endpoint) {
      return point(endpoint);
    }

    throw new Error("Cannot compute headland intersection for parallel line segments");
  }

  const line1Determinant = x1 * y2 - y1 * x2;
  const line2Determinant = x3 * y4 - y3 * x4;
  const x =
    (line1Determinant * (x3 - x4) - (x1 - x2) * line2Determinant) / denominator;
  const y =
    (line1Determinant * (y3 - y4) - (y1 - y2) * line2Determinant) / denominator;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Cannot compute finite headland intersection");
  }

  const intersection = mercator.inverse([x, y]) as Coordinate;
  return point(intersection);
}

export function applyHeadland(
  marginPolygon: turf.Feature<turf.Polygon, turf.Properties>,
  headland: number,
  fieldBearing: number,
  _bearingThreshold = 5,
) {
  const marginPolygonSides = getAllSides(marginPolygon);

  const sidesDifferentFromBearing: turf.Feature<turf.LineString>[] = marginPolygonSides.filter(
    (side) => {
      let sideBearing: number = turfBearing(
        side.geometry.coordinates[0],
        side.geometry.coordinates[1],
      );
      sideBearing = clampNumberToBetween0And180Degrees(sideBearing);
      fieldBearing = clampNumberToBetween0And180Degrees(fieldBearing);
      return Math.abs(sideBearing - fieldBearing) > _bearingThreshold;
    },
  );

  let headlandBuffers: turf.Feature<turf.Polygon>[] = [];

  headlandBuffers = sidesDifferentFromBearing.map((side) => {
    return buffer(side, Math.max(headland, 0.001), {
      units: "meters",
      steps: 20,
    });
  });
  // }

  let headlandPolygon = marginPolygon;
  let diff: turf.Feature<turf.Polygon | turf.MultiPolygon> | null = null;
  headlandBuffers.forEach((headlandBuffer) => {
    diff = difference({
      type: "FeatureCollection",
      features: [headlandPolygon, headlandBuffer],
    });
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
      headlandSide.geometry.coordinates[1],
    );
    sideBearing = clampNumberToBetween0And180Degrees(sideBearing);
    fieldBearing = clampNumberToBetween0And180Degrees(fieldBearing);
    const sideLength = length(headlandSide, { units: "meters" });

    if (Math.abs(sideBearing - fieldBearing) <= _bearingThreshold && sideLength > 2) {
      idxOfSidesParallelToBearing.push(idx);
    }
  });

  let sidesCloseToBearing = idxOfSidesParallelToBearing.map((idx) => headlandPolygonSides[idx]);

  sidesCloseToBearing = [];

  let intersectionPoints: any[] = [];

  // Find cords of headland polygon
  let headlandPolygonCoords = headlandPolygon.geometry.coordinates[0];

  for (const idx of idxOfSidesParallelToBearing) {
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

    let intersectionBefore = mercatorLineIntersect(beforeSide, headlandPolygonSides[idx]);

    let intersectionAfter = mercatorLineIntersect(afterSide, headlandPolygonSides[idx]);

    intersectionBefore = turf.featureCollection(intersectionBefore);
    intersectionBefore.features = [intersectionBefore.features];
    intersectionAfter = turf.featureCollection(intersectionAfter);
    intersectionAfter.features = [intersectionAfter.features];

    if (beforeIdx < afterIdx) {
      headlandPolygonCoords = [
        ...headlandPolygonCoords.slice(0, beforeIdx + 1),
        intersectionBefore.features[0].geometry.coordinates,

        // Add additional points similar to the one above to keep length of headland polygon array
        ...Array(headlandPolygonCoords.slice(beforeIdx + 1, afterIdx + 1).length - 2).fill(
          intersectionBefore.features[0].geometry.coordinates,
        ),

        intersectionAfter.features[0].geometry.coordinates,
        ...headlandPolygonCoords.slice(afterIdx + 1),
      ];
    }

    if (afterIdx < beforeIdx) {

      headlandPolygonCoords = [
        // Add additional points similar to the one below to keep length of headland polygon array

        ...Array(headlandPolygonCoords.slice(0, afterIdx + 1).length).fill(
          intersectionAfter.features[0].geometry.coordinates,
        ),

        ...headlandPolygonCoords.slice(afterIdx + 1, beforeIdx + 1),

        ...Array(headlandPolygonCoords.slice(beforeIdx).length - 1).fill(
          intersectionBefore.features[0].geometry.coordinates,
        ),
        intersectionAfter.features[0].geometry.coordinates,
      ];
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
  }

  headlandPolygonCoords = headlandPolygonCoords.filter((coord: number[], i) => {
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
  });

  headlandPolygon = turf.polygon([headlandPolygonCoords], { name: "poly1" });

  return {
    headlandSides: headlandBuffers,
    headlandPolygon,
    sidesCloseToBearing,
    intersectionPoints,
  };
}
