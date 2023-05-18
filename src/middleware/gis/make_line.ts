import {
  bbox,
  bboxPolygon,
  helpers as turf,
  length as turfLength,
  midpoint,
  rhumbBearing,
  transformScale,
  transformRotate,
  transformTranslate,
  LineString,
} from '@turf/turf';
import { ISystemDesignSchema } from '../../models/systemdesign';

export function makeInitialLine(systemdesign: ISystemDesignSchema, polygon, offsetPolygon) {
  let line;
  let rowCount = 0;
  let rowRest = 0;
  const tempOffsetArray: any[] = [];
  const systemWidth = systemdesign.rows.reduce((a, b) => a + (b.width || 0), 0);

  if (systemdesign.alignment === 'bearing') {
    // -------- ANGLED ROWS ---------
    // IF HEADLAND IS 0, JUST USE REGULAR POLYGON, NOT BUFFER
    let lengthLineBearing: turf.Feature<LineString, any>;
    if (systemdesign.bearingline) {
      const bearingline = JSON.parse(systemdesign.bearingline);
      lengthLineBearing = bearingline;
    } else if (systemdesign.margin === 0) {
      lengthLineBearing = turf.lineString([polygon.geometry.coordinates[0][systemdesign.bearing], polygon.geometry.coordinates[0][systemdesign.bearing + 1]], { name: 'bearingline' });
    } else {
      lengthLineBearing = turf.lineString([offsetPolygon.geometry.coordinates[0][systemdesign.bearing], offsetPolygon.geometry.coordinates[0][systemdesign.bearing + 1]], { name: 'bearingline' });
    }
    // SCALE LINE
    /*
        line = transformScale(lengthLineBearing, 6);
*/
    // ALTERNATIVE BOUNDING BOX LENGTH LINE
    const lineBearing = rhumbBearing(lengthLineBearing.geometry.coordinates[0], lengthLineBearing.geometry.coordinates[1]);
    /*
    console.log(lineBearing);
*/
    const rotatedPolygon = transformRotate(offsetPolygon, 90 - lineBearing);
    const bboxOffsetPolygon = bboxPolygon(bbox(rotatedPolygon));
    /*    console.log(bboxOffsetPolygon.geometry.coordinates[0][1]);
    console.log(bboxOffsetPolygon.geometry.coordinates[0][2]); */
    const lengthLineOffsetRotatedPolygon = turf.lineString([bboxOffsetPolygon.geometry.coordinates[0][1], bboxOffsetPolygon.geometry.coordinates[0][2]], { name: 'line-10' });
    /*
    console.log(`${turfLength(lengthLineOffsetRotatedPolygon, { units: 'meters' })} meter length`);
*/
    // CREATE NEW POLYGON
    const alignPolygon = transformRotate(offsetPolygon, 180 - lineBearing);
    // CHECK POINTS ON ROTATED POLYGON
    // const offsetPolygonWesternPoint = {};
    let westernPointCount = 0;
    let westernPointIndex = 0;
    for (let i = 0; i < alignPolygon.geometry.coordinates[0].length - 1; i++) {
      console.log(`Coordinate: ${alignPolygon.geometry.coordinates[0][i]}`);
      if (westernPointCount > alignPolygon.geometry.coordinates[0][i][0]) {
        westernPointIndex = i;
        westernPointCount = alignPolygon.geometry.coordinates[0][i][0];
      }
    }
    /*    console.log(`Index: ${westernPointIndex}`);
    console.log(`Lengthline: ${lengthLineBearing}`);
    console.log(`Westernpoint: ${offsetPolygon.geometry.coordinates[0][westernPointIndex]}`); */
    // MOVE SPECS
    const lineMidpoint = midpoint(lengthLineBearing.geometry.coordinates[0], lengthLineBearing.geometry.coordinates[1]);
    const moveLengthLine = turf.lineString([lineMidpoint.geometry.coordinates, offsetPolygon.geometry.coordinates[0][westernPointIndex]], { name: 'moveline' });
    const moveBearing = rhumbBearing(lineMidpoint, offsetPolygon.geometry.coordinates[0][westernPointIndex]);
    const moveDistance = turfLength(moveLengthLine, { units: 'meters' });
    // SEE OFFSET
    const moveLine = transformTranslate(lengthLineBearing, moveDistance, moveBearing, { units: 'meters' });
    line = transformScale(moveLine, 6);
    tempOffsetArray.push(alignPolygon);
    tempOffsetArray.push(line);
    tempOffsetArray.push(moveLine);
    /*
    console.log(`movedLine: ${moveLine.geometry.coordinates}`);
*/
    tempOffsetArray.push(lengthLineOffsetRotatedPolygon);
    /* // CREATE ANGLED LENGTH LINE
        var rotatedLine = transformRotate(line, 90);
        var splitLines = lineSplit(rotatedLine, line);
        // SET LENGTH LINE
        var lengthLineSplit = lineSplit(splitLines.features[0], offsetPolygon);
        lengthLine = lengthLineSplit.features[1];
        console.log(splitLines.features[0]);
        console.log(Math.floor((turfLength(lengthLine, {units: "meters"})))); */
    rowCount = Math.floor((turfLength(lengthLineOffsetRotatedPolygon, { units: 'meters' })) / systemWidth);
    rowRest = (((turfLength(lengthLineOffsetRotatedPolygon, { units: 'meters' })) / systemWidth) - rowCount) * systemWidth;
    /*    console.log(rowCount);
    console.log(`rest ${rowRest}`); */
    // -------- ANGLED ROWS ---------
  } else if (systemdesign.alignment === 'north') {
    // -------- NORTH/SOURTH ROWS ---------
    // CREATE BOUNDING BOX (IF ANGLE IS 0)
    const box = bboxPolygon(bbox(offsetPolygon));
    // TAKE TOP SIDE OF BOUNDING BOX

    const lengthLine = turf.lineString([box.geometry.coordinates[0][2], box.geometry.coordinates[0][3]], { name: 'line-0' });
    // ESTIMATE AMOUNT OF ROWS
    /*
    console.log((turfLength(lengthLine, { units: 'meters' })));
*/
    rowCount = Math.floor((turfLength(lengthLine, { units: 'meters' })) / systemWidth);
    rowRest = (((turfLength(lengthLine, { units: 'meters' })) / systemWidth) - rowCount) * systemWidth;
    /*    console.log(`rest ${rowRest}`);
    console.log(rowCount); */
    // CREATE ROW LINE
    line = turf.lineString([box.geometry.coordinates[0][3], box.geometry.coordinates[0][4]], { name: 'line-1' });
    // -------- NORTH/SOURTH ROWS ---------
  } else {
    // -------- WEST/EAST ROWS ---------
    // CREATE BOUNDING BOX
    const box = bboxPolygon(bbox(offsetPolygon));
    // TAKE TOP SIDE OF BOUNDING BOX
    const lengthLine = turf.lineString([box.geometry.coordinates[0][1], box.geometry.coordinates[0][2]], { name: 'line-0' });
    // ESTIMATE AMOUNT OF ROWS
    /*
    console.log((turfLength(lengthLine, { units: 'meters' })));
*/
    rowCount = Math.floor((turfLength(lengthLine, { units: 'meters' })) / systemWidth);
    rowRest = (((turfLength(lengthLine, { units: 'meters' })) / systemWidth) - rowCount) * systemWidth;
    /*    console.log(`rest ${rowRest}`);
    console.log(rowCount); */
    // CREATE ROW LINE
    line = turf.lineString([box.geometry.coordinates[0][2], box.geometry.coordinates[0][3]], { name: 'line-1' });
    // -------- WEST/EAST ROWS ---------
  }

  return {
    line, rowCount, rowRest, tempOffsetArray,
  };
}
