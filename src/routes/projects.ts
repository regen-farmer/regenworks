import express from 'express';
import unique from 'array-unique';
import {
  helpers as turf, length as turfLength, circle,
} from '@turf/turf';
import PDFDocument from 'pdfkit';
import NodeGeocoder from 'node-geocoder';
import mongoose from 'mongoose';
import _ from 'lodash';
import Project from '../models/project';
import Layer from '../models/layer';
import System, { ISystemSchema } from '../models/system';
import Budget from '../models/budget';
import Activity from '../models/activity';
import Asset from '../models/asset';
import Posting, { IPostingSchema } from '../models/posting';
import Sequence from '../models/sequence';
import Rotation from '../models/rotation';
import Row from '../models/row';
import Area from '../models/area';
import middleware from '../middleware';
import { systemBasedLayout } from '../middleware/gis/system_based_layout';
import dyFiMo from '../middleware/financials';
import { UserDocument } from '../models/user';
import { Auth0IDToken } from '../app';
import Species, { ISpeciesSchema } from '../models/species';
import { rowBasedLayout } from '../middleware/gis/row_based_layout';
// import SystemDesign from '../models/systemdesign';

// =======
// var express = require("express");
// var router = express.Router();
// var unique = require("array-unique");
// import Parcel from "../models/parcel";
// import Project from "../models/project";
// import Practice from "../models/practice";
// import Layer from "../models/layer";
// import System from "../models/system";
// import Budget from "../models/budget";
// import Activity from "../models/activity";
// import Species from "../models/species";
// import Asset from "../models/asset";
// import Posting from "../models/posting";
// import Sequence from "../models/sequence";
// import Rotation from "../models/rotation";
// import Row from "../models/row";
// import Area from "../models/area";
// var geodist = require("geodist"); // TO CALCULATE DISTANCE BETWEEN COORDINATES
// var middleware = require("../middleware");
// var gisObj = require("../middleware/gis");
// var dyFiMo = require("../middleware/financials")
// var bbox = require("@turf/bbox");
// var bboxPolygon = require("@turf/bbox-polygon");
// var turf = require("@turf/helpers");
// var lineOffset = require("@turf/line-offset");
// var lineIntersect = require("@turf/line-intersect");
// var turfLength = require("@turf/length");
// var buffer = require("@turf/buffer");
// var rhumbBearing = require("@turf/rhumb-bearing");
// var transformScale = require("@turf/transform-scale");
// var transformRotate = require("@turf/transform-rotate");
// var lineSplit = require("@turf/line-split");
// var along = require("@turf/along");
// var circle = require("@turf/circle");
// var area = require("@turf/area");
// var polygonToLine = require("@turf/polygon-to-line");
// const PDFDocument = require("pdfkit");
// >>>>>>> ace12b8 (activity params in AF system model, created middleware for dynamic financial modelling, establishment budget and cash-flow budget added to new middleware)

// NODE GEOCODER CODE

const router = express.Router();

const options: NodeGeocoder.Options = {
  provider: 'google',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
};

const geocoder = NodeGeocoder(options);

// PROJECTS INDEX ROUTE
router.get('/projects', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // GET ALL USERS PROJECTS IN DB
  try {
    const allProjects = await Project.find({ 'owner.id': req.user?._id });
    res.send({ projects: allProjects });
  } catch (err) {
    console.log(err);
  }
});

// SERVICES NEW ROUTE
router.get('/projects/new', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  const place = undefined;
  res.send({ place });
});

// SERVICES CREATE ROUTE
router.post('/projects', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // Create a new project
  try {
    const service = await Project.create(req.body.project);
    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
    geocoder.geocode(req.body.service.location, async (err, data) => {
      if (err || !data.length) {
        console.log(err);
        return res.status(500).send({ error: `Error while geocoding: ${err.toString()}` });
      }

      const lat = data[0].latitude;
      const lng = data[0].longitude;
      const loc = data[0].formattedAddress;

      if (lat && lng && loc) {
        service.lat = lat;
        service.lng = lng;
        service.location = loc;
        // Add ID to experience
        service.owner.id = req.user?._id.toString()!;
        // Save the service - Not need if created after this step
        await service.save();
        // Redirect to projects INDEX page
        // req.flash("success", "Successfully added service");
        res.send('/projects');
      }
    });
  } catch (err) {
    console.log(err);
  }
});

// PROJECT EDIT ROUTE
router.get('/projects/:id/edit', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // MAKE SERVICE OWNERSHIP MIDDLEWARE
  // Find specific project in database
  try {
    const foundProject = await Project.findById(req.params.id);
    res.send({ project: foundProject });
  } catch (err) {
    console.log(err);
  }
});

