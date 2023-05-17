import {
  bbox,
  bboxPolygon,
  helpers as turf,
  lineIntersect,
  length as turfLength,
  buffer,
  midpoint,
  rhumbBearing,
  transformScale,
  transformRotate,
  transformTranslate,
  lineSplit,
  along,
  circle,
  LineString,
} from '@turf/turf';
import _ from 'lodash';
import { IProjectSchema } from '../../models/project';
import { ISpeciesSchema } from '../../models/species';
import { createEdge } from './edge_system';
import { absolutePosition } from './get_absolute_position';

// SYSTEM BASED LAYOUT
export function systemBasedLayout(project: IProjectSchema) {
  // Convert System Design to old syntax System['model']

  const systemRows = _.cloneDeep(project.systemdesign.rows);

  // SET TEMP VARIABLES
  const polygon = JSON.parse(project.layer.geometry);
  // CALIBRATE OFFSET
  const boxCalibrate = bboxPolygon(bbox(polygon));
  // TAKE TOP SIDE OF BOUNDING BOX
  const lineCalibrate = turf.lineString([boxCalibrate.geometry.coordinates[0][2], boxCalibrate.geometry.coordinates[0][3]], { name: 'line-35' });
  const lineOffsetCalibrate = buffer(lineCalibrate, 10, { units: 'meters' });
  const rotatedCalibrateLine = transformRotate(lineCalibrate, 90);
  const splitCalibrateLine = lineSplit(rotatedCalibrateLine, lineCalibrate);
  const distanceCalibrateLine = lineSplit(splitCalibrateLine.features[1], lineOffsetCalibrate);
  const calibrateDistance = 10 / (turfLength(distanceCalibrateLine.features[0], { units: 'meters' }));
  console.log(`Distance check ${calibrateDistance}`);
  // CREATE HEADLAND + PERIMETER SYSTEM WIDTH

  const offsetPolygon = buffer(polygon, -project.systemdesign.margin * calibrateDistance, { units: 'meters' });

  // SAVE DATASET - ONLY REASON FOR THIS IS TO USE IT IN VIEW?!
  const layout_sortedrows = project.systemdesign.rows;
  // SET ROW WIDTH - ACTUALLY START BY SETTING TO SYSTEM WIDTH
  // HAVE ARRAY INSTEAD AND ONLY SELECT ROWS WITH TREES?!
  let rowWidth = 0;
  for (let i = 0; i < systemRows.length; i++) {
    rowWidth += systemRows[i].width;
  }
  const layout_rowWidth = rowWidth;
  // ROW PARAMETERS
  const rowWidthArray: number[] = [];
  let rowWidthArrayCount = 0;
  const treeRowWidthArray: number[] = [];
  //   const stripWidths = [];
  // ALLEY PARAMETERS
  const alleyWidthArray: number[] = [];
  let alleyWidthArrayCount = 0;
  const alleyWidths: number[] = [];
  for (let i = 0; i < systemRows.length + 1; i++) {
    // SET ROW LENGTHS
    // IF FIRST ROW
    if (i === 0) {
      if (systemRows[i].groundcover?.form === 'grass' || systemRows[i].groundcover?.form === 'herb') {
        rowWidthArrayCount += systemRows[i].width;
        // SET ALLEY COUNT
        alleyWidthArrayCount += systemRows[i].width / 2;
        alleyWidthArray.push(alleyWidthArrayCount);
        alleyWidthArrayCount = 0;
        alleyWidths.push(systemRows[i].width);
      } else {
        rowWidthArrayCount += systemRows[i].width / 2;
        rowWidthArray.push(rowWidthArrayCount);
        rowWidthArrayCount = 0;
        treeRowWidthArray.push(systemRows[i].width);
        // SET ALLEY COUNT
        alleyWidthArrayCount += systemRows[i].width;
      }
      // IF LAST ROW - OR IS THIS OFF?!
    } else if (i === systemRows.length) {
      rowWidthArrayCount += systemRows[i - 1].width / 2;
      rowWidthArray.push(rowWidthArrayCount);
      // ALLEYS
      alleyWidthArrayCount += systemRows[i - 1].width / 2;
      alleyWidthArray.push(alleyWidthArrayCount);
      // FOR ALL OTHER ROWS
    } else {
      // CHECK IF ROW BEFORE WAS GRASS
      if ((systemRows[i - 1].groundcover?.form === 'grass' || systemRows[i - 1].groundcover?.form === 'herb') && i === 1) {
        rowWidthArrayCount += systemRows[i].width / 2;
      } else {
        rowWidthArrayCount = rowWidthArrayCount + systemRows[i].width / 2 + systemRows[i - 1].width / 2;
      }
      // SET COUNTER TO 0 IF CURRENT ROW IS NOT GRASS
      if (!(systemRows[i].groundcover?.form === 'grass' || systemRows[i].groundcover?.form === 'herb')) {
        rowWidthArray.push(rowWidthArrayCount);
        rowWidthArrayCount = 0;
        treeRowWidthArray.push(systemRows[i].width);
      }
      // ALLEYS
      if (systemRows[i].groundcover?.form === 'grass' || systemRows[i].groundcover?.form === 'herb') {
        if ((systemRows[i - 1].groundcover?.form === 'grass' || systemRows[i - 1].groundcover?.form === 'herb') && i === 1) {
          alleyWidthArrayCount += systemRows[i - 1].width / 2;
        }
        alleyWidthArrayCount += systemRows[i].width / 2;
        // DO IF TO CHECK IF FIRST INDEX WAS ALLEY
        alleyWidthArray.push(alleyWidthArrayCount);
        alleyWidthArrayCount = 0;
        alleyWidths.push(systemRows[i].width);
        if (i < systemRows.length - 1) {
          alleyWidthArrayCount += systemRows[i].width / 2;
        }
      } else if ((systemRows[i - 1].groundcover?.form === 'grass' || systemRows[i - 1].groundcover?.form === 'herb') && i === 1) {
        alleyWidthArrayCount = alleyWidthArrayCount + systemRows[i - 1].width / 2 + systemRows[i].width;
      } else {
        alleyWidthArrayCount += systemRows[i].width;
      }
    }
  }
  /*  console.log(`Widths: ${alleyWidths}`);
  console.log(`Alleys: ${alleyWidthArray}`); */
  // DEFINE ALL VARIABLES I NEED FOR THE ROWS HERE, THEN MAKE IF STATEMENTS ON ALIGNMENT
  const tempOffsetArray: any[] = [];
  let lengthLine;
  let line;
  let rowCount = 0;
  let rowRest = 0;

  if (project.systemdesign.alignment === 'bearing') {
    // -------- ANGLED ROWS ---------
    // IF HEADLAND IS 0, JUST USE REGULAR POLYGON, NOT BUFFER
    let lengthLineBearing: turf.Feature<LineString, any>;
    if (project.bearingline) {
      const bearingline = JSON.parse(project.bearingline);
      lengthLineBearing = bearingline;
    } else if (project.systemdesign.margin === 0) {
      lengthLineBearing = turf.lineString([polygon.geometry.coordinates[0][project.bearing], polygon.geometry.coordinates[0][project.bearing + 1]], { name: 'bearingline' });
    } else {
      lengthLineBearing = turf.lineString([offsetPolygon.geometry.coordinates[0][project.bearing], offsetPolygon.geometry.coordinates[0][project.bearing + 1]], { name: 'bearingline' });
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
    rowCount = Math.floor((turfLength(lengthLineOffsetRotatedPolygon, { units: 'meters' })) / rowWidth);
    rowRest = (((turfLength(lengthLineOffsetRotatedPolygon, { units: 'meters' })) / rowWidth) - rowCount) * rowWidth;
    /*    console.log(rowCount);
    console.log(`rest ${rowRest}`); */
    // -------- ANGLED ROWS ---------
  } else if (project.systemdesign.alignment === 'north') {
    // -------- NORTH/SOURTH ROWS ---------
    // CREATE BOUNDING BOX (IF ANGLE IS 0)
    const box = bboxPolygon(bbox(offsetPolygon));
    // TAKE TOP SIDE OF BOUNDING BOX
    lengthLine = turf.lineString([box.geometry.coordinates[0][2], box.geometry.coordinates[0][3]], { name: 'line-0' });
    // ESTIMATE AMOUNT OF ROWS
    /*
    console.log((turfLength(lengthLine, { units: 'meters' })));
*/
    rowCount = Math.floor((turfLength(lengthLine, { units: 'meters' })) / rowWidth);
    rowRest = (((turfLength(lengthLine, { units: 'meters' })) / rowWidth) - rowCount) * rowWidth;
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
    lengthLine = turf.lineString([box.geometry.coordinates[0][1], box.geometry.coordinates[0][2]], { name: 'line-0' });
    // ESTIMATE AMOUNT OF ROWS
    /*
    console.log((turfLength(lengthLine, { units: 'meters' })));
*/
    rowCount = Math.floor((turfLength(lengthLine, { units: 'meters' })) / rowWidth);
    rowRest = (((turfLength(lengthLine, { units: 'meters' })) / rowWidth) - rowCount) * rowWidth;
    /*    console.log(`rest ${rowRest}`);
    console.log(rowCount); */
    // CREATE ROW LINE
    line = turf.lineString([box.geometry.coordinates[0][2], box.geometry.coordinates[0][3]], { name: 'line-1' });
    // -------- WEST/EAST ROWS ---------
  }
  // CREATE ROW ARRAY
  const rowArray: turf.Feature<turf.LineString, {
    name: string;
  }>[] = [];
  let distance = 0;
  const distanceArray = rowWidthArray;
  // CREATE ALLEY ARRAY
  const bedArray: turf.Feature<turf.Polygon, {
    name: string;
  }>[] = [];
  const alleyArray: turf.Feature<turf.Polygon, {
    name: string;
  }>[] = [];
  let bedDistance = 0;
  const alleySpeciesArrayCount: ISpeciesSchema[] = [];
  const alleySpeciesArray: ISpeciesSchema[][] = [];
  // ALLEY SPECIES ARRAY
  for (let i = 0; i < systemRows.length; i++) {
    if (systemRows[i].groundcover?.form === 'grass') {
      alleySpeciesArrayCount.push(systemRows[i].groundcover!);
    }
  }
  console.log(`${alleySpeciesArrayCount.length} ---- CHECK ---- ${alleyWidthArray.length}`);
  // OFFSET AND CREATE NEW LINE FOR EACH ROW - NB. WORKS BECAUSE -1 CANCELS < rowCount BY 1.
  for (let i = 0; i < rowCount; i++) {
    // DO IF FIRST COUNT?
    for (let j = 0; j < distanceArray.length; j++) {
      // DO IF FIRST ROW, DON'T ADD DISTANCE
      if (j === distanceArray.length - 1) {
        distance += distanceArray[j];
      } else if (i === 0 && j === 0) {
        // START FIRST ROW AT 0 - JUST SET TO DISTANCE!
        distance += distanceArray[j];
        const bufferLine1 = buffer(line, (distance * calibrateDistance), { units: 'meters' });
        const rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
        // console.log(`Row point count: ${rowPoints1.features.length}`);
        // DO IF HERE TO CHECK SEPARATE ROWS
        let row1;
        if ((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0)) {
          row1 = turf.lineString([[rowPoints1.features[1].geometry.coordinates[0], rowPoints1.features[1].geometry.coordinates[1]], [rowPoints1.features[0].geometry.coordinates[0], rowPoints1.features[0].geometry.coordinates[1]]], { name: `line-0${i}` });
        } else {
          row1 = turf.lineString([[rowPoints1.features[0].geometry.coordinates[0], rowPoints1.features[0].geometry.coordinates[1]], [rowPoints1.features[1].geometry.coordinates[0], rowPoints1.features[1].geometry.coordinates[1]]], { name: `line-0${i}` });
        }
        rowArray.push(row1);
        // CREATE FIRST TREE STRIP
        if (alleyWidthArray[0] < distanceArray[0]) {
          // IF ALLEY IS FIRST, CREATE TREE STRIP NORMALLY
          const alleyBufferLine1 = buffer(line, ((distance - (treeRowWidthArray[j] / 2)) * calibrateDistance), { units: 'meters' });
          const alleyPoints1 = lineIntersect(alleyBufferLine1, offsetPolygon);
          const alleyBufferLine2 = buffer(line, ((distance + (treeRowWidthArray[j] / 2)) * calibrateDistance), { units: 'meters' });
          const alleyPoints2 = lineIntersect(alleyBufferLine2, offsetPolygon);
          const alleyPolygon = turf.polygon([[alleyPoints1.features[0].geometry.coordinates, alleyPoints1.features[1].geometry.coordinates, alleyPoints2.features[1].geometry.coordinates, alleyPoints2.features[0].geometry.coordinates, alleyPoints1.features[0].geometry.coordinates]], { name: `alleypoly${i}` });
          bedArray.push(alleyPolygon);
        } else {
          // IF ROW AND STRIP IS FIRST, CREATE TREE STRIP WITH CUT
          /* var lineA = {};
                var lineB = {};
                var polyLine = polygonToLine(offsetPolygon);
                for(let k=0;k<offsetPolygon.geometry.coordinates[0].length - 1;k++){
                    var matchPoint1 = turf.point(row1.geometry.coordinates[0]);
                    var matchPoint2 = turf.point(row1.geometry.coordinates[1]);
                    var matchLine = turf.lineString([polyLine.geometry.coordinates[k], polyLine.geometry.coordinates[k+1]],{name: "matchLine-0" + k })
                    var match = pointToLineDistance(matchPoint1, matchLine);
                    var match2 = pointToLineDistance(matchPoint2, matchLine);
                    console.log("Any matches: " + match + match2);
                } */
        }
      } else {
        distance += distanceArray[j];
        const bufferLine1 = buffer(line, (distance * calibrateDistance), { units: 'meters' });
        const rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
        // console.log(`Row point count: ${rowPoints1.features.length}`);
        // DO IF HERE TO CHECK SEPARATE ROWS
        for (let k = 0; k < rowPoints1.features.length / 2; k += 1) {
          let row1;
          if ((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && (rowPoints1.features[1].geometry.coordinates[0] < 0 || rowPoints1.features[0].geometry.coordinates[1] > rowPoints1.features[1].geometry.coordinates[1]))) {
            row1 = turf.lineString([[rowPoints1.features[k + (rowPoints1.features.length / 2)].geometry.coordinates[0], rowPoints1.features[k + (rowPoints1.features.length / 2)].geometry.coordinates[1]], [rowPoints1.features[k].geometry.coordinates[0], rowPoints1.features[k].geometry.coordinates[1]]], { name: `line-0${i}` });
          } else {
            row1 = turf.lineString([[rowPoints1.features[k].geometry.coordinates[0], rowPoints1.features[k].geometry.coordinates[1]], [rowPoints1.features[k + (rowPoints1.features.length / 2)].geometry.coordinates[0], rowPoints1.features[k + (rowPoints1.features.length / 2)].geometry.coordinates[1]]], { name: `line-0${i}` });
          }
          rowArray.push(row1);
        }
        // CREATE TREE STRIPS
        const alleyBufferLine1 = buffer(line, ((distance - (treeRowWidthArray[j] / 2)) * calibrateDistance), { units: 'meters' });
        const alleyPoints1 = lineIntersect(alleyBufferLine1, offsetPolygon);
        const alleyBufferLine2 = buffer(line, ((distance + (treeRowWidthArray[j] / 2)) * calibrateDistance), { units: 'meters' });
        const alleyPoints2 = lineIntersect(alleyBufferLine2, offsetPolygon);
        // CHECK POINTS IN TREE STRIP POLYGONS
        // console.log(`treeStripPoints1: ${alleyPoints1.features.length}`);
        // console.log(`treeStripPoints2: ${alleyPoints2.features.length}`);
        // CHECK IF SAME LENGTH - OTHERWISE CAN'T MAKE POLYGON
        if (alleyPoints1.features.length === alleyPoints2.features.length) {
          for (let k = 0; k < alleyPoints1.features.length / 2; k += 1) {
            const alleyPolygon = turf.polygon([[alleyPoints1.features[k].geometry.coordinates, alleyPoints1.features[k + (alleyPoints1.features.length / 2)].geometry.coordinates, alleyPoints2.features[k + (alleyPoints2.features.length / 2)].geometry.coordinates, alleyPoints2.features[k].geometry.coordinates, alleyPoints1.features[k].geometry.coordinates]], { name: `alleypoly${i}` });
            // CUT OFFSET PERIMETER AS WELL FOR BEST ACCURACY
            bedArray.push(alleyPolygon);
          }
        }
      }
    }
    // ONLY DO THIS IF ALLEYS ARE THERE - ABOVE 1 MEANS THAT THERE IS AN ALLEY :P
    if (alleyWidthArray && alleyWidthArray.length > 1) {
      for (let j = 0; j < alleyWidthArray.length; j++) {
        if (i === 0 && j === 0) {
          // FIRST ALLEY ON AREA
          bedDistance += alleyWidthArray[j];
          if (alleyWidthArray[0] < distanceArray[0]) {
            // IF ALLEY IS FIRST, CREATE ALLEY WITH CUT
            const alleyBufferLineFirst = buffer(line, ((bedDistance + (alleyWidths[j] / 2)) * calibrateDistance), { units: 'meters' });
            const alleyPointsFirst = lineIntersect(alleyBufferLineFirst, offsetPolygon);
            // CUT FIRST LINE OF GEOMETRY
            const firstAlley = offsetPolygon;
            console.log(`Polygon geometry ${firstAlley.geometry.coordinates.length}`);
            for (let k = 0; k < firstAlley.geometry.coordinates.length; k++) {
              console.log(k);
            }
          } else {
            // IF TREE ROW IS FIRST, CREATE ALLEY NORMALLY
            const alleyBufferLine3 = buffer(line, ((bedDistance - (alleyWidths[j] / 2)) * calibrateDistance), { units: 'meters' });
            const alleyPoints3 = lineIntersect(alleyBufferLine3, offsetPolygon);
            const alleyBufferLine4 = buffer(line, ((bedDistance + (alleyWidths[j] / 2)) * calibrateDistance), { units: 'meters' });
            const alleyPoints4 = lineIntersect(alleyBufferLine4, offsetPolygon);
            // CHECK IF BEARING IS OPPOSITE
            const bearingcheck1 = rhumbBearing(alleyPoints3.features[0].geometry.coordinates, alleyPoints3.features[1].geometry.coordinates);
            const bearingcheck2 = rhumbBearing(alleyPoints4.features[1].geometry.coordinates, alleyPoints4.features[0].geometry.coordinates);
            // IF BEARING IS OPPOSITE USE DIFFERENT POINTS
            let alleyPolygon1;
            if ((bearingcheck1 - bearingcheck2) > 1 || (bearingcheck1 - bearingcheck2) > -1) {
              alleyPolygon1 = turf.polygon([[alleyPoints3.features[0].geometry.coordinates, alleyPoints3.features[1].geometry.coordinates, alleyPoints4.features[1].geometry.coordinates, alleyPoints4.features[0].geometry.coordinates, alleyPoints3.features[0].geometry.coordinates]], { name: `alleypoly${i}` });
            } else {
              alleyPolygon1 = turf.polygon([[alleyPoints3.features[0].geometry.coordinates, alleyPoints3.features[1].geometry.coordinates, alleyPoints4.features[0].geometry.coordinates, alleyPoints4.features[1].geometry.coordinates, alleyPoints3.features[0].geometry.coordinates]], { name: `alleypoly${i}` });
            }
            // PUSH TO ARRAY
            alleyArray.push(alleyPolygon1);
            // ADD SPECIES TO ALLEY ARRAY
            const alleySpeciesCount: ISpeciesSchema[] = [
              alleySpeciesArrayCount[j],
            ];
            alleySpeciesArray.push(alleySpeciesCount);
          }
        } else if (j === alleyWidthArray.length - 1) { // REMAINING ALLEYS ON AREA
          bedDistance += alleyWidthArray[j];
          // IF ALLEY IS FIRST, CREATE ALLEY WITH CUT
          /* const alleyBufferLineLast = buffer(line, ((bedDistance - (alleyWidths[j] / 2)) * calibrateDistance), { units: 'meters' });
          const alleyPointsLast = lineIntersect(alleyBufferLineLast, offsetPolygon); */
          // CUT FIRST LINE OF GEOMETRY
          /* const lastAlley = offsetPolygon;
          console.log("Polygon geometry " + lastAlley.geometry.coordinates.length);
          for(let k = 0; k < lastAlley.geometry.coordinates.length; k++){
            console.log(k);
          } */
        } else {
          // CREATE ALLEYS
          bedDistance += alleyWidthArray[j];
          const alleyBufferLine3 = buffer(line, ((bedDistance - (alleyWidths[j] / 2)) * calibrateDistance), { units: 'meters' });
          const alleyPoints3 = lineIntersect(alleyBufferLine3, offsetPolygon);
          const alleyBufferLine4 = buffer(line, ((bedDistance + (alleyWidths[j] / 2)) * calibrateDistance), { units: 'meters' });
          const alleyPoints4 = lineIntersect(alleyBufferLine4, offsetPolygon);
          /* // PRINT ALLEY POINT COUNTS TO SEE WHEN MORE THAN 2
          console.log(`alleyPoints3: ${alleyPoints3.features.length}`);
          console.log(`alleyPoints4: ${alleyPoints4.features.length}`); */
          // CHECK IF BEARING IS OPPOSITE
          const bearingcheck1 = rhumbBearing(alleyPoints3.features[0].geometry.coordinates, alleyPoints3.features[1].geometry.coordinates);
          const bearingcheck2 = rhumbBearing(alleyPoints4.features[1].geometry.coordinates, alleyPoints4.features[0].geometry.coordinates);
          /*          console.log(`bearing1: ${bearingcheck1}`);
          console.log(`bearing2: ${bearingcheck2}`);
          console.log(`bearingcheck: ${bearingcheck1 % bearingcheck2}`); */
          // CHECK IF SAME LENGTH
          if (alleyPoints3.features.length === alleyPoints4.features.length) {
            // DO IF HERE TO CHECK SEPARATE ROWS
            for (let k = 0; k < alleyPoints3.features.length / 2; k += 1) {
              // CHECK IF SAME LENGTH
              let alleyPolygon1;
              if ((bearingcheck1 - bearingcheck2) > 1 || (bearingcheck2 - bearingcheck1) > 1) {
                alleyPolygon1 = turf.polygon([[alleyPoints3.features[k].geometry.coordinates, alleyPoints3.features[k + (alleyPoints3.features.length / 2)].geometry.coordinates, alleyPoints4.features[k + (alleyPoints4.features.length / 2)].geometry.coordinates, alleyPoints4.features[k].geometry.coordinates, alleyPoints3.features[k].geometry.coordinates]], { name: `alleypoly${i}` });
              } else {
                alleyPolygon1 = turf.polygon([[alleyPoints3.features[k].geometry.coordinates, alleyPoints3.features[k + (alleyPoints3.features.length / 2)].geometry.coordinates, alleyPoints4.features[k].geometry.coordinates, alleyPoints4.features[k + (alleyPoints4.features.length / 2)].geometry.coordinates, alleyPoints3.features[k].geometry.coordinates]], { name: `alleypoly${i}` });
              }
              // PUSH TO ARRAY
              alleyArray.push(alleyPolygon1);
              // ADD SPECIES TO ALLEY ARRAY
              const alleySpeciesCount = [
                alleySpeciesArrayCount[j],
              ];
              alleySpeciesArray.push(alleySpeciesCount);
            }
          }
        }
      }
    }
  }
  // FIND LAST IF LAST IS ROW OR ALLEY
  let tempWidthAlley = 0;
  let tempWidthAlleyCount = 0;
  for (let i = 0; i < alleyWidthArray.length; i++) {
    tempWidthAlleyCount += alleyWidthArray[i];
    if (tempWidthAlleyCount < rowRest) {
      tempWidthAlley = tempWidthAlleyCount;
    }
  }
  let tempWidthTree = 0;
  let tempWidthTreeCount = 0;
  for (let i = 0; i < rowWidthArray.length; i++) {
    tempWidthTreeCount += rowWidthArray[i];
    if (tempWidthTreeCount < rowRest) {
      tempWidthTree = tempWidthTreeCount;
    }
  }
  /* console.log(`Tree sequence: ${tempWidthTree}`);
  console.log(`Alley sequence: ${tempWidthAlley}`); */
  // ADD LAST ROWS IF THERE IS SOME MISSING
  let countWidth = 0;
  for (let i = 0; i < distanceArray.length; i++) {
    countWidth += distanceArray[i];
    if (countWidth < rowRest) {
      const bufferLine2 = buffer(line, ((distance + countWidth) * calibrateDistance), { units: 'meters' });
      const rowPoints2 = lineIntersect(bufferLine2, offsetPolygon);
      // console.log(`Row point count: ${rowPoints2.features.length}`);
      // DO IF HERE TO CHECK SEPARATE ROWS
      // CHECK IF ROWS CROSS MEDIAN LINE (GOES FROM NEGATIVE TO POSITIVE)
      let row2;
      if ((rowPoints2.features[0].geometry.coordinates[0] < 0 && rowPoints2.features[1].geometry.coordinates[0] > 0) || (rowPoints2.features[0].geometry.coordinates[0] > 0 && rowPoints2.features[1].geometry.coordinates[0] < 0) || rowPoints2.features[0].geometry.coordinates[1] > rowPoints2.features[1].geometry.coordinates[1]) {
        row2 = turf.lineString([[rowPoints2.features[1].geometry.coordinates[0], rowPoints2.features[1].geometry.coordinates[1]], [rowPoints2.features[0].geometry.coordinates[0], rowPoints2.features[0].geometry.coordinates[1]]], { name: `line-1${i}` });
      } else {
        row2 = turf.lineString([[rowPoints2.features[0].geometry.coordinates[0], rowPoints2.features[0].geometry.coordinates[1]], [rowPoints2.features[1].geometry.coordinates[0], rowPoints2.features[1].geometry.coordinates[1]]], { name: `line-1${i}` });
      }
      rowArray.push(row2);
      // DO GRASS STRIPS. CHECK IF IT'S THE LAST ROW. ALSO CHECK ALLEY
      /* if((countWidth + distanceArray[i+1] > rowRest) && tempWidthTree < tempWidthAlley){
                // LAST ROW

            } else {
                // NOT LAST ROW
                // CREATE TREE STRIPS
                var alleyBufferLine1 = buffer(line, ((distance+countWidth-(treeRowWidthArray[i]/2))*calibrateDistance), {units: "meters"});
                var alleyPoints1 = lineIntersect(alleyBufferLine1, offsetPolygon);
                var alleyBufferLine2 = buffer(line, ((distance+countWidth+(treeRowWidthArray[i]/2))*calibrateDistance), {units: "meters"});
                var alleyPoints2 = lineIntersect(alleyBufferLine2, offsetPolygon);
                var alleyPolygon = turf.polygon([[alleyPoints1.features[0].geometry.coordinates, alleyPoints1.features[1].geometry.coordinates, alleyPoints2.features[1].geometry.coordinates, alleyPoints2.features[0].geometry.coordinates, alleyPoints1.features[0].geometry.coordinates]], {name: "alleypoly" + i});
                // CUT OFFSET PERIMETER AS WELL FOR BEST ACCURACY
                bedArray.push(alleyPolygon);
            } */
    }
  }
  // ADD LAST ALLEYS IF THERE IS SOME MISSING
  let alleyCountWidth = 0;
  for (let i = 0; i < alleyWidthArray.length; i++) {
    alleyCountWidth += alleyWidthArray[i];
    // NEED TO CHECK FOR MINUS WIDTH AS WELL? YES
    if (alleyCountWidth < rowRest) {
      if ((alleyCountWidth + alleyWidthArray[i + 1] > rowRest) && tempWidthTree > tempWidthAlley) {

      } else {
        // MAKE INDEX COUNTS FOR ALLEY PERIMETER INTERSECTION CUT
        /* var alleyArrayIndexStart = 0;
                var alleyArrayIndexEnd = 0;
                // MAKE ALLEY CUT LINE
                var alleyBufferLine3 = buffer(line, ((bedDistance+alleyCountWidth-(alleyWidths[i]/2))*calibrateDistance), {units: "meters"});
                var alleyPoints3 = lineIntersect(alleyBufferLine3, offsetPolygon);
                const rowLast = turf.lineString([[alleyPoints3.features[1].geometry.coordinates[0], alleyPoints3.features[1].geometry.coordinates[1]], [alleyPoints3.features[0].geometry.coordinates[0], alleyPoints3.features[0].geometry.coordinates[1]]], { name: `line-1${i}` });

                // RUN THROUGH OFFSETPOLYGON AND CHECK IF LINEPOINTS INTERSECTS IS ON SPECIFIC LINE SEGMENT
                console.log("offsetpolygon coordinates: " + offsetPolygon.geometry.coordinates[0][0] + offsetPolygon.geometry.coordinates[0][1]);
                for(let j=0;j<offsetPolygon.geometry.coordinates[0].length-1;j++){
                  const lineSegment = turf.lineString([[offsetPolygon.geometry.coordinates[0][j][0],offsetPolygon.geometry.coordinates[0][j][1]],[offsetPolygon.geometry.coordinates[0][j+1][0],offsetPolygon.geometry.coordinates[0][j+1][1]]],{name: "line segment"});
                  const LineSegmentOptions = {epsilon: 1};
                  // INTERSECT POINT 0 INTERSECTION LINE SEGMENT INDEX
                  const onLineSegmentStart = booleanPointOnLine(alleyPoints3.features[0].geometry.coordinates,lineSegment,LineSegmentOptions);
                  console.log(onLineSegmentStart);
                  if (onLineSegmentStart){
                    alleyArrayIndexStart = j-1;
                    console.log("First intersection on line segment: " + j);
                  }
                  // INTERSECT POINT 1 INTERSECTION LINE SEGMENT INDEX
                  const onLineSegmentEnd = booleanPointOnLine(alleyPoints3.features[1].geometry.coordinates,lineSegment,LineSegmentOptions);
                  if(onLineSegmentEnd){
                    alleyArrayIndexEnd = j;
                    console.log("Last intersection on line segment: " + j);
                  }
                }
                console.log("Start Index: " + alleyArrayIndexStart);
                console.log("End Index: " + alleyArrayIndexEnd);
                // NEW ARRAY OF COORDINATES
                const cutAlleyCoordinateArray: any[] = [];
                // INSERT POINTS IN ARRAY
                for(let j=0;j<offsetPolygon.geometry.coordinates[0].length-1;j++){
                  // CHECK IF PART OF LINE SEGMENT
                  if(j >= alleyArrayIndexStart && alleyArrayIndexEnd >= j){
                    cutAlleyCoordinateArray.push(offsetPolygon.geometry.coordinates[0][j]);
                  }
                }
                // INSERT 0 INTERSECTION LAST
                cutAlleyCoordinateArray.push(alleyPoints3.features[0].geometry.coordinates)
                // INSERT 1 INTERSECTION FIRST LAST
                cutAlleyCoordinateArray.push(alleyPoints3.features[1].geometry.coordinates)
                cutAlleyCoordinateArray.unshift(alleyPoints3.features[1].geometry.coordinates)
                // INSERT LAST FOR TEST
                console.log("cutAlleyCoordinateArray: " + cutAlleyCoordinateArray);
                console.log("cutAlleyCoordinateArray: " + cutAlleyCoordinateArray[0]);
                console.log("cutAlleyCoordinateArray: " + cutAlleyCoordinateArray[1]);
                const cutAlleyPolygon = turf.polygon([cutAlleyCoordinateArray],{name: "Alley End"});
                alleyArray.push(cutAlleyPolygon); */
        /* var alleyBufferLine4 = buffer(line, ((bedDistance+alleyCountWidth+(alleyWidths[i]/4))*calibrateDistance), {units: "meters"});
                var alleyPoints4 = lineIntersect(alleyBufferLine4, offsetPolygon);
                var alleyPolygon1 = turf.polygon([[alleyPoints3.features[0].geometry.coordinates, alleyPoints3.features[1].geometry.coordinates, alleyPoints4.features[1].geometry.coordinates, alleyPoints4.features[0].geometry.coordinates, alleyPoints3.features[0].geometry.coordinates]], {name: "alleypoly" + i});
                // PUSH TO ARRAY
                alleyArray.push(alleyPolygon1); */
      }
    }
  }
  const layout_offsetArray = tempOffsetArray;
  // CALCULATE TREE ROW AREA HERE
  const layout_treeRowArea = 0;
  const layout_bedPolygonArray = bedArray;
  const layout_bedPolygonCollection = turf.featureCollection(bedArray);
  const layout_alleyPolygonArray = alleyArray;
  const layout_alleySpeciesArray = alleySpeciesArray;
  /*  console.log(`Alley species array count: ${alleySpeciesArray.length}`);
  console.log(`Alley polygon array count: ${alleyArray.length}`); */
  // SET ROWLENGTH ARRAY
  const rowLengthArray: number[] = [];
  for (let i = 0; i < rowArray.length; i++) {
    const rowLength1 = turfLength(rowArray[i], { units: 'meters' });
    rowLengthArray.push(rowLength1);
    /*
                            console.log(rowArray[i].geometry.coordinates);
        */
  }
  // PUSH TO ROW ARRAY
  /*                rowArray.push(scaledLengthLineBearing);
                    rowArray.push(finalLengthLineBearing.features[1]); */
  // DO DISTANCE CHECK FOR ROW ARRAY OFFSET
  /* var rotatedCheckLine = transformRotate(rowArray[0], 90);
     var splitCheckLine = lineSplit(rotatedCheckLine, rowArray[0]);
     var distanceCheckLine = lineSplit(splitCheckLine.features[1], rowArray[1]);
     var checkDistance = turfLength(distanceCheckLine.features[0], {units: "meters"});
     console.log("Distance check " + checkDistance); */
  // CREATE FEATURECOLLECTION FOR ROWS

  const layout_rowLineCollection = turf.featureCollection(rowArray);
  // CREATE FEATURE COLLECTION FOR EDGEROWS
  /*    var edgeRowFeatureCollection = turf.featureCollection(edgeRowArray);
    var edgeRowCollection = JSON.stringify(edgeRowFeatureCollection); */
  // OFFSET LINE
  /*               var offsetline = lineOffset(line, -(3),{units: "meters"});
                   var rowPoints = lineIntersect(offsetline, offsetPolygon);
                   var row = turf.lineString([[rowPoints.features[0].geometry.coordinates[0],rowPoints.features[0].geometry.coordinates[1]],[rowPoints.features[1].geometry.coordinates[0],rowPoints.features[1].geometry.coordinates[1]]],{name: "line-2"});
                   var stringline = JSON.stringify(row);
                   var stringbox = JSON.stringify(box); */
  // CLEAN DATASET FROM ANNUALS - ONLY WORKS IF ANNUALS IN FIRST POSITION
  const treeRows: {
    sequence: {
        species: ISpeciesSchema;
        spacingAfter: number;
        position?: number;
      }[];
      width: number;
    }[] = [];
  for (let i = 0; i < systemRows.length; i++) {
    if (!(systemRows[i].groundcover?.form === 'grass')) {
      // console.log('dataset[i]', dataset[i]);
      treeRows.push(systemRows[i]);
    }
  }
  // CYCLE THROUGH ALL ROWS TO FIND SYSTEM LENGTH
  let systemModelLength = 0;
  for (let i = 0; i < systemRows.length; i++) {
    if (absolutePosition(systemRows[i].sequence, systemRows[i].sequence.length - 1) > systemModelLength) {
      systemModelLength = absolutePosition(systemRows[i].sequence, systemRows[i].sequence.length - 1);
    }
  }
  // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
  let treeRowCount = 0;
  //   const treeCountArray: any[] = [];
  const treeMarkerArray: turf.Feature<turf.Point, turf.Properties>[] = [];
  const treeAssetArray: {
    species: string;
    lat: number;
    lng: number;
    name: string;
  }[] = [];
  const treeAssetRowRef: number[] = [];
  const treeArray: ISpeciesSchema[] = [];
  //   let treeRowArea = 0;
  for (let i = 0; i < rowArray.length; i++) {
    // COUNT SYSTEM MODEL ITERATIONS IN ROW
    const rowLength = turfLength(rowArray[i], { units: 'meters' });
    // IF POSITION y IS 1, USE NEXT ROW TO FIND SYSTEM MODEL LENGTH?! THIS IS ONLY TEMP SOLUTION
    /* var systemModelLength = 0;
        if(dataset[0].sequence[(dataset[0].sequence.length - 1)].position <= 1){
            systemModelLength = dataset[1].sequence[(dataset[1].sequence.length - 1)].position;
        } else {
            systemModelLength = dataset[0].sequence[(dataset[0].sequence.length - 1)].position;
        } */
    const systemModelCount = Math.floor(rowLength / systemModelLength);
    const systemModelRowRest = ((rowLength / systemModelLength) - Math.floor(rowLength / systemModelLength)) * systemModelLength;
    // CALCULATE AREA
    // treeRowArea += rowLength * treeRows[treeRowCount].width;
    // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
    /*
    console.log(`Position: ${treeRows[treeRowCount].sequence[(treeRows[treeRowCount].sequence.length) - 1].position}`);
*/
    if (!(absolutePosition(treeRows[treeRowCount].sequence, (treeRows[treeRowCount].sequence.length) - 1) < systemModelLength)) {
      treeArray.push(treeRows[treeRowCount].sequence[(treeRows[treeRowCount].sequence.length) - 1].species);
      const firstTreeMarker = turf.point(rowArray[i].geometry.coordinates[0]);
      treeMarkerArray.push(firstTreeMarker);
      // ASSET ARRAY
      const asset = {
        species: treeRows[treeRowCount].sequence[(treeRows[treeRowCount].sequence.length) - 1].species.id,
        form: treeRows[treeRowCount].sequence[
          treeRows[treeRowCount].sequence.length - 1
        ].species.form,
        lat: firstTreeMarker.geometry.coordinates[0],
        lng: firstTreeMarker.geometry.coordinates[1],
        name: treeRows[treeRowCount].sequence[(treeRows[treeRowCount].sequence.length) - 1].species.nameCommon,
      };

      console.log(asset);

      treeAssetArray.push(asset);
      treeAssetRowRef.push(i);
    }
    // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
    for (let j = 0; j < systemModelCount; j++) {
      for (let k = 0; k < treeRows[treeRowCount].sequence.length; k++) {
        // ADD TREE SPECIES TO COUNT ARRAY
        treeArray.push(treeRows[treeRowCount].sequence[k].species);
        // CREATE TREE POINTS FOR MARKERS
        const treeMarker = along(rowArray[i], (j * systemModelLength + absolutePosition(treeRows[treeRowCount].sequence, k)), { units: 'meters' });
        treeMarkerArray.push(treeMarker);
        // ASSET ARRAY
        const asset = {
          species: treeRows[treeRowCount].sequence[k].species.id,
          form: treeRows[treeRowCount].sequence[k].species.form,

          lat: treeMarker.geometry.coordinates[0],
          lng: treeMarker.geometry.coordinates[1],
          name: treeRows[treeRowCount].sequence[k].species.nameCommon,
        };
        treeAssetArray.push(asset);
        treeAssetRowRef.push(i);
      }
    }
    // ADD REST
    for (let j = 0; j < treeRows[treeRowCount].sequence.length; j++) {
      if (absolutePosition(treeRows[treeRowCount].sequence, j) < systemModelRowRest) {
        treeArray.push(treeRows[treeRowCount].sequence[j].species);
        // ADD POINT MARKER FOR REMAINING TREES
        const treeMarker2 = along(rowArray[i], (systemModelCount * systemModelLength + absolutePosition(treeRows[treeRowCount].sequence, j)), { units: 'meters' });
        treeMarkerArray.push(treeMarker2);
        // ASSET ARRAY
        const asset = {
          species: treeRows[treeRowCount].sequence[j].species.id,
          form: treeRows[treeRowCount].sequence[j].species.form,

          lat: treeMarker2.geometry.coordinates[0],
          lng: treeMarker2.geometry.coordinates[1],
          name: treeRows[treeRowCount].sequence[j].species.nameCommon,
        };
        treeAssetArray.push(asset);
        treeAssetRowRef.push(i);
      }
    }
    // ALIGN ROW ARRAY WITH SYSTEM ROWS (I.E. START NEW ROW MODEL COUNT.) AND REST LAST ROW
    if (treeRowCount >= treeRows.length - 1) {
      treeRowCount = 0;
    } else {
      treeRowCount += 1;
    }
  }
  /* console.log(treeArray.length);
  console.log(treeMarkerArray.length); */
  // DO POINT COLLECTION
  const treeCanopyArray: turf.Feature<turf.Polygon, turf.Properties>[] = [];
  if (treeMarkerArray.length < 5000) {
    for (let i = 0; i < treeMarkerArray.length; i++) {
      const circle1 = circle(treeMarkerArray[i].geometry.coordinates, 2, { units: 'meters' });
      treeCanopyArray.push(circle1);
    }
  }
  // const layout_offsetArrayCollection: any[] = []; // CAN DELETE THIS AT SOME POINT. JUST USED IT TO ENSURE VIZ OF LINES IN LAYOUT ANGLED WAS WORKING

  const layout_treeMarkerCollection = turf.featureCollection(treeCanopyArray);
  // CALCULATE TREE COUNT
  //   const areaSize = project.layer.size;
  // GRID SIZE
  //   const areaGrid = rowWidth * dataset[0].sequence[(dataset[0].sequence.length - 1)].position; // CHECK THAT THIS IS WORKING
  //   const gridCount = areaSize / areaGrid;
  // COPY ALL SPECIES

  const allSpecies: string[] = [];
  project.systemdesign.rows.forEach((row) => {
    row.sequence.forEach((sequenceElement) => {
      allSpecies.push(sequenceElement.species.nameCommon);
    });
  });

  const allSpeciesCopy: string[] = [];
  for (let i = 0; allSpecies.length > i; i++) {
    allSpeciesCopy.push(allSpecies[i]);
  }
  // FIND UNIQUE SPECIES / REMOVE DUPLICATES
  const uniqueSpecies = [...new Set(allSpeciesCopy)];
  // UNIQUE ITEM COUNTS
  const uniqueSpeciesCount: {
    id: string;
		_id: string
    uniqueCount: number;
  }[] = [];
  for (let i = 0; uniqueSpecies.length > i; i++) {
    let count = 0;
    let form;
    let _id;
    for (let j = 0; j < treeArray.length; j++) {
      if (treeArray[j].nameCommon === uniqueSpecies[i]) {
        count += 1;
        form = treeArray[j].form;
        _id = treeArray[j].id;
      }
    }
    const speciesCount = {
      id: uniqueSpecies[i],
      form,
      _id,
      uniqueCount: count,
    };
    uniqueSpeciesCount.push(speciesCount);
  }
  const layout_uniqueSpeciesCount = uniqueSpeciesCount;
  const uniqueTreeSpecies = [...new Set(treeArray)];
  const layout_uniqueSpecies = uniqueTreeSpecies;
  // UNIQUE AREA COUNT

  /* // CHECK LENGTH OF LINE BEFORE CUTTING
    var checkLine = turf.lineString([polygon.geometry.coordinates[0][1],polygon.geometry.coordinates[0][2]],{name: "checkLine"});
    var checkLength = turfLength(checkLine, {units: "meters"});
    console.log(checkLength + " meters long"); */
  // CALCULATE MARGIN AREA
  //   const marginArea = area(polygon) - area(offsetPolygon);

  // Edge System
  const { edgeTreeCanopyArray, edgeRowArray } = createEdge(project, calibrateDistance, polygon);
  rowArray.concat(edgeRowArray);
  treeCanopyArray.concat(edgeTreeCanopyArray);

  // CREATE Return OBJECT
  const layout_rowLineArray = rowArray;
  const layout_treeAssetRowRef = treeAssetRowRef;
  const layout_treeArray = treeArray;
  const layout_treeMarkerArray = treeCanopyArray;
  const layout_treeAssetArray = treeAssetArray;

  return {
    alleyPolygonArray: layout_alleyPolygonArray,
    alleySpeciesArray: layout_alleySpeciesArray,
    bedPolygonArray: layout_bedPolygonArray,
    bedPolygonCollection: layout_bedPolygonCollection,
    offsetArray: layout_offsetArray,
    // offsetArrayCollection: layout_offsetArrayCollection,
    rowLineArray: layout_rowLineArray,
    rowLineCollection: layout_rowLineCollection,
    rowWidth: layout_rowWidth,
    sortedrows: layout_sortedrows,
    treeArray: layout_treeArray,
    treeAssetArray: layout_treeAssetArray,
    treeAssetRowRef: layout_treeAssetRowRef,
    treeMarkerArray: layout_treeMarkerArray,
    treeMarkerCollection: layout_treeMarkerCollection,
    treeRowArea: layout_treeRowArea,
    uniqueSpeciesCount: layout_uniqueSpeciesCount,
    uniqueSpecies: layout_uniqueSpecies,
  };
}
