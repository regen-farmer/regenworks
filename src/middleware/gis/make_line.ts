import {
  bbox,
  bboxPolygon,
  helpers as turf,
  length as turfLength,
  LineString,
  transformRotate,
  centroid,
  bearing as turfBearing,
} from '@turf/turf';

export function makeInitialLine(
  bearing: number,
  polygon,
) {
  const pivotPoint = centroid(polygon);

  const rotatedPolygon = transformRotate(
    polygon,
    -bearing,
    { pivot: pivotPoint },
  );

  const box = bboxPolygon(bbox(rotatedPolygon));
  const lengthLine = turf.lineString(
    [box.geometry.coordinates[0][2], box.geometry.coordinates[0][3]],
    { name: 'line-0' },
  );
  const widthOfPolygon: number = turfLength(lengthLine, { units: 'meters' });
  const rotatedLineIntersectingPolygon = turf.lineString(
    [box.geometry.coordinates[0][3], box.geometry.coordinates[0][4]],
    { name: 'line-1' },
  );

  // Rotate line back using same pivot

  let lineIntersectingPolygon: turf.Feature<
    LineString,
    turf.Properties
  > = transformRotate(
    rotatedLineIntersectingPolygon,
    bearing,
    { pivot: pivotPoint },
  );



  let lineBearing = turfBearing(lineIntersectingPolygon.geometry.coordinates[0], lineIntersectingPolygon.geometry.coordinates[1])

  if (lineBearing < 0) {
    lineBearing+=360;
  }
  
  // console.log(`### Line bearing ${lineBearing}, should be ${bearing}`)

  if (Math.abs(lineBearing - bearing) > 1) {
    lineIntersectingPolygon = transformRotate(lineIntersectingPolygon, 180);
  }

  lineBearing = turfBearing(lineIntersectingPolygon.geometry.coordinates[0], lineIntersectingPolygon.geometry.coordinates[1])
  if (lineBearing < 0) {
    lineBearing+=360;
  }
  // console.log(`### Line bearing ${lineBearing}, should be ${bearing}`)

  return {
    lineIntersectingPolygon,
    widthOfPolygon,
  };
}