// PROJECT LAYOUT EDIT ROUTE
router.get(
  '/projects/:id/layout',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    console.time('layoutRoute');
    try {


      console.time('getProject');
      const foundProject = await Project.findById(req.params.id)
        // .populate({ path: 'system', populate: { path: 'model.species' } })
        // .populate('edgesystem')
        .populate('layer')
        .populate('systemdesign')
        .populate({
          path: 'systemdesign',
          populate: { path: 'rows.sequence', populate: { path: 'species' } },
        })
        .populate({
          path: 'systemdesign',
          populate: { path: 'rows', populate: { path: 'groundcover' } },
        })
        // .populate({
        //   path: 'areas',
        //   populate: {
        //     path: 'rotation',
        //     populate: { path: 'model.speciesmix.species' },
        //   },
        // })
        .exec();
      console.timeEnd('getProject');

      if (!foundProject?.systemdesign) {
        res.send({ project: foundProject });
      }

      if (foundProject) {
        // CAN REMOVE THE TWO BELOW SYSTEMS AND JUST POPULATE IN ROUTE ABOVE
        // const foundSystemDesign = await SystemDesign.findById(foundProject.systemdesign)
        //   .populate('rows.sequence.species')
        //   .populate('rows.groundcover')
        //   .exec();
        // EDGE SYSTEM FIND, IF ONE
        // var edgesystem = '5e6639bc8add4f22f0820200'
        // if (foundProject.edgesystem) {
        //   edgesystem = foundProject.edgesystem
        // }
        // let foundEdgeSystem = await System.findById(edgesystem)
        //   .populate('model.species')
        //   .exec()

        // SET VARIABLES HERE
        console.time('systemBasedLayout');
        const layout = systemBasedLayout(foundProject);
        console.timeEnd('systemBasedLayout');
        res.send({
          project: foundProject,
          // system: foundSystem,
          treeRowLines: layout.treeRowLines,
          groundCoverAreas: turf.featureCollection(layout.groundCoverAreas),
          headlandPolygon: layout.headlandPolygon,
          marginPolygon: layout.marginPolygon,
          speciesCountArray: layout.speciesCountArray,

          sidesCloseToBearing: turf.featureCollection(layout.sidesCloseToBearing),
          intersectionPoints: turf.featureCollection(layout.intersectionPoints),
          headlandSides: turf.featureCollection(layout.headlandSides),
          treeMarkerArray: layout.treeMarkerArray,
          // combinedHeadlandSides: layout.combinedHeadlandSides,
          // combinedHeadlandSides: layout.combinedHeadlandSides,

        });
        console.timeEnd('layoutRoute');
        return;



        // // IF ROWS, DO XXX
        // // if (foundProject.rows && foundProject.rows.length > 0) {
        // // DO ROW LAYOUT
        // // layout = rowBasedLayout(foundProject);
        // // } else {
        // // DO PARAMETRIC LAYOUT
        // // layout = systemBasedLayout(foundProject);
        // // }

        // // CREATE FEATURECOLLECTION FOR ROWS*/
        // const featurecollection = turf.featureCollection(layout.rowLineArray);
        // const collection = featurecollection;
        // const bedArrayPolygons = turf.featureCollection(layout.bedPolygonArray);
        // const stripsCollection = bedArrayPolygons;
        // const alleyArrayPolygons = turf.featureCollection(
        //   layout.alleyPolygonArray,
        // );
        // const alleysCollection = alleyArrayPolygons;
        // // TEMP TESTING LINES
        // const offsetArrayCollection = turf.featureCollection(layout.offsetArray);
        // const offsetCollection = offsetArrayCollection;
        // console.log(`Length off offset array: ${layout.offsetArray}`);
        // // CREATE FEATURE COLLECTION FOR EDGEROWS
        // /*   var edgeRowFeatureCollection = turf.featureCollection(edgeRowArray);
        //             var edgeRowCollection = JSON.stringify(edgeRowFeatureCollection); */
        // // OFFSET LINE
        // /*               var offsetline = lineOffset(line, -(3),{units: "meters"});
        //                             var rowPoints = lineIntersect(offsetline, offsetPolygon);
        //                             var row = turf.lineString([[rowPoints.features[0].geometry.coordinates[0],rowPoints.features[0].geometry.coordinates[1]],[rowPoints.features[1].geometry.coordinates[0],rowPoints.features[1].geometry.coordinates[1]]],{name: "line-2"});
        //                             var stringline = JSON.stringify(row);
        //                             var stringbox = JSON.stringify(box); */
        // // CLEAN DATASET FROM ANNUALS - ONLY WORKS IF ANNUALS IN FIRST POSITION
        // /* var treeRows = [];
        //             for(let i=0;i<dataset.length;i++){
        //                 if(!(dataset[i].array[0].species.form === "grass")){
        //                     treeRows.push(dataset[i]);
        //                 }
        //             }
        //             // CYCLE THROUGH ALL ROWS TO FIND SYSTEM LENGTH
        //             var systemModelLength = 0;
        //             for(let i=0;i<dataset.length;i++){
        //                 if(dataset[i].array[(dataset[i].array.length - 1)].position[1] > systemModelLength){
        //                     systemModelLength = dataset[i].array[(dataset[i].array.length - 1)].position[1]
        //                 }
        //             }
        //             // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
        //             var treeRowCount = 0;
        //             var treeCountArray = [];
        //             var treeMarkerArray = [];
        //             var treeArray = [];
        //             var treeRowArea = 0;
        //             for(let i=0;i<rowArray.length;i++){
        //                 // COUNT SYSTEM MODEL ITERATIONS IN ROW
        //                 var rowLength = turfLength(rowArray[i], {units: "meters"});
        //                 // IF POSITION y IS 1, USE NEXT ROW TO FIND SYSTEM MODEL LENGTH?! THIS IS ONLY TEMP SOLUTION
        //                 /!*var systemModelLength = 0;
        //                 if(dataset[0].array[(dataset[0].array.length - 1)].position[1] <= 1){
        //                     systemModelLength = dataset[1].array[(dataset[1].array.length - 1)].position[1];
        //                 } else {
        //                     systemModelLength = dataset[0].array[(dataset[0].array.length - 1)].position[1];
        //                 }*!/
        //                 var systemModelCount = Math.floor(rowLength/systemModelLength);
        //                 var systemModelRowRest = ((rowLength/systemModelLength) - Math.floor(rowLength/systemModelLength))*systemModelLength;
        //                 // CALCULATE AREA
        //                 treeRowArea = treeRowArea + rowLength * treeRows[treeRowCount].array[0].width;
        //                 // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
        //                 console.log("Position: " + treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].position[1]);
        //                 if(!(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].position[1] < systemModelLength)){
        //                     treeArray.push(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species);
        //                     var firstTreeMarker = turf.point(rowArray[i].geometry.coordinates[0]);
        //                     treeMarkerArray.push(firstTreeMarker);
        //                 }
        //                 // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
        //                 for(let j=0;j<systemModelCount;j++){
        //                     for(let k=0;k<treeRows[treeRowCount].array.length;k++){
        //                         // ADD TREE SPECIES TO COUNT ARRAY
        //                         treeArray.push(treeRows[treeRowCount].array[k].species);
        //                         // CREATE TREE POINTS FOR MARKERS
        //                         var treeMarker = along(rowArray[i], (j*systemModelLength + treeRows[treeRowCount].array[k].position[1]), {units: "meters"});
        //                         treeMarkerArray.push(treeMarker);
        //                     }
        //                 }
        //                 // ADD REST
        //                 for(let j=0;j<treeRows[treeRowCount].array.length;j++){
        //                     if(treeRows[treeRowCount].array[j].position[1] < systemModelRowRest){
        //                         treeArray.push(treeRows[treeRowCount].array[j].species);
        //                         // ADD POINT MARKER FOR REMAINING TREES
        //                         var treeMarker2 = along(rowArray[i], (systemModelCount*systemModelLength + treeRows[treeRowCount].array[j].position[1]), {units: "meters"});
        //                         treeMarkerArray.push(treeMarker2);
        //                     }
        //                 }
        //                 // ALIGN ROW ARRAY WITH SYSTEM ROWS (I.E. START NEW ROW MODEL COUNT.) AND REST LAST ROW
        //                 if(treeRowCount >= treeRows.length - 1){
        //                     treeRowCount = 0;
        //                 } else {
        //                     treeRowCount = treeRowCount + 1;
        //                 }
        //             }
        //             console.log(treeArray.length);
        //             console.log(treeMarkerArray.length);
        //             // DO POINT COLLECTION
        //             var treeCanopyArray = [];
        //             if(treeMarkerArray.length < 3000){
        //                 for(let i=0;i<treeMarkerArray.length;i++){
        //                     var circle1 = circle(treeMarkerArray[i].geometry.coordinates, 1, {units: "meters"});
        //                     treeCanopyArray.push(circle1);
        //                 }
        //             } */
        // const treeMarkers = turf.featureCollection(layout.treeMarkerArray);
        // const treeCollection = treeMarkers;
        // /* // COPY ALL SPECIES
        //             var allSpeciesCopy = [];
        //             for(let i=0;allSpecies.length > i;i++){
        //                 allSpeciesCopy.push(allSpecies[i]);
        //             } */

        // let uniqueSpeciesCount: { id: string; uniqueCount: number; }[] = [];
        // if (layout.uniqueSpeciesCount) {
        //   uniqueSpeciesCount = layout.uniqueSpeciesCount;
        // }
        // // CALCULATE AREA SIZES
        // const treeRowArea = layout.treeRowArea;
        // // TREE ROW LENGTHS
        // /* if (foundProject.rows && foundProject.rows.length > 0) {
        //   // DO ROW LENGTH
        //   console.log(`rows ${foundProject.rows[0]}`);
        //   for (let i = 0; i < foundProject.rows.length; i++) {
        //     const rowGeometry = JSON.parse(foundProject.rows[i].geometry);
        //     foundProject.rows[i].rowlength = turfLength(rowGeometry, {
        //       units: 'meters',
        //     });
        //   }
        // } */
        // /* for(let i=0;i<layout.alleyPolygonArray.length;i++){
        //                 console.log("area" + i + area(layout.alleyPolygonArray[i]));
        //             } */
        // // TEMP VALUE HERE
        // const marginArea = 0;
        // res.send({
        //   project: foundProject,
        //   // system: foundSystem,
        //   collection,
        //   trees: treeCollection,
        //   species: uniqueSpeciesCount,
        //   treeArea: treeRowArea,
        //   marginArea,
        //   strips: stripsCollection,
        //   alleys: alleysCollection,
        //   offset: offsetCollection,
        //   treeAssetArray: layout.treeAssetArray,

        // });
      }
    } catch (err) {
      console.log(err);
    }

  },
);

