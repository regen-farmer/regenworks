import {
  helpers as turf, length as turfLength, buffer, polygonToLine, circle, along,
} from '@turf/turf';
import { IProjectSchema } from '../../models/project';
import { ISpeciesSchema } from '../../models/species';

export function createEdgeSystem(project: IProjectSchema, calibrateDistance:number, polygon:any) {
  // EDGE WORK - Start
  const edgeRowDataset: {row: number, array: {
    species: ISpeciesSchema;
    position: number[];
    width: number;
}[]}[] = [];
  if (project.edgesystem) {
    // CALCULATE WIDTH - REFACTOR INTO MIDDLEWARE. USED TWICE IN THIS ROUTE
    project.edgesystem.model.forEach((species) => {
      let count = 0;
      for (let i = 0; i < edgeRowDataset.length; i++) {
        if (edgeRowDataset[i].row === species.position[0]) {
          edgeRowDataset[i].array.push(species);
          count += 1;
        }
      }
      if (count === 0) {
        edgeRowDataset.push({ row: species.position[0], array: [species] });
      }
    });
    // ADD ALL ROWS TO WIDTH
    let edgeRowWidth = 0;
    for (let i = 0; i < edgeRowDataset.length; i++) {
      edgeRowWidth += edgeRowDataset[i].array[0].width;
    }
    // ADD EDGE SYSTEM WIDTH TO HEADLAND
    project.systemdesign.margin += edgeRowWidth;
  }
  /*
  console.log(`headland plus perimeter system: ${headland}`);
*/

  // CREATE PERIMETER ROWS CENTER
  const edgeRowWidthArray: number[] = [];
  for (let i = 0; i < edgeRowDataset.length; i++) {
    let edgeRowArrayWidth = 0;
    if (i === 0) {
      edgeRowArrayWidth = edgeRowDataset[i].array[0].width / 2;
    } else {
      edgeRowArrayWidth = edgeRowDataset[i].array[0].width / 2 + edgeRowDataset[i - 1].array[0].width / 2;
    }
    edgeRowWidthArray.push(edgeRowArrayWidth);
  }
  // CREATE EDGE ROW LINES
  const edgeRowArray: any[] = [];
  let edgeRowDistance = 0;
  for (let i = 0; i < edgeRowWidthArray.length; i++) {
    edgeRowDistance += edgeRowWidthArray[i];
    const offsetEdgeRowPolygon = buffer(polygon, -edgeRowDistance * calibrateDistance, { units: 'meters' });
    const offsetEdgeRow = polygonToLine(offsetEdgeRowPolygon);
    edgeRowArray.push(offsetEdgeRow);
  }
  // CREATE EDGE ROW MARKERS AND TREE COUNTS
  const edgeTreeMarkerArray: turf.Feature<turf.Point, turf.Properties>[] = [];
  const edgeTreeArray: ISpeciesSchema[] = []; // MIGHT NOT USE BEFORE I NEED THE ASSETS. MIGHT NEED FOR TREE COUNTS THOUGH
  // CREATE TREES FOR EACH EDGE ROW
  for (let i = 0; i < edgeRowArray.length; i++) {
    // COUNT EDGE SYSTEM MODEL ITERATIONS IN ROW
    const edgeRowLength = turfLength(edgeRowArray[i], { units: 'meters' });
    // SET LENGTH AS LAST IN ROW SPECIES Y COORDINATE
    let edgeSystemModelLength = 0;
    edgeSystemModelLength = edgeRowDataset[0].array[(edgeRowDataset[0].array.length - 1)].position[1];
    const edgeSystemModelCount = Math.floor(edgeRowLength / edgeSystemModelLength);
    // const edgeSystemModelRowRest = ((edgeRowLength / edgeSystemModelLength) - Math.floor(edgeRowLength / edgeSystemModelLength)) * edgeSystemModelLength;
    // ITERATE FOR EACH MODEL COUNT
    for (let j = 0; j < edgeSystemModelCount; j++) {
      // CREATE TREE FOR EACH SPECIES IN MODEL
      for (let k = 0; k < edgeRowDataset[i].array.length; k++) {
        // ADD TREE SPECIES TO COUNT ARRAY
        edgeTreeArray.push(edgeRowDataset[i].array[k].species);
        // CREATE TREE POINTS FOR MARKERS
        const edgeTreeMarker = along(edgeRowArray[i], ((j * edgeSystemModelLength) + edgeRowDataset[i].array[k].position[1]), { units: 'meters' });
        edgeTreeMarkerArray.push(edgeTreeMarker);
      }
    }
    // ADD REST
  }
  /*  console.log(`Edge tree markers: ${edgeTreeMarkerArray.length}`);
  console.log(`Edge trees: ${edgeTreeArray.length}`); */
  // DO POINT COLLECTION
  const edgeTreeCanopyArray: turf.Feature<turf.Polygon, turf.Properties>[] = [];
  // SET MAX LIMIT FOR AMOUNT OF TREES
  if (edgeTreeMarkerArray.length < 1500) {
    for (let i = 0; i < edgeTreeMarkerArray.length; i++) {
      const circle5 = circle(edgeTreeMarkerArray[i].geometry.coordinates, 0.5, { units: 'meters' });
      edgeTreeCanopyArray.push(circle5);
    }
  }
  /* var edgeTreeMarkers = turf.featureCollection(edgeTreeCanopyArray);
    var edgeTreeCollection = JSON.stringify(edgeTreeMarkers); */
  // COPY ALL EDGE ROW SPECIES
  const allEdgeSpeciesCopy: ISpeciesSchema[] = [];
  for (let i = 0; edgeTreeArray.length > i; i++) {
    allEdgeSpeciesCopy.push(edgeTreeArray[i]);
  }
  // FIND UNIQUE SPECIES / REMOVE DUPLICATES
  const uniqueEdgeSpecies = [...new Set(allEdgeSpeciesCopy)];
  // UNIQUE ITEM COUNTS
  const uniqueEdgeSpeciesCount: {
    id: string;
    uniqueCount: number;
}[] = [];

  for (let i = 0; uniqueEdgeSpecies.length > i; i++) {
    let edgecount = 0;
    for (let j = 0; j < edgeTreeArray.length; j++) {
      if (edgeTreeArray[j].nameCommon === uniqueEdgeSpecies[i].nameCommon) {
        edgecount += 1;
      }
    }
    const speciesCount = {
      id: uniqueEdgeSpecies[i].nameCommon,
      uniqueCount: edgecount,
    };
    uniqueEdgeSpeciesCount.push(speciesCount);
  }
  /*
  console.log(`Unique Species in edge: ${uniqueEdgeSpeciesCount.length}`);
*/

  return { edgeTreeCanopyArray, edgeRowArray };
  // EDGE WORK - End
}
