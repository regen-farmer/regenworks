import express from 'express';
import unique from 'array-unique';
import {
  helpers as turf, length as turfLength, circle,
} from '@turf/turf';
import PDFDocument from 'pdfkit';
import NodeGeocoder from 'node-geocoder';
import mongoose from 'mongoose';
import _ from 'lodash';
import Project from '../models/project.js';
import Layer from '../models/layer.js';
import System, { ISystemSchema } from '../models/system.js';
import Budget from '../models/budget.js';
import Activity from '../models/activity.js';
import Asset from '../models/asset.js';
import Posting, { IPostingSchema } from '../models/posting.js';
import Sequence from '../models/sequence.js';
import Rotation from '../models/rotation.js';
import Row from '../models/row.js';
import Area from '../models/area.js';
import middleware from '../middleware/index.js';
import { systemBasedLayout } from '../middleware/gis/system_based_layout.js';
import dyFiMo from '../middleware/financials.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken, Variables } from '../app.js';
import Species, { ISpeciesSchema } from '../models/species.js';
import { rowBasedLayout } from '../middleware/gis/row_based_layout.js';
// import SystemDesign from '../models/systemdesign.js';

// =======
// var express = require("express");
// var router = express.Router();
// var unique = require("array-unique");
// import Parcel from "../models/parcel.js";
// import Project from "../models/project.js";
// import Practice from "../models/practice.js";
// import Layer from "../models/layer.js";
// import System from "../models/system.js";
// import Budget from "../models/budget.js";
// import Activity from "../models/activity.js";
// import Species from "../models/species.js";
// import Asset from "../models/asset.js";
// import Posting from "../models/posting.js";
// import Sequence from "../models/sequence.js";
// import Rotation from "../models/rotation.js";
// import Row from "../models/row.js";
// import Area from "../models/area.js";
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

import { Hono } from "hono";

// import logger from '../middleware/logger';

