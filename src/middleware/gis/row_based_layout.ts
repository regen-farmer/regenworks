import {
  helpers as turf,
  length as turfLength,

  along,
  circle,
} from '@turf/turf';
import _ from 'lodash';
import { IProjectSchema } from '../../models/project.js';
import { ISpeciesSchema } from '../../models/species.js';

export function rowBasedLayout(project: IProjectSchema) {
  //

  // SORT FIRST ROW ITEMS

  // VIZ ROWS
  const allSpecies: string[] = [];
  const rowArray: any[] = [];
  const placesArray: turf.Feature<turf.Point, {
    description: string;
  }>[] = [];
  for (let i = 0; i < project.rows.length; i++) {
    // ROW VIZ
    const rowGeometry = JSON.parse(project.rows[i].geometry);
    rowArray.push(rowGeometry);
    // PLACES
    const properties = {
      description: project.rows[i].name,
    };
    const place = turf.point(rowGeometry.geometry.coordinates[1], properties);
    placesArray.push(place);
  }
  // ROW LABELS (BEFORE ROWS ARE PARSED)
  //   const placesCollection = turf.featureCollection(placesArray);
  //   const places = JSON.stringify(placesCollection);
  // CREATE PLACES FEATURE
  const layout_rowLineArray = rowArray;
  const layout_rowLineCollection = turf.featureCollection(rowArray);
  /*
    var collection = JSON.stringify(featurecollection);
*/
  // COUNT ASSETS IN ROW SYSTEMS - ONLY TAKE FIRST ROW?!
  /* for(let i=0;i<foundLayer.rows.length;i++){
        for(let j=0;j<foundLayer.rows[i].system.model.length;j++){
            foundLayer.rows[i].system.populate("model." + j + ".species");
        }
    } */
  // MAYBE RENAME THIS ONE!?!
  const treeAssetsArray: {
    marker: turf.Feature<turf.Point, turf.Properties>;
    species: ISpeciesSchema;
  }[] = [];
  // SET COLLECTIVE TREE ARRAY
  const treeMarkerArray: turf.Feature<turf.Point, turf.Properties>[] = [];
  const treeAssetArray: {
      species: string;
      lat: number;
      lng: number;
      name: string;
  }[] = [];
  const treeAssetRowRef: number[] = [];
  const treeArray: ISpeciesSchema[] = [];
  // FIND SYSTEM ROWS
  for (let i = 0; i < project.rows.length; i++) {
    // SET ROW DATA
    if (project.rows[i].sequence) {
      const datasetRows = project.rows[i].sequence.model;
      project.rows[i].sequence.model.forEach((species) => {
        allSpecies.push(species.species.nameCommon);
        /* var count = 0;
                for (j = 0; j < datasetRows.length; j++) {
                    if (datasetRows[j].row === species.position[0]) {
                        datasetRows[j].sequence.push(species);
                        count = count + 1;
                    }
                }
                if (count === 0) {
                    datasetRows.push({row: species.position[0], array: [species]});
                } */
      });

      // ROW LENGTH
      const rowLine = JSON.parse(project.rows[i].geometry);
      const rowLength = turfLength(rowLine, { units: 'meters' });
      console.log(`Row length ${rowLength}`);
      // SYSTEM MODEL LENGTH
      const systemModelLength = project.rows[i].sequence.sequencelength;
      /* if (datasetRows[0].sequence[(datasetRows[0].sequence.length - 1)].position <= 1) {
                systemModelLength = datasetRows[1].sequence[(datasetRows[1].sequence.length - 1)].position;
            } else {
                systemModelLength = datasetRows[0].sequence[(datasetRows[0].sequence.length - 1)].position;
            } */
      console.log(`System model length:${systemModelLength}`);
      // FIND MODEL COUNT AND REST
      const systemModelCount = Math.floor(rowLength / systemModelLength);
      const systemModelRowRest = ((rowLength / systemModelLength) - Math.floor(rowLength / systemModelLength)) * systemModelLength;
      // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
      const firstTreeMarker = turf.point(rowLine.geometry.coordinates[0]);
      treeMarkerArray.push(firstTreeMarker);
      const firstAsset = {
        marker: firstTreeMarker,
        species: datasetRows[(datasetRows.length - 1)].species,
      };
      treeAssetsArray.push(firstAsset);
      treeArray.push(datasetRows[(datasetRows.length - 1)].species);
      // ASSET ARRAY
      const firstTreeAsset = {
        species: datasetRows[(datasetRows.length - 1)].species.id,
        lat: firstTreeMarker.geometry.coordinates[0],
        lng: firstTreeMarker.geometry.coordinates[1],
        name: datasetRows[(datasetRows.length - 1)].species.nameCommon,
      };
      treeAssetArray.push(firstTreeAsset);
      treeAssetRowRef.push(i);
      // ROW MARKERS
      // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
      for (let j = 0; j < systemModelCount; j++) {
        for (let k = 0; k < datasetRows.length; k++) {
          // CREATE COORDINATES FOR THE TREE
          const treeMarker = along(rowLine, (j * systemModelLength + datasetRows[k].position), { units: 'meters' });
          //
          const asset = {
            marker: treeMarker,
            species: datasetRows[k].species,
          };
          // ADD TREE OBJECT TO ARRAY
          treeMarkerArray.push(treeMarker);
          treeAssetsArray.push(asset);
          treeArray.push(datasetRows[k].species);
          // ASSET ARRAY
          const treeAsset1 = {
            species: datasetRows[k].species.id,
            lat: treeMarker.geometry.coordinates[0],
            lng: treeMarker.geometry.coordinates[1],
            name: datasetRows[k].species.nameCommon,
          };
          treeAssetArray.push(treeAsset1);
          treeAssetRowRef.push(i);
        }
      }
      // ADD REST
      for (let j = 0; j < datasetRows.length; j++) {
        if (datasetRows[j].position < systemModelRowRest) {
          /*
                                                            treeArray.push(treeRows[treeRowCount].sequence[j].species);
                    */
          // ADD POINT MARKER FOR REMAINING TREES
          const treeMarker2 = along(rowLine, (systemModelCount * systemModelLength + datasetRows[j].position), { units: 'meters' });
          const asset2 = {
            marker: treeMarker2,
            species: datasetRows[j].species,
          };
          treeMarkerArray.push(treeMarker2);
          treeAssetsArray.push(asset2);
          treeArray.push(datasetRows[j].species);
          // ASSET ARRAY
          const treeAsset2 = {
            species: datasetRows[j].species.id,
            lat: treeMarker2.geometry.coordinates[0],
            lng: treeMarker2.geometry.coordinates[1],
            name: datasetRows[j].species.nameCommon,
          };
          treeAssetArray.push(treeAsset2);
          treeAssetRowRef.push(i);
        }
      }
    }
  }
  // DO POINT COLLECTION
  const treeCanopyArray: turf.Feature<turf.Polygon, turf.Properties>[] = [];
  //   const vegeCanopyArray = [];
  if (treeAssetsArray.length < 5000) {
    for (let i = 0; i < treeAssetsArray.length; i++) {
      // FIND TREE DIMENSIONS
      const diameter = 2;
      /* if(treeAssetsArray[i].species.form === "shrub" || treeAssetsArray[i].species.form === "giantherb" ){
                diameter = 0.2;
            } else if (treeAssetsArray[i].species.form === "herb"){
                diameter = 0.1;
            } */
      const circle1 = circle(treeAssetsArray[i].marker.geometry.coordinates, diameter, { units: 'meters' });
      treeCanopyArray.push(circle1);
      // SYNTROPIC CLASS HERE
      /*
            if(treeAssetsArray[i].species.height > 15){
                treeCanopyArray.push(circle1);
            } else {
                vegeCanopyArray.push(circle1);
            } */
    }
  }
  const layout_treeAssetRowRef = treeAssetRowRef;
  const layout_treeArray = treeAssetsArray;
  const layout_treeAssetArray = treeAssetArray;
  const layout_treeMarkerArray = treeCanopyArray;
  const layout_treeMarkerCollection = turf.featureCollection(treeCanopyArray);
  /*
    var treeCollection = JSON.stringify(treeMarkers);
*/
  // INSERT SYSTEM CLASSIFICATION
  //   const vegeMarkers = turf.featureCollection(vegeCanopyArray);
  /*
    var vegeCollection = JSON.stringify(vegeMarkers);
*/
  // DO TREE NAMES COLLECTION
  const treenames: turf.Feature<turf.Point, {
    description: string;
  }>[] = [];
  for (let i = 0; i < treeAssetsArray.length; i++) {
    const properties1 = {
      description: treeAssetsArray[i].species.nameCommon.slice(0, 3),
    };
    const treename = turf.point(treeAssetsArray[i].marker.geometry.coordinates, properties1);
    treenames.push(treename);
  }
  const layout_treeNameLabelCollection = turf.featureCollection(treenames);
  /*
    var treeNameCollection = JSON.stringify(treenamemarks);
*/
  // VIZ ROWS
  const alleyPolygonArray: turf.Feature<turf.Polygon, {
    name: string;
  }>[] = [];
  const bedPolygonArray: turf.Feature<turf.Polygon, {
    name: string;
  }>[] = [];
  const alleySpeciesArray: ISpeciesSchema[][] = [];
  for (let i = 0; i < project.areas.length; i++) {
    // ROW VIZ
    const areaGeometry = JSON.parse(project.areas[i].geometry);
    if (project.areas[i].name.charAt(0) === 'A') {
      alleyPolygonArray.push(areaGeometry);
      // ADD SPECIES TO ALLEY ARRAY
      if (project.areas[i].rotation && project.areas[i].rotation.model.length > 0) {
        const alleySpeciesCount: ISpeciesSchema[] = [];
        for (let j = 0; j < project.areas[i].rotation.model.length; j++) {
          // ADD SPECIES TO ALLEY ARRAY
          alleySpeciesCount.push(project.areas[i].rotation.model[j].speciesmix[0].species);
        }
        alleySpeciesArray.push(alleySpeciesCount);
      }
    } else if (project.areas[i].name.charAt(0) === 'T' || project.areas[i].name.charAt(0) === 'W') {
      bedPolygonArray.push(areaGeometry);
    } else {
      alleyPolygonArray.push(areaGeometry);
    }
  }
  const layout_treeRowArea = 0; // CHANGE THIS LATER ON WHEN AREAS ARE WORKING
  const layout_bedPolygonArray = bedPolygonArray; // POPULATE THIS AS WELL WITH AREA
  const layout_alleyPolygonArray = alleyPolygonArray;
  const layout_alleySpeciesArray = alleySpeciesArray;
  console.log(`Alley species array count: ${alleySpeciesArray.length}`);
  console.log(`Alley polygon array count: ${alleyPolygonArray.length}`);
  // COUNT ASSETS

  // COMBINE ASSETS AND ROW BASED

  // COPY ALL SPECIES
  const allSpeciesCopy: string[] = [];
  for (let i = 0; allSpecies.length > i; i++) {
    allSpeciesCopy.push(allSpecies[i]);
  }
  // FIND UNIQUE SPECIES / REMOVE DUPLICATES
  const uniqueSpecies = [...new Set(allSpeciesCopy)];
  // UNIQUE ITEM COUNTS
  const uniqueSpeciesCount: {
    id: string;
    uniqueCount: number;
  }[] = [];
  for (let i = 0; uniqueSpecies.length > i; i++) {
    let count = 0;
    for (let j = 0; j < treeAssetsArray.length; j++) {
      if (treeAssetsArray[j].species.nameCommon === uniqueSpecies[i]) count += 1;
    }
    const speciesCount = {
      id: uniqueSpecies[i],
      uniqueCount: count,
    };
    uniqueSpeciesCount.push(speciesCount);
  }
  const layout_uniqueSpeciesCount = uniqueSpeciesCount;
  const uniqueTreeSpecies = [...new Set(treeArray)];
  const layout_uniqueSpecies = uniqueTreeSpecies;
  // JUST SEND BLANK
  const layout_offsetArray: any[] = [];

  return {
    alleyPolygonArray: layout_alleyPolygonArray,
    alleySpeciesArray: layout_alleySpeciesArray,
    bedPolygonArray: layout_bedPolygonArray,
    offsetArray: layout_offsetArray,
    rowLineArray: layout_rowLineArray,
    rowLineCollection: layout_rowLineCollection,
    uniqueSpecies: layout_uniqueSpecies,
    uniqueSpeciesCount: layout_uniqueSpeciesCount,
    treeAssetArray: layout_treeAssetArray,
    treeAssetRowRef: layout_treeAssetRowRef,
    treeArray: layout_treeArray,
    treeMarkerArray: layout_treeMarkerArray,
    treeMarkerCollection: layout_treeMarkerCollection,
    treeNameLabelCollection: layout_treeNameLabelCollection,
    treeRowArea: layout_treeRowArea,
  };
}
