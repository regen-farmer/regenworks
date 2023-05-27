import {
  bbox,
  bboxPolygon,
  helpers as turf,
  lineIntersect,
  length as turfLength,
  buffer,
  rhumbBearing,
  transformRotate,
  lineSplit,
  along,
  circle,
} from '@turf/turf';
import _ from 'lodash';
import { IProjectSchema } from '../../models/project';
import { ISpeciesSchema } from '../../models/species';
import { createEdge } from './edge_system';
import { absolutePosition } from './get_absolute_position';
import { makeInitialLine as makeInitialLines } from './make_line';
import { makeTreeRowLines } from './make_tree_row_lines';
import { makeGroundCoverAreas } from './make_ground_cover_areas';

// SYSTEM BASED LAYOUT
export function systemBasedLayout(project: IProjectSchema) {
  // Convert System Design to old syntax System['model']

  const systemRows = project.systemdesign.rows;

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

  const {
    lineIntersectingAreaInsideMargin, widthOfAreaInsideMargin,
  } = makeInitialLines(project.systemdesign, polygon, offsetPolygon);

  // Tree Row Calculations
  const treeRowLines = makeTreeRowLines(offsetPolygon, calibrateDistance, lineIntersectingAreaInsideMargin, widthOfAreaInsideMargin, project.systemdesign.rows);

  // Ground Cover Area Calculations
  const groundCoverAreas = makeGroundCoverAreas(offsetPolygon, calibrateDistance, lineIntersectingAreaInsideMargin, widthOfAreaInsideMargin, project.systemdesign.rows);

  console.log('treeRowArray.length', treeRowLines.length);

  return {
    treeRowLines,
    groundCoverAreas,
  };

  //   // Ground Cover Calculations
  //   const groundCoverArray: turf.Feature<turf.Polygon, {
  //       name: string;
  //   }>[] = [];

  //   // CREATE ROW ARRAY
  //   const rowArray: turf.Feature<turf.LineString, {
  //     name: string;
  //   }>[] = [];
  //   let distance = 0;

  //   // CREATE ALLEY ARRAY
  //   const bedArray: turf.Feature<turf.Polygon, {
  //     name: string;
  //   }>[] = [];

  //   const alleyArray: turf.Feature<turf.Polygon, {
  //     name: string;
  //   }>[] = [];

  //   // OFFSET AND CREATE NEW LINE FOR EACH ROW - NB. WORKS BECAUSE -1 CANCELS < rowCount BY 1.
  //   for (let i = 0; i < rowCount; i++) {
  //     // DO IF FIRST COUNT?
  //     for (let j = 0; j < distanceArray.length; j++) {
  //       // DO IF FIRST ROW, DON'T ADD DISTANCE
  //       if (j === distanceArray.length - 1) {
  //         distance += distanceArray[j];
  //       } else if (i === 0 && j === 0) {
  //         // START FIRST ROW AT 0 - JUST SET TO DISTANCE!
  //         distance += distanceArray[j];
  //         const bufferLine1 = buffer(lineIntersectingAreaInsideMargin, (distance * calibrateDistance), { units: 'meters' });
  //         const rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
  //         // console.log(`Row point count: ${rowPoints1.features.length}`);
  //         // DO IF HERE TO CHECK SEPARATE ROWS
  //         let row1;
  //         if ((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0)) {
  //           row1 = turf.lineString([[rowPoints1.features[1].geometry.coordinates[0], rowPoints1.features[1].geometry.coordinates[1]], [rowPoints1.features[0].geometry.coordinates[0], rowPoints1.features[0].geometry.coordinates[1]]], { name: `line-0${i}` });
  //         } else {
  //           row1 = turf.lineString([[rowPoints1.features[0].geometry.coordinates[0], rowPoints1.features[0].geometry.coordinates[1]], [rowPoints1.features[1].geometry.coordinates[0], rowPoints1.features[1].geometry.coordinates[1]]], { name: `line-0${i}` });
  //         }

  //         rowArray.push(row1);
  //         // CREATE FIRST TREE STRIP
  //         if (alleyWidthArray[0] < distanceArray[0]) {
  //           // IF ALLEY IS FIRST, CREATE TREE STRIP NORMALLY
  //           const alleyBufferLine1 = buffer(lineIntersectingAreaInsideMargin, ((distance - (treeRowWidthArray[j] / 2)) * calibrateDistance), { units: 'meters' });
  //           const alleyPoints1 = lineIntersect(alleyBufferLine1, offsetPolygon);
  //           const alleyBufferLine2 = buffer(lineIntersectingAreaInsideMargin, ((distance + (treeRowWidthArray[j] / 2)) * calibrateDistance), { units: 'meters' });
  //           const alleyPoints2 = lineIntersect(alleyBufferLine2, offsetPolygon);
  //           const alleyPolygon = turf.polygon([[alleyPoints1.features[0].geometry.coordinates, alleyPoints1.features[1].geometry.coordinates, alleyPoints2.features[1].geometry.coordinates, alleyPoints2.features[0].geometry.coordinates, alleyPoints1.features[0].geometry.coordinates]], { name: `alleypoly${i}` });
  //           bedArray.push(alleyPolygon);
  //         } else {
  //           // IF ROW AND STRIP IS FIRST, CREATE TREE STRIP WITH CUT
  //           /* var lineA = {};
  //                 var lineB = {};
  //                 var polyLine = polygonToLine(offsetPolygon);
  //                 for(let k=0;k<offsetPolygon.geometry.coordinates[0].length - 1;k++){
  //                     var matchPoint1 = turf.point(row1.geometry.coordinates[0]);
  //                     var matchPoint2 = turf.point(row1.geometry.coordinates[1]);
  //                     var matchLine = turf.lineString([polyLine.geometry.coordinates[k], polyLine.geometry.coordinates[k+1]],{name: "matchLine-0" + k })
  //                     var match = pointToLineDistance(matchPoint1, matchLine);
  //                     var match2 = pointToLineDistance(matchPoint2, matchLine);
  //                     console.log("Any matches: " + match + match2);
  //                 } */
  //         }
  //       } else {
  //         distance += distanceArray[j];
  //         const bufferLine1 = buffer(lineIntersectingAreaInsideMargin, (distance * calibrateDistance), { units: 'meters' });
  //         const rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
  //         // console.log(`Row point count: ${rowPoints1.features.length}`);
  //         // DO IF HERE TO CHECK SEPARATE ROWS
  //         for (let k = 0; k < rowPoints1.features.length / 2; k += 1) {
  //           let row1;
  //           if ((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && (rowPoints1.features[1].geometry.coordinates[0] < 0 || rowPoints1.features[0].geometry.coordinates[1] > rowPoints1.features[1].geometry.coordinates[1]))) {
  //             row1 = turf.lineString([[rowPoints1.features[k + (rowPoints1.features.length / 2)].geometry.coordinates[0], rowPoints1.features[k + (rowPoints1.features.length / 2)].geometry.coordinates[1]], [rowPoints1.features[k].geometry.coordinates[0], rowPoints1.features[k].geometry.coordinates[1]]], { name: `line-0${i}` });
  //           } else {
  //             row1 = turf.lineString([[rowPoints1.features[k].geometry.coordinates[0], rowPoints1.features[k].geometry.coordinates[1]], [rowPoints1.features[k + (rowPoints1.features.length / 2)].geometry.coordinates[0], rowPoints1.features[k + (rowPoints1.features.length / 2)].geometry.coordinates[1]]], { name: `line-0${i}` });
  //           }
  //           rowArray.push(row1);
  //         }

  //         // CREATE TREE STRIPS
  //         const alleyBufferLine1 = buffer(lineIntersectingAreaInsideMargin, ((distance - (treeRowWidthArray[j] / 2)) * calibrateDistance), { units: 'meters' });
  //         const alleyPoints1 = lineIntersect(alleyBufferLine1, offsetPolygon);
  //         const alleyBufferLine2 = buffer(lineIntersectingAreaInsideMargin, ((distance + (treeRowWidthArray[j] / 2)) * calibrateDistance), { units: 'meters' });
  //         const alleyPoints2 = lineIntersect(alleyBufferLine2, offsetPolygon);
  //         // CHECK POINTS IN TREE STRIP POLYGONS
  //         // console.log(`treeStripPoints1: ${alleyPoints1.features.length}`);
  //         // console.log(`treeStripPoints2: ${alleyPoints2.features.length}`);
  //         // CHECK IF SAME LENGTH - OTHERWISE CAN'T MAKE POLYGON
  //         if (alleyPoints1.features.length === alleyPoints2.features.length) {
  //           for (let k = 0; k < alleyPoints1.features.length / 2; k += 1) {
  //             const alleyPolygon = turf.polygon([[alleyPoints1.features[k].geometry.coordinates, alleyPoints1.features[k + (alleyPoints1.features.length / 2)].geometry.coordinates, alleyPoints2.features[k + (alleyPoints2.features.length / 2)].geometry.coordinates, alleyPoints2.features[k].geometry.coordinates, alleyPoints1.features[k].geometry.coordinates]], { name: `alleypoly${i}` });
  //             // CUT OFFSET PERIMETER AS WELL FOR BEST ACCURACY
  //             bedArray.push(alleyPolygon);
  //           }
  //         }
  //       }
  //     }
  //   }

  //   // CALCULATE TREE ROW AREA HERE
  //   const layout_treeRowArea = 0;
  //   const layout_bedPolygonArray = bedArray;
  //   const layout_bedPolygonCollection = turf.featureCollection(bedArray);
  //   const layout_alleyPolygonArray = alleyArray;
  //   /*  console.log(`Alley species array count: ${alleySpeciesArray.length}`);
  //   console.log(`Alley polygon array count: ${alleyArray.length}`); */
  //   // SET ROWLENGTH ARRAY
  //   const rowLengthArray: number[] = [];
  //   for (let i = 0; i < rowArray.length; i++) {
  //     const rowLength1 = turfLength(rowArray[i], { units: 'meters' });
  //     rowLengthArray.push(rowLength1);
  //     /*
  //                             console.log(rowArray[i].geometry.coordinates);
  //         */
  //   }
  //   // PUSH TO ROW ARRAY
  //   /*                rowArray.push(scaledLengthLineBearing);
  //                     rowArray.push(finalLengthLineBearing.features[1]); */
  //   // DO DISTANCE CHECK FOR ROW ARRAY OFFSET
  //   /* var rotatedCheckLine = transformRotate(rowArray[0], 90);
  //      var splitCheckLine = lineSplit(rotatedCheckLine, rowArray[0]);
  //      var distanceCheckLine = lineSplit(splitCheckLine.features[1], rowArray[1]);
  //      var checkDistance = turfLength(distanceCheckLine.features[0], {units: "meters"});
  //      console.log("Distance check " + checkDistance); */
  //   // CREATE FEATURECOLLECTION FOR ROWS

  //   const layout_rowLineCollection = turf.featureCollection(rowArray);
  //   // CREATE FEATURE COLLECTION FOR EDGEROWS
  //   /*    var edgeRowFeatureCollection = turf.featureCollection(edgeRowArray);
  //     var edgeRowCollection = JSON.stringify(edgeRowFeatureCollection); */
  //   // OFFSET LINE
  //   /*               var offsetline = lineOffset(line, -(3),{units: "meters"});
  //                    var rowPoints = lineIntersect(offsetline, offsetPolygon);
  //                    var row = turf.lineString([[rowPoints.features[0].geometry.coordinates[0],rowPoints.features[0].geometry.coordinates[1]],[rowPoints.features[1].geometry.coordinates[0],rowPoints.features[1].geometry.coordinates[1]]],{name: "line-2"});
  //                    var stringline = JSON.stringify(row);
  //                    var stringbox = JSON.stringify(box); */
  //   // CLEAN DATASET FROM ANNUALS - ONLY WORKS IF ANNUALS IN FIRST POSITION
  //   const treeRows: {
  //     sequence: {
  //         species: ISpeciesSchema;
  //         spacingAfter: number;
  //         position?: number;
  //       }[];
  //       width: number;
  //     }[] = [];
  //   for (let i = 0; i < systemRows.length; i++) {
  //     if (!(systemRows[i].groundcover?.form === 'grass')) {
  //       // console.log('dataset[i]', dataset[i]);
  //       treeRows.push(systemRows[i]);
  //     }
  //   }
  //   // CYCLE THROUGH ALL ROWS TO FIND SYSTEM LENGTH
  //   let systemModelLength = 0;
  //   for (let i = 0; i < systemRows.length; i++) {
  //     if (absolutePosition(systemRows[i].sequence, systemRows[i].sequence.length - 1) > systemModelLength) {
  //       systemModelLength = absolutePosition(systemRows[i].sequence, systemRows[i].sequence.length - 1);
  //     }
  //   }
  //   // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
  //   let treeRowCount = 0;
  //   //   const treeCountArray: any[] = [];
  //   const treeMarkerArray: turf.Feature<turf.Point, turf.Properties>[] = [];
  //   const treeAssetArray: {
  //     species: string;
  //     lat: number;
  //     lng: number;
  //     name: string;
  //   }[] = [];
  //   const treeAssetRowRef: number[] = [];
  //   const treeArray: ISpeciesSchema[] = [];
  //   //   let treeRowArea = 0;
  //   for (let i = 0; i < rowArray.length; i++) {
  //     // COUNT SYSTEM MODEL ITERATIONS IN ROW
  //     const rowLength = turfLength(rowArray[i], { units: 'meters' });
  //     // IF POSITION y IS 1, USE NEXT ROW TO FIND SYSTEM MODEL LENGTH?! THIS IS ONLY TEMP SOLUTION
  //     /* var systemModelLength = 0;
  //         if(dataset[0].sequence[(dataset[0].sequence.length - 1)].position <= 1){
  //             systemModelLength = dataset[1].sequence[(dataset[1].sequence.length - 1)].position;
  //         } else {
  //             systemModelLength = dataset[0].sequence[(dataset[0].sequence.length - 1)].position;
  //         } */
  //     const systemModelCount = Math.floor(rowLength / systemModelLength);
  //     const systemModelRowRest = ((rowLength / systemModelLength) - Math.floor(rowLength / systemModelLength)) * systemModelLength;
  //     // CALCULATE AREA
  //     // treeRowArea += rowLength * treeRows[treeRowCount].width;
  //     // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
  //     /*
  //     console.log(`Position: ${treeRows[treeRowCount].sequence[(treeRows[treeRowCount].sequence.length) - 1].position}`);
  // */
  //     if (!(absolutePosition(treeRows[treeRowCount].sequence, (treeRows[treeRowCount].sequence.length) - 1) < systemModelLength)) {
  //       treeArray.push(treeRows[treeRowCount].sequence[(treeRows[treeRowCount].sequence.length) - 1].species);
  //       const firstTreeMarker = turf.point(rowArray[i].geometry.coordinates[0]);
  //       treeMarkerArray.push(firstTreeMarker);
  //       // ASSET ARRAY
  //       const asset = {
  //         species: treeRows[treeRowCount].sequence[(treeRows[treeRowCount].sequence.length) - 1].species.id,
  //         form: treeRows[treeRowCount].sequence[
  //           treeRows[treeRowCount].sequence.length - 1
  //         ].species.form,
  //         lat: firstTreeMarker.geometry.coordinates[0],
  //         lng: firstTreeMarker.geometry.coordinates[1],
  //         name: treeRows[treeRowCount].sequence[(treeRows[treeRowCount].sequence.length) - 1].species.nameCommon,
  //       };

  //       console.log(asset);

  //       treeAssetArray.push(asset);
  //       treeAssetRowRef.push(i);
  //     }
  //     // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
  //     for (let j = 0; j < systemModelCount; j++) {
  //       for (let k = 0; k < treeRows[treeRowCount].sequence.length; k++) {
  //         // ADD TREE SPECIES TO COUNT ARRAY
  //         treeArray.push(treeRows[treeRowCount].sequence[k].species);
  //         // CREATE TREE POINTS FOR MARKERS
  //         const treeMarker = along(rowArray[i], (j * systemModelLength + absolutePosition(treeRows[treeRowCount].sequence, k)), { units: 'meters' });
  //         treeMarkerArray.push(treeMarker);
  //         // ASSET ARRAY
  //         const asset = {
  //           species: treeRows[treeRowCount].sequence[k].species.id,
  //           form: treeRows[treeRowCount].sequence[k].species.form,

  //           lat: treeMarker.geometry.coordinates[0],
  //           lng: treeMarker.geometry.coordinates[1],
  //           name: treeRows[treeRowCount].sequence[k].species.nameCommon,
  //         };
  //         treeAssetArray.push(asset);
  //         treeAssetRowRef.push(i);
  //       }
  //     }
  //     // ADD REST
  //     for (let j = 0; j < treeRows[treeRowCount].sequence.length; j++) {
  //       if (absolutePosition(treeRows[treeRowCount].sequence, j) < systemModelRowRest) {
  //         treeArray.push(treeRows[treeRowCount].sequence[j].species);
  //         // ADD POINT MARKER FOR REMAINING TREES
  //         const treeMarker2 = along(rowArray[i], (systemModelCount * systemModelLength + absolutePosition(treeRows[treeRowCount].sequence, j)), { units: 'meters' });
  //         treeMarkerArray.push(treeMarker2);
  //         // ASSET ARRAY
  //         const asset = {
  //           species: treeRows[treeRowCount].sequence[j].species.id,
  //           form: treeRows[treeRowCount].sequence[j].species.form,

  //           lat: treeMarker2.geometry.coordinates[0],
  //           lng: treeMarker2.geometry.coordinates[1],
  //           name: treeRows[treeRowCount].sequence[j].species.nameCommon,
  //         };
  //         treeAssetArray.push(asset);
  //         treeAssetRowRef.push(i);
  //       }
  //     }
  //     // ALIGN ROW ARRAY WITH SYSTEM ROWS (I.E. START NEW ROW MODEL COUNT.) AND REST LAST ROW
  //     if (treeRowCount >= treeRows.length - 1) {
  //       treeRowCount = 0;
  //     } else {
  //       treeRowCount += 1;
  //     }
  //   }
  //   /* console.log(treeArray.length);
  //   console.log(treeMarkerArray.length); */
  //   // DO POINT COLLECTION
  //   const treeCanopyArray: turf.Feature<turf.Polygon, turf.Properties>[] = [];
  //   if (treeMarkerArray.length < 5000) {
  //     for (let i = 0; i < treeMarkerArray.length; i++) {
  //       const circle1 = circle(treeMarkerArray[i].geometry.coordinates, 2, { units: 'meters' });
  //       treeCanopyArray.push(circle1);
  //     }
  //   }
  //   // const layout_offsetArrayCollection: any[] = []; // CAN DELETE THIS AT SOME POINT. JUST USED IT TO ENSURE VIZ OF LINES IN LAYOUT ANGLED WAS WORKING

  //   const layout_treeMarkerCollection = turf.featureCollection(treeCanopyArray);
  //   // CALCULATE TREE COUNT
  //   //   const areaSize = project.layer.size;
  //   // GRID SIZE
  //   //   const areaGrid = rowWidth * dataset[0].sequence[(dataset[0].sequence.length - 1)].position; // CHECK THAT THIS IS WORKING
  //   //   const gridCount = areaSize / areaGrid;
  //   // COPY ALL SPECIES

  //   const allSpecies: string[] = [];
  //   project.systemdesign.rows.forEach((row) => {
  //     row.sequence.forEach((sequenceElement) => {
  //       allSpecies.push(sequenceElement.species.nameCommon);
  //     });
  //   });

  //   const allSpeciesCopy: string[] = [];
  //   for (let i = 0; allSpecies.length > i; i++) {
  //     allSpeciesCopy.push(allSpecies[i]);
  //   }
  //   // FIND UNIQUE SPECIES / REMOVE DUPLICATES
  //   const uniqueSpecies = [...new Set(allSpeciesCopy)];
  //   // UNIQUE ITEM COUNTS
  //   const uniqueSpeciesCount: {
  //     id: string;
  // 		_id: string
  //     uniqueCount: number;
  //   }[] = [];
  //   for (let i = 0; uniqueSpecies.length > i; i++) {
  //     let count = 0;
  //     let form;
  //     let _id;
  //     for (let j = 0; j < treeArray.length; j++) {
  //       if (treeArray[j].nameCommon === uniqueSpecies[i]) {
  //         count += 1;
  //         form = treeArray[j].form;
  //         _id = treeArray[j].id;
  //       }
  //     }
  //     const speciesCount = {
  //       id: uniqueSpecies[i],
  //       form,
  //       _id,
  //       uniqueCount: count,
  //     };
  //     uniqueSpeciesCount.push(speciesCount);
  //   }
  //   const layout_uniqueSpeciesCount = uniqueSpeciesCount;
  //   const uniqueTreeSpecies = [...new Set(treeArray)];
  //   const layout_uniqueSpecies = uniqueTreeSpecies;
  //   // UNIQUE AREA COUNT

  //   /* // CHECK LENGTH OF LINE BEFORE CUTTING
  //     var checkLine = turf.lineString([polygon.geometry.coordinates[0][1],polygon.geometry.coordinates[0][2]],{name: "checkLine"});
  //     var checkLength = turfLength(checkLine, {units: "meters"});
  //     console.log(checkLength + " meters long"); */
  //   // CALCULATE MARGIN AREA
  //   //   const marginArea = area(polygon) - area(offsetPolygon);

  //   // Edge System
  //   const { edgeTreeCanopyArray, edgeRowArray } = createEdge(project, calibrateDistance, polygon);
  //   rowArray.concat(edgeRowArray);
  //   treeCanopyArray.concat(edgeTreeCanopyArray);

  //   // CREATE Return OBJECT
  //   const layout_rowLineArray = rowArray;
  //   const layout_treeAssetRowRef = treeAssetRowRef;
  //   const layout_treeArray = treeArray;
  //   const layout_treeMarkerArray = treeCanopyArray;
  //   const layout_treeAssetArray = treeAssetArray;

  //   return {
  //     alleyPolygonArray: layout_alleyPolygonArray,
  //     bedPolygonArray: layout_bedPolygonArray,
  //     bedPolygonCollection: layout_bedPolygonCollection,

//     // offsetArrayCollection: layout_offsetArrayCollection,
//     rowLineArray: layout_rowLineArray,
//     rowLineCollection: layout_rowLineCollection,
//     sortedrows: layout_sortedrows,
//     treeArray: layout_treeArray,
//     treeAssetArray: layout_treeAssetArray,
//     treeAssetRowRef: layout_treeAssetRowRef,
//     treeMarkerArray: layout_treeMarkerArray,
//     treeMarkerCollection: layout_treeMarkerCollection,
//     treeRowArea: layout_treeRowArea,
//     uniqueSpeciesCount: layout_uniqueSpeciesCount,
//     uniqueSpecies: layout_uniqueSpecies,
//   };
}