export default function indexRoutes(
  router: Hono<
    {
      Variables: Variables;
    },
    {},
    "/"
  >
) {

const options: NodeGeocoder.Options = {
  provider: 'google',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
};

const geocoder = NodeGeocoder(options);

// PROJECTS INDEX ROUTE
router.get('/projects', async (c) => {
await middleware.isLoggedIn(c);
  // GET ALL USERS PROJECTS IN DB
  try {
    const allProjects = await Project.find({ 'owner.id': c.get('user')?._id });
    return c.json({ projects: allProjects });
  } catch (err) {
    console.log(err);
  }
});

// SERVICES NEW ROUTE
router.get('/projects/new', async (c) => {
await middleware.isLoggedIn(c);
  const place = undefined;
  return c.json({ place });
});

// SERVICES CREATE ROUTE
router.post('/projects', async (c) => {
await middleware.isLoggedIn(c);
  // Create a new project
  try {
    const service = await Project.create((await c.req.json()).project);
    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
    geocoder.geocode((await c.req.json()).service.location, async (err, data) => {
      if (err || !data.length) {
        console.log(err);
        c.status(500)
return c.json({ error: `Error while geocoding: ${err.toString()}` });
      }

      const lat = data[0].latitude;
      const lng = data[0].longitude;
      const loc = data[0].formattedAddress;

      if (lat && lng && loc) {
        service.lat = lat;
        service.lng = lng;
        service.location = loc;
        // Add ID to experience
        service.owner.id = c.get('user')?._id.toString()!;
        // Save the service - Not need if created after this step
        await service.save();
        // Redirect to projects INDEX page
        // req.flash("success", "Successfully added service");
        return c.json('/projects');
      }
    });
  } catch (err) {
    console.log(err);
  }
});

// PROJECT EDIT ROUTE
router.get('/projects/:id/edit', async (c) => {
await middleware.isLoggedIn(c);
  // MAKE SERVICE OWNERSHIP MIDDLEWARE
  // Find specific project in database
  try {
    const foundProject = await Project.findById(c.req.param('id'));
    return c.json({ project: foundProject });
  } catch (err) {
    console.log(err);
  }
});

// PROJECT LAYOUT EDIT ROUTE
router.get(
  '/projects/:id/layout',
  async (c) => {
    await middleware.isLoggedIn(c)
    console.time('layoutRoute');
    try {
      console.time('getProject');
      const foundProject = await Project.findById(c.req.param('id'))
        
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
        .exec();
      console.timeEnd('getProject');


      if (foundProject) {
        
        console.time('systemBasedLayout');
        const layout = systemBasedLayout(foundProject);
        console.timeEnd('systemBasedLayout');
        return c.json({
          project: foundProject,
          treeRowLines: layout.treeRowLines,
          groundCoverAreas: turf.featureCollection(layout.groundCoverAreas),
          headlandPolygon: layout.headlandPolygon,
          marginPolygon: layout.marginPolygon,
          speciesCountArray: layout.speciesCountArray,

          sidesCloseToBearing: turf.featureCollection(layout.sidesCloseToBearing),
          intersectionPoints: turf.featureCollection(layout.intersectionPoints),
          headlandSides: turf.featureCollection(layout.headlandSides),
          treeMarkerArray: layout.treeMarkerArray,

        });
        console.timeEnd('layoutRoute');
        
      } else {
        return c.json({'error':'no project found'});
      }
    } catch (err) {
      console.log(err);
    }

  },
);

// PROJECT UPDATE ROUTE
router.put('/projects/:id', async (c) => {
await middleware.isLoggedIn(c);
  try {
    await Project.findByIdAndUpdate(
      c.req.param('id'),
      (await c.req.json()).project,
    );
    // req.flash("success", "Successfully added service");
    return c.json(`/projects/${c.req.param('id')}`);
  } catch (err) {
    console.log(err);
  }
});

// PROJECT UPDATE ROUTE
router.put('/projects/:id/layout', async (c) => {
await middleware.isLoggedIn(c);
  try {
    await Project.findByIdAndUpdate(
      c.req.param('id'),
      (await c.req.json()).project,
    );
    // req.flash("success", "Successfully added service");
    return c.json(`/projects/${c.req.param('id')}/layout`);
  } catch (err) {
    console.log(err);
  }
});

// PROJECT VIZ ROUTE
router.get(
  '/projects/:id/viz',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundProject = await Project.findById(c.req.param('id'))
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
          return c.json({
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
router.get('/projects/:id/3dviz', async (c) => {
await middleware.isLoggedIn(c);
  return c.json({});
});

// PROJECT STATUS CHANGE ROUTE - IMPLEMENT
router.put(
  '/projects/:id/implement',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      await Project.findByIdAndUpdate(
        c.req.param('id'),
        { $set: { status: 'Implementation' } },
      );
      return c.json(`/projects/${c.req.param('id')}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT STATUS CHANGE ROUTE - RETIRED
router.put('/projects/:id/retire', async (c) => {
await middleware.isLoggedIn(c);
  try {
    await Project.findByIdAndUpdate(
      c.req.param('id'),
      { $set: { status: 'Retired' } },
    );
    return c.json(`/projects/${c.req.param('id')}`);
  } catch (err) {
    console.log(err);
  }
});

// PROJECT STATUS CHANGE ROUTE - COMPLETE
router.put(
  '/projects/:id/complete',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const completedProject = await Project.findByIdAndUpdate(c.req.param('id'), {
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
            return c.json(`/projects/${c.req.param('id')}`);
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
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundProject = await Project.findById(c.req.param('id'));
      try {
        const foundSystems = await System.find({ 'owner.id': c.get('user')?._id });
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
        return c.json({
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND SYSTEM
    try {
      const foundSystem = await System.findById((await c.req.json()).systemid);

      // FIND PROJECT
      try {
        const foundProject = await Project.findByIdAndUpdate(c.req.param('id'), {
          $set: { edgesystem: foundSystem },
        });
        if (foundProject) {
          return c.json(`/projects/${foundProject._id}`);
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id'))
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
                    return c.json("/projects/" + c.req.param('id')); */
          console.log(`Trees Assets: ${treeAssetArray.length}`);
          console.log(`Trees Markets: ${treeMarkerArray.length}`);
          console.log(`Trees Row Refs: ${treeAssetRowRef.length}`);
          /*
                                        return c.json("/projects/" + c.req.param('id'));
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
                  return c.json(`/projects/${c.req.param('id')}`);
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
// router.post('/projects/:id/explode', async (c) => {
// await middleware.isLoggedIn(c);
//   // FIND PROJECT
//   try {
//     const foundProject = await Project.findById(c.req.param('id'))
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
//               c.req.param('id'),
//               {
//                 $push: {
//                   rows: { $each: createdRows },
//                   areas: { $each: createdAreas },
//                 },
//               },
//             );
//             if (updatedProject) {
//               return c.json(`/projects/${updatedProject._id}/layout`);
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id'));
      if (foundProject) {
        try {
          await Row.deleteMany({ _id: { $in: foundProject.rows } });
          // DELETE ROWS
          try {
            const updatedProject = await Project.findByIdAndUpdate(
              c.req.param('id'),
              {
                $set: { rows: [] },
              },
            );
            if (updatedProject) {
              // REDIRECT
              return c.json(`/projects/${updatedProject._id}/layout`);
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id'))
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
        return c.json({
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // MAKE PROJECT OWNERSHIP MIDDLEWARE
    // FIND PROJECT FIRST FOR REFERENCES
    try {
      const foundProject = await Project.findById(c.req.param('id'));

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
                await Project.findByIdAndRemove(c.req.param('id'));
                console.log('project deleted');
                return c.json('/projects');
              } catch (err) {
                console.log(err);
                return c.json('/projects');
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // CHECK OWNERSHIP!!!
    // FIND LAYER ID
    try {
      const foundLayer = await Layer.findById(c.req.param('id'));
      try {
        const foundSystem = await System.findById(c.req.param('system'));
        return c.json({
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
  async (c) => {
    await middleware.isLoggedIn(c)
    console.log('THIS ROUTE');
    // CHECK OWNERSHIP!!!
    // FIND LAYER ID
    try {
      const foundLayer = await Layer.findById(c.req.param('id'));
      return c.json({
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // Lookup place using id

    try {
      const foundLayer = await Layer.findById(c.req.param('id'))
        .populate('rows')
        .exec();

      const createdProject = await Project.create((await c.req.json()).project);

      if (foundLayer && createdProject) {
        // CREATE CURRENCY
        // ADD PROJECT STUFF
        createdProject.owner.id = c.get('user')?._id.toString()!;
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
        if ((await c.req.json()).existingrows === 'on') {
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
            return c.json(createdProject);
          } catch (err) {
            console.log(err);
          }
        } else {
          // Save the project
          await createdProject.save();
          return c.json(createdProject);
        }
      }
    } catch (err) {
      console.log(err);
      return c.json(`/layers/${c.req.param('id')}`);
    }
  },
);

// LAYER PROJECT CREATE ROUTE
router.post(
  '/layers/:id/systems/:system/projects',
  async (c) => {
    await middleware.isLoggedIn(c)
    // Lookup place using id

    try {
      const foundLayer = await Layer.findById(c.req.param('id'))
        .populate('rows')
        .exec();

      const createdProject = await Project.create((await c.req.json()).project);

      // FIND SYSTEM AND ADD TO PROJECT
      const foundSystem = await System.findById(c.req.param('system'))
        .populate('model.species')
        .exec();

      if (foundLayer && createdProject && foundSystem) {
        // CREATE CURRENCY
        // ADD PROJECT STUFF
        createdProject.owner.id = c.get('user')?._id.toString()!;
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
        if ((await c.req.json()).existingrows === 'on') {
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
            return c.json(createdProject);
          } catch (err) {
            console.log(err);
          }
        } else {
          // Save the project
          await createdProject.save();
          return c.json(createdProject);
        }
      }
    } catch (err) {
      console.log(err);
      return c.json(`/layers/${c.req.param('id')}`);
    }
  },
);

// PROJECT ASSETS DELETE ROUTE
router.delete(
  '/projects/:id/allassets',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id')).populate('assets');
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
        return c.json(`/projects/${foundProject.id}`);
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id'))
        .populate('layer')
        .exec();
      if (foundProject) {
        // FIND MY SYSTEMS
        try {
          const foundSequences = await Sequence.find(
            { 'owner.id': c.get('user')?._id },
          );
          return c.json({
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
router.post('/projects/:id/row', async (c) => {
await middleware.isLoggedIn(c);
  // REDIRECT IF NO GEOMETRY
  if ((await c.req.json()).geometry === '') {
    c.status(400)
return c.json({ error: 'No geometry found' });
  } else {
    // CREATE ROW HERE?
    const tempGeo = JSON.parse((await c.req.json()).geometry);
    const row: any = {
      geometry: (await c.req.json()).geometry,
      name: (await c.req.json()).row.name,
      // ADD ROW LENGTH PARAM
      rowlength: turfLength(tempGeo, { units: 'meters' }),
    };
    if (!((await c.req.json()).sequenceid === 'none') && (await c.req.json()).sequenceid) {
      row.sequence = (await c.req.json()).sequenceid;
    }
    console.log(row);
    // CREATE ROW
    try {
      const createdRow = await Row.create(row);
      // FIND PROJECT
      try {
        const foundProject = await Project.findByIdAndUpdate(c.req.param('id'), {
          $addToSet: { rows: createdRow },
        });
        // CREATE ROW
        if (foundProject) {
          console.log('Row has been added to project');
          return c.json(`/projects/${foundProject.id}/layout`);
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundProject = await Project.findById(c.req.param('id'))
        .populate({ path: 'rows', populate: { path: 'sequence' } })
        .populate('layer')
        .exec();
      // FIND ROW
      try {
        const foundRow = await Row.findById(c.req.param('pid'))
          .populate('sequence')
          .exec();
        // FIND MY SYSTEMS
        try {
          const foundSequences = await Sequence.find(
            { 'owner.id': c.get('user')?._id },
          );
          return c.json({
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // CREATE ROW HERE?
    const row: any = {
      name: (await c.req.json()).row.name,
    };
    if (!((await c.req.json()).sequenceid === 'none') && (await c.req.json()).sequenceid) {
      row.sequence = (await c.req.json()).sequenceid;
    }
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id'));
      // FIND AND UPDATE ROW
      if (foundProject) {
        try {
          await Row.findByIdAndUpdate(c.req.param('pid'), row);
          return c.json(`/projects/${foundProject._id}/layout`);
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const updatedProject = await Project.findById(c.req.param('id'));
      // REMOVE ROW
      if (updatedProject) {
        console.log(`Length before ${updatedProject.rows.length}`);
        updatedProject.rows.forEach(async (row) => {
          if (row._id.toString() === c.req.param('pid')) {
            await row.deleteOne();
          }
        });
        // DELETE ROW
        try {
          await Row.findByIdAndRemove(c.req.param('pid'));
          console.log(`Length after ${updatedProject.rows.length}`);
          return c.json(`/projects/${updatedProject._id}/layout`);
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND LAYER
    try {
      const foundProject = await Project.findById(c.req.param('id'))
        .populate({ path: 'areas', populate: { path: 'rotation' } })
        .populate('layer')
        .exec();
      // FIND ROW
      try {
        const foundArea = await Area.findById(c.req.param('pid'))
          .populate('rotation')
          .exec();
        // FIND MY SYSTEMS
        try {
          const foundRotations = await Rotation.find(
            { 'owner.id': c.get('user')?._id },
          );
          return c.json({
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
  async (c) => {
    await middleware.isLoggedIn(c)
    // CREATE AREA HERE?

    const area: any = {
      name: (await c.req.json()).area.name,
    };

    if (!((await c.req.json()).rotationid === 'none') && (await c.req.json()).rotationid) {
      area.rotation = (await c.req.json()).rotationid;
    }
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id'));
      // FIND AND UPDATE AREA
      if (foundProject) {
        try {
          const updatedArea = await Area.findByIdAndUpdate(
            c.req.param('pid'),
            area,
          );
          console.log(`Updated area: ${updatedArea}`);
          return c.json(`/projects/${foundProject._id}/layout`);
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
router.get('/projects/:id/financials', async (c) => {
await middleware.isLoggedIn(c);
  try {
    const foundProject = await Project.findById(c.req.param('id'))
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

      return c.json({
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

router.patch('/projects/:id/financials', async (c) => {
await middleware.isLoggedIn(c);
  const project = await Project.findById(c.req.param('id'));

  project!.financial.discountRate = (await c.req.json()).discountrate;
  project!.financial.period = (await c.req.json()).timeperiod;
  await project!.save();

  return c.json({});
});

router.patch('/projects/:id/financials/activities', async (c) => {
await middleware.isLoggedIn(c);
  const project = await Project.findById(c.req.param('id')).populate('system');

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

  }] = (await c.req.json()).map((newactivity) => ({
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

  return c.json({});
});

// --------- SYSTEM LAYOUT CUSTOM ALIGNMENT ROUTES --------

// ALIGNMENT NEW ROUTE
router.get(
  '/projects/:id/alignmentrow/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id'))
        .populate('layer')
        .exec();
      if (foundProject) {
        // FIND MY SYSTEMS
        try {
          const foundSequences = await Sequence.find(
            { 'owner.id': c.get('user')?._id },
          );
          return c.json({
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
router.put('/projects/:id/alignmentrow', async (c) => {
await middleware.isLoggedIn(c);
  try {
    await Project.findByIdAndUpdate(
      c.req.param('id'),
      { alignment: 'bearing', bearingline: (await c.req.json()).geometry },
    );
    // req.flash("success", "Successfully added service");
    return c.json(`/projects/${c.req.param('id')}/layout`);
  } catch (err) {
    console.log(err);
  }
});

// -------------------- PDFS

// BUDGET PDF
// router.get(
//   '/projects/:id/budgetpdf',
//   async (c) => {
//     await middleware.isLoggedIn(c)
//     // FIND PROJECT

//     // GENERATE PDF TEST
//     const myDoc = new PDFDocument({ bufferPages: true });

//     const buffers: any[] = [];
//     myDoc.on('data', buffers.push.bind(buffers));
//     myDoc.on('end', () => {
//       const pdfData = Buffer.concat(buffers);
//       res.writeHead(200, {
//         'Content-Length': Buffer.byteLength(pdfData),
//         'Content-Type': 'application/pdf',
//         'Content-disposition': 'attachment;filename=test.pdf',
//       });
//     });

//     myDoc.font('Times-Roman').fontSize(12).text('this is a test text');

//     myDoc.end();
//   },
// );

// PROJECT SHOW ROUTE
router.get('/layers/:layerid/projects/:projectsid', async (c) => {
  // await middleware.isLoggedIn(c);
  c.text('test')
  try {
    const foundLayer = await Layer.findById(c.req.param('layerid'))
      .populate('systems.future')
      .populate('projects')
      .populate('systems.present')
      .populate('systems.past')
      .exec();

    try {
      const foundProject = await Project.findById(c.req.param('projectsid'))
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
            return c.json({
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

}
