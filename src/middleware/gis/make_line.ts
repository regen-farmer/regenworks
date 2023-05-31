import {
  bbox,
  bboxPolygon,
  helpers as turf,
  length as turfLength,
  // midpoint,
  // rhumbBearing,
  // transformScale,
  // transformRotate,
  // transformTranslate,
  LineString,
  // rhumbBearing,
  transformRotate,
  // midpoint,
  // transformTranslate,
  // transformScale,
  centroid,
} from '@turf/turf';
import { ISystemDesignSchema } from '../../models/systemdesign';

export function makeInitialLine(
  systemdesign: ISystemDesignSchema,
  offsetPolygon,
) {
  let lineIntersectingAreaInsideMargin: turf.Feature<
    LineString,
    turf.Properties
  >;
  let widthOfAreaInsideMargin: number;
  // const tempOffsetArray: any[] = [];

  // systemdesign.bearing = 0;

  // if (systemdesign.bearing === 0) {
  //   // -------- NORTH/SOURTH ROWS ---------
  //   const box = bboxPolygon(bbox(offsetPolygon));
  //   const lengthLine = turf.lineString(
  //     [box.geometry.coordinates[0][2], box.geometry.coordinates[0][3]],
  //     { name: 'line-0' },
  //   );
  //   widthOfAreaInsideMargin = turfLength(lengthLine, { units: 'meters' });
  //   lineIntersectingAreaInsideMargin = turf.lineString(
  //     [box.geometry.coordinates[0][3], box.geometry.coordinates[0][4]],
  //     { name: 'line-1' },
  //   );
  //   // -------- NORTH/SOURTH ROWS ---------
  // } else if (systemdesign.bearing == 90) {
  //   // -------- WEST/EAST ROWS ---------
  //   const box = bboxPolygon(bbox(offsetPolygon));
  //   const lengthLine = turf.lineString(
  //     [box.geometry.coordinates[0][1], box.geometry.coordinates[0][2]],
  //     { name: 'line-0' },
  //   );
  //   widthOfAreaInsideMargin = turfLength(lengthLine, { units: 'meters' });
  //   lineIntersectingAreaInsideMargin = turf.lineString(
  //     [box.geometry.coordinates[0][2], box.geometry.coordinates[0][3]],
  //     { name: 'line-1' },
  //   );
  // -------- WEST/EAST ROWS ---------
  // } else {
  // -------- ANGLED ROWS ---------
  // IF HEADLAND IS 0, JUST USE REGULAR POLYGON, NOT BUFFER
  // let lengthLineBearing: turf.Feature<LineString, any>;
  // if (systemdesign.bearingline) {
  //   const bearingline = JSON.parse(systemdesign.bearingline);
  //   lengthLineBearing = bearingline;
  // } else if (systemdesign.margin === 0) {
  //   lengthLineBearing = turf.lineString(
  //     [
  //       polygon.geometry.coordinates[0][systemdesign.bearing],
  //       polygon.geometry.coordinates[0][systemdesign.bearing + 1],
  //     ],
  //     { name: 'bearingline' },
  //   );
  // } else {
  //   lengthLineBearing = turf.lineString(
  //     [
  //       offsetPolygon.geometry.coordinates[0][systemdesign.bearing],
  //       offsetPolygon.geometry.coordinates[0][systemdesign.bearing + 1],
  //     ],
  //     { name: 'bearingline' },
  //   );
  // }

  // const lengthLineBearing = turf.lineString(
  //   [
  //     offsetPolygon.geometry.coordinates[0][systemdesign.bearing],
  //     offsetPolygon.geometry.coordinates[0][systemdesign.bearing + 1],
  //   ],
  //   { name: 'bearingline' }
  // )
  // SCALE LINE
  /*
          line = transformScale(lengthLineBearing, 6);
  */
  // ALTERNATIVE BOUNDING BOX LENGTH LINE
  // const lineBearing = rhumbBearing(
  //   lengthLineBearing.geometry.coordinates[0],
  //   lengthLineBearing.geometry.coordinates[1]
  // )
  /*
      console.log(lineBearing);
  */const pivotPoint = centroid(offsetPolygon);

  const rotatedPolygon = transformRotate(
    offsetPolygon,
    -systemdesign.bearing,
    { pivot: pivotPoint },
  );

  const box = bboxPolygon(bbox(rotatedPolygon));
  const lengthLine = turf.lineString(
    [box.geometry.coordinates[0][2], box.geometry.coordinates[0][3]],
    { name: 'line-0' },
  );
  widthOfAreaInsideMargin = turfLength(lengthLine, { units: 'meters' });
  const rotatedLineIntersectingAreaInsideMargin = turf.lineString(
    [box.geometry.coordinates[0][3], box.geometry.coordinates[0][4]],
    { name: 'line-1' },
  );

  // Rotate line back using same pivot

  lineIntersectingAreaInsideMargin = transformRotate(
    rotatedLineIntersectingAreaInsideMargin,
    systemdesign.bearing,
    { pivot: pivotPoint },
  );

  //   const bboxOffsetPolygon = bboxPolygon(bbox(rotatedPolygon));
  //   /*    console.log(bboxOffsetPolygon.geometry.coordinates[0][1]);
  //     console.log(bboxOffsetPolygon.geometry.coordinates[0][2]); */
  //   const lengthLineOffsetRotatedPolygon = turf.lineString(
  //     [
  //       bboxOffsetPolygon.geometry.coordinates[0][1],
  //       bboxOffsetPolygon.geometry.coordinates[0][2],
  //     ],
  //     { name: 'line-10' },
  //   );

  //   /*
  //     console.log(`${turfLength(lengthLineOffsetRotatedPolygon, { units: 'meters' })} meter length`);
  // */
  //   // CREATE NEW POLYGON
  //   const alignPolygon = transformRotate(
  //     offsetPolygon,
  //     180 - systemdesign.bearing,
  //   );
  //   // CHECK POINTS ON ROTATED POLYGON
  //   // const offsetPolygonWesternPoint = {};
  //   let westernPointCount = 0;
  //   let westernPointIndex = 0;
  //   for (let i = 0; i < alignPolygon.geometry.coordinates[0].length - 1; i++) {
  //     console.log(`Coordinate: ${alignPolygon.geometry.coordinates[0][i]}`);
  //     if (westernPointCount > alignPolygon.geometry.coordinates[0][i][0]) {
  //       westernPointIndex = i;
  //       westernPointCount = alignPolygon.geometry.coordinates[0][i][0];
  //     }
  //   }
  //   /*    console.log(`Index: ${westernPointIndex}`);
  //     console.log(`Lengthline: ${lengthLineBearing}`);
  //     console.log(`Westernpoint: ${offsetPolygon.geometry.coordinates[0][westernPointIndex]}`); */
  //   // MOVE SPECS
  //   const lineMidpoint = midpoint(
  //     lengthLineBearing.geometry.coordinates[0],
  //     lengthLineBearing.geometry.coordinates[1],
  //   );
  //   const moveLengthLine = turf.lineString(
  //     [
  //       lineMidpoint.geometry.coordinates,
  //       offsetPolygon.geometry.coordinates[0][westernPointIndex],
  //     ],
  //     { name: 'moveline' },
  //   );
  //   const moveBearing = rhumbBearing(
  //     lineMidpoint,
  //     offsetPolygon.geometry.coordinates[0][westernPointIndex],
  //   );
  //   const moveDistance = turfLength(moveLengthLine, { units: 'meters' });
  //   // SEE OFFSET
  //   const moveLine = transformTranslate(
  //     lengthLineBearing,
  //     moveDistance,
  //     moveBearing,
  //     { units: 'meters' },
  //   );
  //   lineIntersectingAreaInsideMargin = transformScale(moveLine, 6);

  //   tempOffsetArray.push(alignPolygon);
  //   tempOffsetArray.push(lineIntersectingAreaInsideMargin);
  //   tempOffsetArray.push(moveLine);
  //   /*
  //     console.log(`movedLine: ${moveLine.geometry.coordinates}`);
  // */
  //   tempOffsetArray.push(lengthLineOffsetRotatedPolygon);
  //   /* // CREATE ANGLED LENGTH LINE
  //         var rotatedLine = transformRotate(line, 90);
  //         var splitLines = lineSplit(rotatedLine, line);
  //         // SET LENGTH LINE
  //         var lengthLineSplit = lineSplit(splitLines.features[0], offsetPolygon);
  //         lengthLine = lengthLineSplit.features[1];
  //         console.log(splitLines.features[0]);
  //         console.log(Math.floor((turfLength(lengthLine, {units: "meters"})))); */

  //   widthOfAreaInsideMargin = turfLength(lengthLineOffsetRotatedPolygon, {
  //     units: 'meters',
  //   });
  // -------- ANGLED ROWS ---------
  // }

  return {
    lineIntersectingAreaInsideMargin,
    widthOfAreaInsideMargin,
  };
}
