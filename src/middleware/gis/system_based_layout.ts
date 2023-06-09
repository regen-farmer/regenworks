import {
  bbox,
  bboxPolygon,
  helpers as turf,
  length as turfLength,
  buffer,
  transformRotate,
  lineSplit,
  along,
  circle,
  bearing,
} from "@turf/turf";
import { IProjectSchema } from "../../models/project";
import { ISpeciesSchema } from "../../models/species";
import { makeInitialLine } from "./make_line";
import { makeTreeRowLines } from "./make_tree_row_lines";
import { makeGroundCoverAreas } from "./make_ground_cover_areas";
import { applyHeadland } from "./headland";

export function systemBasedLayout(project: IProjectSchema) {
  const systemRows = project.systemdesign.rows;

  const polygon = JSON.parse(project.layer.geometry);
  const boxCalibrate = bboxPolygon(bbox(polygon));

  const lineCalibrate = turf.lineString(
    [
      boxCalibrate.geometry.coordinates[0][2],
      boxCalibrate.geometry.coordinates[0][3],
    ],
    { name: "line-35" }
  );
  const lineOffsetCalibrate = buffer(lineCalibrate, 10, { units: "meters" });
  const rotatedCalibrateLine = transformRotate(lineCalibrate, 90);
  const splitCalibrateLine = lineSplit(rotatedCalibrateLine, lineCalibrate);
  const distanceCalibrateLine = lineSplit(
    splitCalibrateLine.features[1],
    lineOffsetCalibrate
  );
  const calibrateDistance =
    10 / turfLength(distanceCalibrateLine.features[0], { units: "meters" });
  console.log(`Distance check ${calibrateDistance}`);

  // MARGIN
  const marginPolygon = buffer(
    polygon,
    -project.systemdesign.margin * calibrateDistance,
    { units: "meters" }
  );

  // HEADLAND
  const {
    headlandSides,
    headlandPolygon,
    sidesCloseToBearing,
    intersectionPoints,
  } = applyHeadland(
    marginPolygon,
    calibrateDistance,
    project.systemdesign.headland,
    project.systemdesign.bearing
  );

  const {
    lineIntersectingPolygon: lineIntersectingAreaInsideMargin,
    widthOfPolygon: widthOfAreaInsideMargin,
  } = makeInitialLine(project.systemdesign.bearing, headlandPolygon);

  // TREE ROW LINES
  const treeRowLines = makeTreeRowLines(
    headlandPolygon,
    calibrateDistance,
    lineIntersectingAreaInsideMargin,
    widthOfAreaInsideMargin,
    project.systemdesign.rows
  );

  // GROUND COVER AREAS
  const groundCoverAreas = makeGroundCoverAreas(
    headlandPolygon,
    calibrateDistance,
    lineIntersectingAreaInsideMargin,
    widthOfAreaInsideMargin,
    project.systemdesign.rows
  );

  // INDIVIDUAL TREES
  const treeMarkerArray: {
    species: ISpeciesSchema;
    point: turf.Feature<turf.Point, turf.Properties>;
    circle: turf.Feature<turf.Polygon, turf.Properties>;
  }[] = [];

  treeRowLines.forEach((treeRowLine, i) => {

    if (
      systemRows[treeRowLine.systemDesignRowIndex].sequence.reduce(
        (acc, curr) => acc + curr.spacingAfter,
        0
      ) > 0
    ) {
      const sequence = systemRows[treeRowLine.systemDesignRowIndex].sequence;
      let treeSequenceIdx = 0;
      let distance = 0;
      while (distance < turfLength(treeRowLine.line, { units: "meters" })) {
        const point = along(treeRowLine.line, distance, { units: "meters" });

        const newCircle = circle(point.geometry.coordinates, 2, {
          units: "meters",
        });
        treeMarkerArray.push({
          species: sequence[treeSequenceIdx].species,
          point,
          circle: newCircle,
        });
        distance += sequence[treeSequenceIdx].spacingAfter;
        treeSequenceIdx = (treeSequenceIdx + 1) % sequence.length;
      }
    }
  });

  // CALCULATE TREE COUNT
  //   const areaSize = project.layer.size;
  // GRID SIZE
  //   const areaGrid = rowWidth * dataset[0].sequence[(dataset[0].sequence.length - 1)].position; // CHECK THAT THIS IS WORKING
  //   const gridCount = areaSize / areaGrid;
  // COPY ALL SPECIES

  // const allSpecies: string[] = [];
  // project.systemdesign.rows.forEach((row) => {
  //   row.sequence.forEach((sequenceElement) => {
  //     allSpecies.push(sequenceElement.species.nameCommon);
  //   });
  // });

  // const allSpeciesCopy: string[] = [];
  // for (let i = 0; allSpecies.length > i; i++) {
  //   allSpeciesCopy.push(allSpecies[i]);
  // }
  // // FIND UNIQUE SPECIES / REMOVE DUPLICATES
  // const uniqueSpecies = [...new Set(allSpeciesCopy)];
  // // UNIQUE ITEM COUNTS
  // const uniqueSpeciesCount: {
  //   id: string;
  // 	_id: string
  //   uniqueCount: number;
  // }[] = [];
  // for (let i = 0; uniqueSpecies.length > i; i++) {
  //   let count = 0;
  //   let form;
  //   let _id;
  //   for (let j = 0; j < treeArray.length; j++) {
  //     if (treeArray[j].nameCommon === uniqueSpecies[i]) {
  //       count += 1;
  //       form = treeArray[j].form;
  //       _id = treeArray[j].id;
  //     }
  //   }
  //   const speciesCount = {
  //     id: uniqueSpecies[i],
  //     form,
  //     _id,
  //     uniqueCount: count,
  //   };
  //   uniqueSpeciesCount.push(speciesCount);
  // }
  // const layout_uniqueSpeciesCount = uniqueSpeciesCount;
  // const uniqueTreeSpecies = [...new Set(treeArray)];
  // const layout_uniqueSpecies = uniqueTreeSpecies;

  // UNIQUE AREA COUNT

  /* // CHECK LENGTH OF LINE BEFORE CUTTING
      var checkLine = turf.lineString([polygon.geometry.coordinates[0][1],polygon.geometry.coordinates[0][2]],{name: "checkLine"});
      var checkLength = turfLength(checkLine, {units: "meters"});
      console.log(checkLength + " meters long"); */
  // CALCULATE MARGIN AREA
  //   const marginArea = area(polygon) - area(offsetPolygon);

  // // Edge System
  // const { edgeTreeCanopyArray, edgeRowArray } = createEdge(project, calibrateDistance, polygon);
  // rowArray.concat(edgeRowArray);
  // treeCanopyArray.concat(edgeTreeCanopyArray);

  return {
    headlandSides,
    sidesCloseToBearing,
    treeRowLines,
    headlandPolygon,
    marginPolygon,
    groundCoverAreas,
    intersectionPoints,
    treeMarkerArray,
  };
}