// PROJECT UPDATE ROUTE
router.put('/projects/:id', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    await Project.findByIdAndUpdate(
      req.params.id,
      req.body.project,
    );
    // req.flash("success", "Successfully added service");
    res.send(`/projects/${req.params.id}`);
  } catch (err) {
    console.log(err);
  }
});

// PROJECT UPDATE ROUTE
router.put('/projects/:id/layout', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    await Project.findByIdAndUpdate(
      req.params.id,
      req.body.project,
    );
    // req.flash("success", "Successfully added service");
    res.send(`/projects/${req.params.id}/layout`);
  } catch (err) {
    console.log(err);
  }
});

// PROJECT VIZ ROUTE
router.get(
  '/projects/:id/viz',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({ path: 'system', populate: { path: 'model.species' } })
        .populate('edgesystem')
        .populate('layer')
        .populate({
          path: 'rows',
          populate: { path: 'sequence', populate: { path: 'model.species' } },
        })
        .populate('areas')
        .exec();
      if (foundProject) {
        // CAN REMOVE THE TWO BELOW SYSTEMS AND JUST POPULATE IN ROUTE ABOVE
        try {
          const foundSystem = await System.findById(foundProject.system)
            .populate('model.species')
            .exec();
          // EDGE SYSTEM FIND, IF ONE
          // var edgesystem = '5e6639bc8add4f22f0820200'
          // if (foundProject.edgesystem) {
          //   edgesystem = foundProject.edgesystem
          // }

          //   let foundEdgeSystem = await System.findById(edgesystem)
          //     .populate('model.species')
          //     .exec()
          // SET VARIABLES HERE
          let layout;
          // IF ROWS, DO XXX
          if (foundProject.rows && foundProject.rows.length > 0) {
            // DO ROW LAYOUT
            layout = rowBasedLayout(foundProject);
          } else {
            // DO PARAMETRIC LAYOUT
            layout = systemBasedLayout(foundProject);
          }
          const featurecollection = turf.featureCollection(layout.rowLineArray);
          const collection = JSON.stringify(featurecollection);
          const bedArrayPolygons = turf.featureCollection(layout.bedPolygonArray);
          const stripsCollection = JSON.stringify(bedArrayPolygons);
          const alleyArrayPolygons = turf.featureCollection(
            layout.alleyPolygonArray,
          );
          const alleysCollection = JSON.stringify(alleyArrayPolygons);
          const treeMarkers = turf.featureCollection(layout.treeMarkerArray);
          const treeCollection = JSON.stringify(treeMarkers);
          // UNIQUE ITEM COUNTS

          let uniqueSpeciesCount: { id: string; uniqueCount: number; }[] = [];
          if (layout.uniqueSpeciesCount) {
            uniqueSpeciesCount = layout.uniqueSpeciesCount;
          }
          // CALCULATE AREA SIZES
          const treeRowArea = layout.treeRowArea;
          // TEMP VALUE HERE
          const marginArea = 0;
          res.send({
            project: foundProject,
            system: foundSystem,
            collection,
            trees: treeCollection,
            species: uniqueSpeciesCount,
            treeArea: treeRowArea,
            marginArea,
            strips: stripsCollection,
            alleys: alleysCollection,
          });
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('No foundProject');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT 3D VIZ
router.get('/projects/:id/3dviz', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  res.send();
});

// PROJECT STATUS CHANGE ROUTE - IMPLEMENT
router.put(
  '/projects/:id/implement',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      await Project.findByIdAndUpdate(
        req.params.id,
        { $set: { status: 'Implementation' } },
      );
      res.send(`/projects/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT STATUS CHANGE ROUTE - RETIRED
router.put('/projects/:id/retire', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    await Project.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'Retired' } },
    );
    res.send(`/projects/${req.params.id}`);
  } catch (err) {
    console.log(err);
  }
});

// PROJECT STATUS CHANGE ROUTE - COMPLETE
router.put(
  '/projects/:id/complete',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const completedProject = await Project.findByIdAndUpdate(req.params.id, {
        $set: { status: 'Completed' },
      });
      if (completedProject) {
        // FIND AREA, UPDATE PRESENT SYSTEM AND PUSH OLD PRESENT SYSTEM TO PAST SYSTEMS
        try {
          const projectArea = await Layer.findById(completedProject.layer);

          if (projectArea) {
            projectArea.systems.past.push(projectArea.systems.present);
            projectArea.systems.present = completedProject.system;
            // CLEAR FUTURE DRAFTS?
            // ADD ASSETS AND ROWS TO LAYER
            if (completedProject.rows && completedProject.rows.length > 0) {
              projectArea.rows = completedProject.rows;
            }
            if (completedProject.assets && completedProject.assets.length > 0) {
              projectArea.assets = completedProject.assets;
            }
            if (completedProject.areas && completedProject.areas.length > 0) {
              projectArea.areas = completedProject.areas;
            }
            // SAVE AREA
            await projectArea.save();
            // REDIRECT
            res.send(`/projects/${req.params.id}`);
          } else {
            console.log('No projectArea');
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('No completedProject');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ADD PROJECT EDGE SYSTEM NEW
router.get(
  '/projects/:id/addedgesystem',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
      const foundProject = await Project.findById(req.params.id);
      try {
        const foundSystems = await System.find({ 'owner.id': req.user?._id });
        // SORT OUT MONOCULTURE SYSTEMS
        const realSystems: ISystemSchema[] = [];
        for (let i = 0; i < foundSystems.length; i++) {
          const systemNameSplit = foundSystems[i].name.split(' ');
          if (
            !(systemNameSplit[systemNameSplit.length - 1] === 'monoculture')
          ) {
            realSystems.push(foundSystems[i]);
          }
        }
        res.send({
          project: foundProject,
          systems: realSystems,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ADD PROJECT EDGE SYSTEM UPDATE
router.post(
  '/projects/:id/addedgesystem',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND SYSTEM
    try {
      const foundSystem = await System.findById(req.body.systemid);

      // FIND PROJECT
      try {
        const foundProject = await Project.findByIdAndUpdate(req.params.id, {
          $set: { edgesystem: foundSystem },
        });
        if (foundProject) {
          res.send(`/projects/${foundProject._id}`);
        } else {
          console.log('No foundProject');
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT ASSET CREATION
router.put(
  '/projects/:id/generateassets',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({ path: 'system', populate: { path: 'model.species' } })
        .populate('edgesystem')
        .populate('layer')
        .populate({
          path: 'rows',
          populate: { path: 'sequence', populate: { path: 'model.species' } },
        })
        .populate({
          path: 'areas',
          populate: {
            path: 'rotation',
            populate: { path: 'model.speciesmix.species' },
          },
        })
        .exec();
      if (foundProject) {
        // FIND SYSTEM
        try {
          // SET VARIABLES HERE
          let layout;
          // IF ROWS, DO XXX
          if (foundProject.rows && foundProject.rows.length > 0) {
            // DO ROW LAYOUT
            layout = rowBasedLayout(foundProject);
          } else {
            // DO PARAMETRIC LAYOUT
            layout = systemBasedLayout(foundProject);
          }

          const treeAssetRowRef = layout.treeAssetRowRef;
          const treeAssetArray = layout.treeAssetArray;
          const treeMarkerArray = layout.treeMarkerArray;
          /* // DON'T HAVE MARKERS. THEY ARE CIRCLES/POLYGONS
                    console.log("Trees: " + treeAssetArray.length);
                    console.log("Tree #1 - " + treeAssetArray[0]);
                    console.log(treeAssetArray[0].species);
                    console.log(treeAssetArray[0].lat);
                    res.send("/projects/" + req.params.id); */
          console.log(`Trees Assets: ${treeAssetArray.length}`);
          console.log(`Trees Markets: ${treeMarkerArray.length}`);
          console.log(`Trees Row Refs: ${treeAssetRowRef.length}`);
          /*
                                        res.send("/projects/" + req.params.id);
                    */
          // CREATE ASSETS
          try {
            const createdAssets = await Asset.insertMany(treeAssetArray);

            console.log(createdAssets.length);
            try {
              const updatedProject = await Project.findByIdAndUpdate(
                foundProject._id,
                { $push: { assets: { $each: createdAssets } } },
              );

              // SAVE TREE ASSETS ON ROWS AS WELL - IF NO ROWS, GENERATE THEM AND AREAS?
              if (updatedProject) {
                try {
                  const foundRows = await Row.find({
                    _id: { $in: updatedProject.rows },
                  });

                  for (let i = 0; i < createdAssets.length; i++) {
                    const ref = treeAssetRowRef[i];
                    console.log(`ref ${ref}`);
                    // @ts-ignore
                    foundRows[ref].assets.push(createdAssets[i]);
                  }
                  // SAVE ROWS INDIVIDUALLY
                  for (let i = 0; i < foundRows.length; i++) {
                    await foundRows[i].save();
                  }
                  console.log('Assets added to project');
                  res.send(`/projects/${req.params.id}`);
                } catch (err) {
                  console.log(err);
                }
              } else {
                console.log('No updatedProject');
              }
            } catch (err) {
              console.log(err);
            }
          } catch (err) {
            console.log(err);
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('No foundProject');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT LAYOUT EXPLODE ROUTE
// router.post('/projects/:id/explode', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
//   // FIND PROJECT
//   try {
//     const foundProject = await Project.findById(req.params.id)
//       .populate({ path: 'system', populate: { path: 'model.species' } })
//       .populate({ path: 'edgesystem', populate: { path: 'model.species' } })
//       .populate('layer')
//       .exec();
//     if (foundProject) {
//       const layout = systemBasedLayout(foundProject);
//       // CREATE ROWS ON PROJECT
//       const rows: {
//         geometry: string;
//         name: string;
//         rowlength: number;
//       }[] = [];
//       for (let i = 0; i < layout.rowLineArray.length; i++) {
//         const row = {
//           geometry: JSON.stringify(layout.rowLineArray[i]),
//           name: `Row ${i}`,
//           // CREATE ROW LENGTH
//           rowlength: turfLength(layout.rowLineArray[i], { units: 'meters' }),
//         };
//         // PUSH TO ARRAY
//         rows.push(row);
//       }
//       console.log(rows[0]);
//       // CREATE AREAS
//       const areas: {
//         geometry: string;
//         name: string;
//         size: number;
//       }[] = [];
//       for (let i = 0; i < layout.alleyPolygonArray.length; i++) {
//         const alleyGeometry = layout.alleyPolygonArray[i];
//         const alley = {
//           geometry: JSON.stringify(layout.alleyPolygonArray[i]),
//           name: `Alley ${i}`,
//           size: area(alleyGeometry),
//         };
//         // PUSH TO ARRAY
//         areas.push(alley);
//       }
//       for (let i = 0; i < layout.bedPolygonArray.length; i++) {
//         const bedGeometry = layout.bedPolygonArray[i];
//         const treeStrip = {
//           geometry: JSON.stringify(layout.bedPolygonArray[i]),
//           name: `Tree Strip ${i}`,
//           size: area(bedGeometry),
//         };
//         // PUSH TO ARRAY
//         areas.push(treeStrip);
//       }
//       // const rowCollection = JSON.stringify(layout.rowLineCollection);
//       // CREATE AREAS ON AREA
//       // const alleyCollection = JSON.stringify(layout.bedPolygonCollection);

//       // CREATE ROWS
//       try {
//         const createdRows = await Row.insertMany(rows);
//         // CREATE AREAS
//         try {
//           const createdAreas = await Area.insertMany(areas);
//           try {
//             const updatedProject = await Project.findByIdAndUpdate(
//               req.params.id,
//               {
//                 $push: {
//                   rows: { $each: createdRows },
//                   areas: { $each: createdAreas },
//                 },
//               },
//             );
//             if (updatedProject) {
//               res.send(`/projects/${updatedProject._id}/layout`);
//             } else {
//               console.log('No updatedProject');
//             }
//           } catch (err) {
//             console.log(err);
//           }
//         } catch (err) {
//           console.log(err);
//         }
//       } catch (err) {
//         console.log(err);
//       }
//     }
//   } catch (err) {
//     console.log(err);
//   }
// });

// PROJECT DELETE ALL ROWS, AND LATER ON AREAS ON PROJECT
router.get(
  '/projects/:id/deleterows',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id);
      if (foundProject) {
        try {
          await Row.deleteMany({ _id: { $in: foundProject.rows } });
          // DELETE ROWS
          try {
            const updatedProject = await Project.findByIdAndUpdate(
              req.params.id,
              {
                $set: { rows: [] },
              },
            );
            if (updatedProject) {
              // REDIRECT
              res.send(`/projects/${updatedProject._id}/layout`);
            } else {
              console.log('No updatedProject');
            }
          } catch (err) {
            console.log(err);
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('No foundProject');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT ASSET SHOW PAGE
router.get(
  '/projects/:id/assets',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate('assets')
        .populate('layer')
        .exec();

      const allTrees: string[] = [];
      const allTreesArray: string[] = [];
      // GENERATE ASSET CIRCLES
      const treeCanopyArray: turf.Feature<turf.Polygon, turf.Properties>[] = [];
      if (foundProject) {
        for (let i = 0; foundProject.assets.length > i; i++) {
          const point = turf.point([
            foundProject.assets[i].lat,
            foundProject.assets[i].lng,
          ]);
          const circle1 = circle(point.geometry.coordinates, 1, {
            units: 'meters',
          });
          allTrees.push(foundProject.assets[i].name);
          allTreesArray.push(foundProject.assets[i].name);
          treeCanopyArray.push(circle1);
        }
        const treeMarkers = turf.featureCollection(treeCanopyArray);
        // const treeCollection = JSON.stringify(treeMarkers);
        // UNIQUE TREE SPECIES
        const uniqueSpecies = unique(allTrees);
        // UNIQUE SPECIES COUNTS
        const uniqueSpeciesCount: {
          name: string;
          uniqueCount: number;
        }[] = [];
        for (let i = 0; uniqueSpecies.length > i; i++) {
          let count = 0;
          for (let j = 0; j < allTreesArray.length; j++) {
            if (allTreesArray[j] === uniqueSpecies[i]) {
              count += 1;
            }
          }
          const speciesCount = {
            name: uniqueSpecies[i],
            uniqueCount: count,
          };
          uniqueSpeciesCount.push(speciesCount);
        }
        console.log(uniqueSpeciesCount);
        res.send({
          project: foundProject,
          trees: treeMarkers,
          treecounts: uniqueSpeciesCount,
        });
      } else {
        console.log('No foundProject');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SERVICES DELETE ROUTE
router.delete(
  '/projects/:id',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // MAKE PROJECT OWNERSHIP MIDDLEWARE
    // FIND PROJECT FIRST FOR REFERENCES
    try {
      const foundProject = await Project.findById(req.params.id);

      // REMOVE PROJECT REFERENCE FROM LAYER
      if (foundProject) {
        try {
          await Layer.findByIdAndUpdate(foundProject.layer, {
            $pull: { projects: foundProject._id },
          });
          console.log('project removed from layer');

          // DELETE BUDGET(S)
          try {
            await Budget.findByIdAndRemove(foundProject.budgets.establishment);
            console.log('establishment budget deleted from project');

            try {
              await Budget.findByIdAndRemove(foundProject.budgets.management);
              console.log('management budget deleted from project');
              // DELETE ACTIVITIES
              foundProject.activities.forEach(async (activity) => {
                try {
                  await Activity.findByIdAndRemove(activity);
                } catch (err) {
                  console.log(err);
                }
              });

              // DELETE PROJECT
              try {
                await Project.findByIdAndRemove(req.params.id);
                console.log('project deleted');
                res.send('/projects');
              } catch (err) {
                console.log(err);
                res.send('/projects');
              }
            } catch (err) {
              console.log(err);
            }
          } catch (err) {
            console.log(err);
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('No foundProject');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// --------------- NESTED ROUTES ---------------- //

// LAYER PROJECT NEW ROUTE WITH SYSTEM REF
router.get(
  '/layers/:id/systems/:system/projects/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // CHECK OWNERSHIP!!!
    // FIND LAYER ID
    try {
      const foundLayer = await Layer.findById(req.params.id);
      try {
        const foundSystem = await System.findById(req.params.system);
        res.send({
          layer: foundLayer,
          system: foundSystem,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
      // res.flash(err);
    }
  },
);

router.get(
  '/layers/:id/new-project',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    console.log('THIS ROUTE');
    // CHECK OWNERSHIP!!!
    // FIND LAYER ID
    try {
      const foundLayer = await Layer.findById(req.params.id);
      res.send({
        layer: foundLayer,
      });
    } catch (err) {
      console.log(err);
      // res.flash(err);
    }
  },
);

// LAYER PROJECT CREATE ROUTE
router.post(
  '/layers/:id/projects',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // Lookup place using id

    try {
      const foundLayer = await Layer.findById(req.params.id)
        .populate('rows')
        .exec();

      const createdProject = await Project.create(req.body.project);

      if (foundLayer && createdProject) {
        // CREATE CURRENCY
        // ADD PROJECT STUFF
        createdProject.owner.id = req.user?._id.toString()!;
        createdProject.layer = foundLayer.id;
        createdProject.financial = {
          discountRate: 0.05,
          period: 20,
        };

        createdProject.status = 'planning';
        // Connect new project to layer
        foundLayer.projects.push(createdProject.id);
        await foundLayer.save();
        // Save rows from layer on project - Do it so that they are just blank for now
        if (req.body.existingrows === 'on') {
          const newRows: {
            geometry: string;
            name: string;
          }[] = [];
          for (let i = 0; i < foundLayer.rows.length; i++) {
            const row = {
              geometry: foundLayer.rows[i].geometry,
              name: foundLayer.rows[i].name,
            };
            newRows.push(row);
          }
          try {
            const createdRows = await Row.insertMany(newRows);

            createdProject.rows = createdRows;
            // Save the project
            await createdProject.save();
            res.send(createdProject);
          } catch (err) {
            console.log(err);
          }
        } else {
          // Save the project
          await createdProject.save();
          res.send(createdProject);
        }
      }
    } catch (err) {
      console.log(err);
      res.send(`/layers/${req.params.id}`);
    }
  },
);

// LAYER PROJECT CREATE ROUTE
router.post(
  '/layers/:id/systems/:system/projects',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // Lookup place using id

    try {
      const foundLayer = await Layer.findById(req.params.id)
        .populate('rows')
        .exec();

      const createdProject = await Project.create(req.body.project);

      // FIND SYSTEM AND ADD TO PROJECT
      const foundSystem = await System.findById(req.params.system)
        .populate('model.species')
        .exec();

      if (foundLayer && createdProject && foundSystem) {
        // CREATE CURRENCY
        // ADD PROJECT STUFF
        createdProject.owner.id = req.user?._id.toString()!;
        createdProject.system = foundSystem;
        createdProject.layer = foundLayer;
        createdProject.financial = {
          discountRate: 0.05,
          period: 20,
        };
        createdProject.status = 'planning';
        // Connect new project to layer
        foundLayer.projects.push(createdProject);
        await foundLayer.save();
        // Save rows from layer on project - Do it so that they are just blank for now
        if (req.body.existingrows === 'on') {
          const newRows: {
            geometry: string;
            name: string;
          }[] = [];
          for (let i = 0; i < foundLayer.rows.length; i++) {
            const row = {
              geometry: foundLayer.rows[i].geometry,
              name: foundLayer.rows[i].name,
            };
            newRows.push(row);
          }
          try {
            const createdRows = await Row.insertMany(newRows);

            createdProject.rows = createdRows;
            // Save the project
            await createdProject.save();
            res.send(createdProject);
          } catch (err) {
            console.log(err);
          }
        } else {
          // Save the project
          await createdProject.save();
          res.send(createdProject);
        }
      }
    } catch (err) {
      console.log(err);
      res.send(`/layers/${req.params.id}`);
    }
  },
);

// PROJECT ASSETS DELETE ROUTE
router.delete(
  '/projects/:id/allassets',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id).populate('assets');
      // FIND ASSETS AND DELETE
      if (foundProject) {
        for (let i = foundProject.assets.length - 1; i >= 0; i--) {
          await foundProject.assets[i].deleteOne();
          // DELETE ASSET
          try {
            await Asset.findByIdAndRemove(foundProject.assets[i]);
            console.log('Deleted asset');
          } catch (err) {
            console.log(err);
          }
        }
        res.send(`/projects/${foundProject.id}`);
      } else {
        console.log('No foundProject');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ROW NEW ROUTE
router.get(
  '/projects/:id/row/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate('layer')
        .exec();
      if (foundProject) {
        // FIND MY SYSTEMS
        try {
          const foundSequences = await Sequence.find(
            { 'owner.id': req.user?._id },
          );
          res.send({
            project: foundProject,
            sequences: foundSequences,
          });
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ROW CREATE ROUTE
router.post('/projects/:id/row', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // REDIRECT IF NO GEOMETRY
  if (req.body.geometry === '') {
    res.status(400).send({ error: 'No geometry found' });
  } else {
    // CREATE ROW HERE?
    const tempGeo = JSON.parse(req.body.geometry);
    const row: any = {
      geometry: req.body.geometry,
      name: req.body.row.name,
      // ADD ROW LENGTH PARAM
      rowlength: turfLength(tempGeo, { units: 'meters' }),
    };
    if (!(req.body.sequenceid === 'none') && req.body.sequenceid) {
      row.sequence = req.body.sequenceid;
    }
    console.log(row);
    // CREATE ROW
    try {
      const createdRow = await Row.create(row);
      // FIND PROJECT
      try {
        const foundProject = await Project.findByIdAndUpdate(req.params.id, {
          $addToSet: { rows: createdRow },
        });
        // CREATE ROW
        if (foundProject) {
          console.log('Row has been added to project');
          res.send(`/projects/${foundProject.id}/layout`);
        } else {
          console.log('No foundProject');
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  }
});

// EDIT ROW
router.get(
  '/projects/:id/row/:pid/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({ path: 'rows', populate: { path: 'sequence' } })
        .populate('layer')
        .exec();
      // FIND ROW
      try {
        const foundRow = await Row.findById(req.params.pid)
          .populate('sequence')
          .exec();
        // FIND MY SYSTEMS
        try {
          const foundSequences = await Sequence.find(
            { 'owner.id': req.user?._id },
          );
          res.send({
            project: foundProject,
            row: foundRow,
            sequences: foundSequences,
          });
        } catch (err) {
          console.log(err);
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// UPDATE ROW
router.put(
  '/projects/:id/row/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // CREATE ROW HERE?
    const row: any = {
      name: req.body.row.name,
    };
    if (!(req.body.sequenceid === 'none') && req.body.sequenceid) {
      row.sequence = req.body.sequenceid;
    }
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id);
      // FIND AND UPDATE ROW
      if (foundProject) {
        try {
          await Row.findByIdAndUpdate(req.params.pid, row);
          res.send(`/projects/${foundProject._id}/layout`);
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// DELETE ROW
router.delete(
  '/projects/:id/row/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const updatedProject = await Project.findById(req.params.id);
      // REMOVE ROW
      if (updatedProject) {
        console.log(`Length before ${updatedProject.rows.length}`);
        updatedProject.rows.forEach(async (row) => {
          if (row._id.toString() === req.params.pid) {
            await row.deleteOne();
          }
        });
        // DELETE ROW
        try {
          await Row.findByIdAndRemove(req.params.pid);
          console.log(`Length after ${updatedProject.rows.length}`);
          res.send(`/projects/${updatedProject._id}/layout`);
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ---------------- AREAS

// EDIT AREA
router.get(
  '/projects/:id/areas/:pid/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND LAYER
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({ path: 'areas', populate: { path: 'rotation' } })
        .populate('layer')
        .exec();
      // FIND ROW
      try {
        const foundArea = await Area.findById(req.params.pid)
          .populate('rotation')
          .exec();
        // FIND MY SYSTEMS
        try {
          const foundRotations = await Rotation.find(
            { 'owner.id': req.user?._id },
          );
          res.send({
            project: foundProject,
            area: foundArea,
            rotations: foundRotations,
          });
        } catch (err) {
          console.log(err);
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// UPDATE AREA
router.put(
  '/projects/:id/areas/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // CREATE AREA HERE?

    const area: any = {
      name: req.body.area.name,
    };

    if (!(req.body.rotationid === 'none') && req.body.rotationid) {
      area.rotation = req.body.rotationid;
    }
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id);
      // FIND AND UPDATE AREA
      if (foundProject) {
        try {
          const updatedArea = await Area.findByIdAndUpdate(
            req.params.pid,
            area,
          );
          console.log(`Updated area: ${updatedArea}`);
          res.send(`/projects/${foundProject._id}/layout`);
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// --------- PROJECT FINANCIALS ROUTE TEMP --------
// PROJECT FINANCIALS ROUTE
router.get('/projects/:id/financials', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const foundProject = await Project.findById(req.params.id)
      .populate({ path: 'system', populate: { path: 'model.species' } })
      .populate('edgesystem')
      .populate('layer')
      .populate('rows')
      .populate({
        path: 'rows',
        populate: { path: 'sequence', populate: { path: 'model.species' } },
      })
      .exec();
    if (foundProject) {
      // USE MIDDLEWARE TO DYNAMICALLY CALCULATE THE ESTABLISHMENT AND CASH-FLOW BUDGET
      const establishmentBudget = dyFiMo.establishment(foundProject);
      const managementBudget = dyFiMo.management(foundProject);
      // SETUP LABELS AND YoY CASH-FLOW INCLUDING
      const labels: any[] = [];
      for (let i = 0; i < foundProject.financial.period; i++) {
        const label = i + 1;
        JSON.stringify(label);
        labels.push(label);
      }

      const YoY = managementBudget.totals;
      YoY[0] -= establishmentBudget.total;
      // ADD BUDGET DATA TO GRAPH DATASETS

      // CALCULATE ACCUMULATIVE CASH-FLOW
      const sumArray: number[] = [];
      let sum = 0;
      for (let i = 0; i < foundProject.financial.period; i++) {
        sum += YoY[i];
        sumArray.push(sum);
      }
      let npv = 0;
      for (let i = 0; i < YoY.length; i++) {
        const discountedTotal = YoY[i] * ((1 - (foundProject.financial.discountRate)) ** (i + 1));
        npv += discountedTotal;
      }

      const parsedLabels = labels;
      const parseddataset = YoY;
      const parsedsum = sumArray;

      let listofSpeciesIds: string[] = [];

      if (foundProject.rows.length > 0) {
        foundProject.rows.forEach((row) => {
          row.sequence?.uniqueSpecies.forEach((uniqueSpecie) => {
            listofSpeciesIds.push(uniqueSpecie.id.toString());
          });
        });
      } else {
        listofSpeciesIds = foundProject.system.uniqueSpecies.map(
          (us) => us.id as string,
        );
      }

      listofSpeciesIds = _.uniq(listofSpeciesIds);

      console.log('species', listofSpeciesIds);

      const species: ISpeciesSchema[] = await Species.aggregate([
        {
          $match: {
            _id: {
              $in: listofSpeciesIds!.map((id) => new mongoose.Types.ObjectId(id)),
            },
          },
        },
      ]);

      const populatedSpecies = await Species.populate(species, {
        path: 'activities',
      });

      res.send({
        species: populatedSpecies,
        project: foundProject,
        labels: parsedLabels,
        dataset: parseddataset,
        sum: parsedsum,
        npv,
      });
    } else {
      console.log('No foundProject');
    }
  } catch (err) {
    console.log(err);
  }
});

router.patch('/projects/:id/financials', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  const project = await Project.findById(req.params.id);

  project!.financial.discountRate = req.body.discountrate;
  project!.financial.period = req.body.timeperiod;
  await project!.save();

  res.send();
});

router.patch('/projects/:id/financials/activities', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  const project = await Project.findById(req.params.id).populate('system');

  const system = project?.system;

  const newActivities: [{
    id: string,
    activities: [{
      activityType: string;
      subtype: string;
      name: string;
      time: {
        startMonth: number;
        endMonth: number;
      };
      price: number;
    }]

  }] = req.body.map((newactivity) => ({
    id: newactivity.id,
    activities: newactivity.activities.filter((el) => el !== 'none').map((el) => JSON.parse(el)),
  }));

  system!.uniqueSpecies.forEach((uniqueSpecies) => {
    const match = newActivities.find((el) => el.id === uniqueSpecies.id.toString());

    if (match) {
      uniqueSpecies.activities = match!.activities;
    }
  });

  await system?.save();

  res.send();
});

// --------- SYSTEM LAYOUT CUSTOM ALIGNMENT ROUTES --------

// ALIGNMENT NEW ROUTE
router.get(
  '/projects/:id/alignmentrow/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate('layer')
        .exec();
      if (foundProject) {
        // FIND MY SYSTEMS
        try {
          const foundSequences = await Sequence.find(
            { 'owner.id': req.user?._id },
          );
          res.send({
            project: foundProject,
            sequences: foundSequences,
          });
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// UPDATE PROJECT ALIGNMENT
router.put('/projects/:id/alignmentrow', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    await Project.findByIdAndUpdate(
      req.params.id,
      { alignment: 'bearing', bearingline: req.body.geometry },
    );
    // req.flash("success", "Successfully added service");
    res.send(`/projects/${req.params.id}/layout`);
  } catch (err) {
    console.log(err);
  }
});

// -------------------- PDFS

// BUDGET PDF
router.get(
  '/projects/:id/budgetpdf',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND PROJECT

    // GENERATE PDF TEST
    const myDoc = new PDFDocument({ bufferPages: true });

    const buffers: any[] = [];
    myDoc.on('data', buffers.push.bind(buffers));
    myDoc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        'Content-Length': Buffer.byteLength(pdfData),
        'Content-Type': 'application/pdf',
        'Content-disposition': 'attachment;filename=test.pdf',
      });
    });

    myDoc.font('Times-Roman').fontSize(12).text('this is a test text');

    myDoc.end();
  },
);

// PROJECT SHOW ROUTE
router.get('/layers/:layerid/projects/:id', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const foundLayer = await Layer.findById(req.params.layerid)
      .populate('systems.future')
      .populate('projects')
      .populate('systems.present')
      .populate('systems.past')
      .exec();

    try {
      const foundProject = await Project.findById(req.params.id)
        .populate('layer')
        .populate('assets')
        .populate('budgets.establishment')
        .populate('budgets.management')
        .populate('system')
        .populate('edgesystem')
        .populate('activities')
        .exec();
      if (foundProject) {
        // TEST WITH BLANK
        let estPostings: IPostingSchema[] = [];
        if (foundProject.budgets.establishment) {
          estPostings = foundProject.budgets.establishment.postings;
        }

        try {
          const establishementPostings = await Posting.find({ _id: estPostings });

          console.log(`Establishment postings: ${establishementPostings.length}`);
          // TEST WITH BLANK
          let manPostings: IPostingSchema[] = [];
          if (foundProject.budgets.management) {
            manPostings = foundProject.budgets.management.postings;
          }

          try {
            const managementPostings = await Posting.find({ _id: manPostings });
            console.log(`Management postings: ${managementPostings.length}`);
            const irr = 0;
            // SET YEARS VARIABLE FOR BOTH GRAPH AND BUDGET
            let years = 0;
            if (
              foundProject.budgets.establishment
              || foundProject.budgets.management
            ) {
              // var totalEstablishment = 0;
              if (establishementPostings.length > 0) {
                for (let i = 0; i < establishementPostings.length; i++) {
                  /* if(establishementPostings[i].postType === "labor" || establishementPostings[i].postType === "material"){
                                  YoY[establishementPostings[i].year] = YoY[establishementPostings[i].year] - (establishementPostings[i].value * establishementPostings[i].amount);
                              } else if(establishementPostings[i].postType === "product" || establishementPostings[i].postType === "service"){
                                  YoY[establishementPostings[i].year] = YoY[establishementPostings[i].year] + (establishementPostings[i].value * establishementPostings[i].amount);
                              } */
                  if (establishementPostings[i].year) {
                    if (establishementPostings[i].year > years) {
                      years = establishementPostings[i].year;
                    }
                  }
                }
              }
              if (managementPostings.length > 0) {
                for (let i = 0; i < managementPostings.length; i++) {
                  /* if(managementPostings[i].postType === "labor" || managementPostings[i].postType === "material"){
                                  YoY[managementPostings[i].year] = YoY[managementPostings[i].year] - (managementPostings[i].value * managementPostings[i].amount);
                              } else if(managementPostings[i].postType === "product" || managementPostings[i].postType === "service"){
                                  YoY[managementPostings[i].year] = YoY[managementPostings[i].year] + (managementPostings[i].value * managementPostings[i].amount);
                              } */
                  if (managementPostings[i].year) {
                    if (managementPostings[i].year > years) {
                      years = managementPostings[i].year;
                    }
                  }
                }
              }
              /* for(let i=0;i<foundProject.financial.period;i++){
                          irr = irr + (YoY[i])/(1+foundProject.financial.discountRate)^i;
                      }
                      irr = irr - totalEstablishment; */
            }
            console.log(irr);
            console.log(`Years: ${years}`);
            // SET UP
            const YoY: number[] = [];
            const labels: number[] = [];
            for (let i = 1; i < years + 1; i++) {
              const label = i;
              labels.push(label);
              YoY.push(0);
            }
            // SET UP
            if (
              foundProject.budgets.establishment
              || foundProject.budgets.management
            ) {
              // var totalEstablishment = 0;
              if (establishementPostings.length > 0) {
                for (let i = 0; i < establishementPostings.length; i++) {
                  if (
                    establishementPostings[i].postType === 'labor'
                    || establishementPostings[i].postType === 'material'
                  ) {
                    YoY[establishementPostings[i].year] -= establishementPostings[i].value
                      * establishementPostings[i].amount;
                  } else if (
                    establishementPostings[i].postType === 'product'
                    || establishementPostings[i].postType === 'service'
                  ) {
                    YoY[establishementPostings[i].year] += establishementPostings[i].value
                      * establishementPostings[i].amount;
                  }
                }
              }
              if (managementPostings.length > 0) {
                for (let i = 0; i < managementPostings.length; i++) {
                  if (
                    managementPostings[i].postType === 'labor'
                    || managementPostings[i].postType === 'material'
                  ) {
                    YoY[managementPostings[i].year] -= managementPostings[i].value * managementPostings[i].amount;
                  } else if (
                    managementPostings[i].postType === 'product'
                    || managementPostings[i].postType === 'service'
                  ) {
                    YoY[managementPostings[i].year] += managementPostings[i].value * managementPostings[i].amount;
                  }
                }
              }
              /* for(let i=0;i<foundProject.financial.period;i++){
                          irr = irr + (YoY[i])/(1+foundProject.financial.discountRate)^i;
                      }
                      irr = irr - totalEstablishment; */
            }
            const parsedLabels = JSON.stringify(labels);
            // GENERATE DATA FOR GRAPH

            // ROI
            const roi = 0;
            // CALCULATE DATASET
            const sumArray: number[] = [];
            let sum = 0;
            for (let i = 0; i < years; i++) {
              sum += YoY[i];
              sumArray.push(sum);
            }
            console.log(YoY[0]);
            console.log(YoY.length);
            const parseddataset = JSON.stringify(YoY);
            const parsedsum = JSON.stringify(sumArray);
            // CHECK LENGTH IS IDENTICAL
            res.send({
              layer: foundLayer,
              project: foundProject,
              years,
              roi,
              irr,
              labels: parsedLabels,
              dataset: parseddataset,
              sum: parsedsum,
            });
          } catch (err) {
            console.log(err);
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('No foundProject');
      }
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// --------------- NESTED ROUTES ---------------- //

export default router;
