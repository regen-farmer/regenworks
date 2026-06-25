import Activity from "@rw/db/schemas/activity.ts";
import Area from "@rw/db/schemas/area.ts";
import Asset from "@rw/db/schemas/asset.ts";
import Budget from "@rw/db/schemas/budget.ts";
import Layer from "@rw/db/schemas/layer.ts";
import Posting, { type IPostingSchema } from "@rw/db/schemas/posting.ts";
import Project from "@rw/db/schemas/project.ts";
import Rotation from "@rw/db/schemas/rotation.ts";
import Row from "@rw/db/schemas/row.ts";
import Sequence from "@rw/db/schemas/sequence.ts";
import Species, { type ISpeciesSchema } from "@rw/db/schemas/species.ts";
import System, { type ISystemSchema } from "@rw/db/schemas/system.ts";
import SystemDesign from "@rw/db/schemas/systemdesign.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { rowBasedLayout } from "@rw/modelling/layout-turf-js/row_based_layout.ts";
import { runSystemBasedLayout } from "@rw/modelling/layout-backends/system-layout.node.ts";
import { systemBasedLayout } from "@rw/modelling/layout-turf-js/system_based_layout.ts";
import { circle, helpers as turf, length as turfLength } from "@turf/turf";
import unique from "array-unique";
import express from "express";
import escapeHtml from "escape-html";
import _ from "lodash";
import mongoose from "mongoose";
import NodeGeocoder from "node-geocoder";
import PDFDocument from "pdfkit";
import type { Auth0IDToken } from "../app.ts";
import dyFiMo from "../middleware/financials.ts";
import middleware from "../middleware/index.ts";
import { sanitizeMongoDocument, sanitizeMongoValue } from "../utils/mongoSafety.ts";

// import SystemDesign from 'collections/systemdesign.js';

// =======
// var express = require("express");
// var router = express.Router();
// var unique = require("array-unique");
// import Parcel from "collections/parcel";
// import Project from "collections/project";
// import Practice from "collections/practice";
// import Layer from "collections/layer";
// import System from "collections/system";
// import Budget from "collections/budget";
// import Activity from "collections/activity";
// import Species from "collections/species";
// import Asset from "collections/asset";
// import Posting from "collections/posting";
// import Sequence from "collections/sequence";
// import Rotation from "collections/rotation";
// import Row from "collections/row";
// import Area from "collections/area";
// var geodist = require("geodist"); // TO CALCULATE DISTANCE BETWEEN COORDINATES
// var middleware = require("../middleware");
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
  provider: "openstreetmap",
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
  headers: {
    "User-Agent": "RegenWorks",
    Referer: "https://regenfarmer.com",
  },
};

const geocoder = NodeGeocoder(options);

// PROJECTS INDEX ROUTE
router.get(
  "/projects",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // GET ALL USERS PROJECTS IN DB
    try {
      const allProjects = await Project.find({ "owner.id": req.user?._id });
      res.send({ projects: allProjects });
    } catch (err) {
      console.log(err);
    }
  },
);

// GET SINGLE PROJECT ROUTE
router.get(
  "/projects/:id",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const project = await Project.findById(req.params.id)
        .populate("systemdesign")
        .populate("layer");

      if (!project) {
        return res.status(404).send({ error: "Project not found" });
      }

      // Check if user owns the layer that this project belongs to
      const layer = await Layer.findById(project.layer);
      if (!layer) {
        return res.status(404).send({ error: "Layer not found" });
      }

      // Check ownership through the layer's parcel
      if (layer.owner?.id?.toString() !== req.user?._id.toString()) {
        return res.status(403).send({ error: "Unauthorized" });
      }

      res.send(project);
    } catch (err) {
      console.error("Error fetching project:", err);
      res.status(500).send({ error: "Failed to fetch project" });
    }
  },
);

// SERVICES NEW ROUTE
router.get(
  "/projects/new",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    const place = undefined;
    res.send({ place });
  },
);

// SERVICES CREATE ROUTE
router.post(
  "/projects",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
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
          res.send("/projects");
        }
      });
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT EDIT ROUTE
router.get(
  "/projects/:id/edit",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // MAKE SERVICE OWNERSHIP MIDDLEWARE
    // Find specific project in database
    try {
      const foundProject = await Project.findById(req.params.id);
      res.send({ project: foundProject });
    } catch (err) {
      console.log(err);
    }
  },
);

router.post(
  "/projects/:id/preview",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    const payload: { geometry; systemdesign } = req.body;

    try {
      const layout = await runSystemBasedLayout(payload.systemdesign, payload.geometry);

      res.send({
        treeRowLines: layout.treeRowLines,
        groundCoverAreas: turf.featureCollection(layout.groundCoverAreas),
        groundCoverAreasM2: layout.groundCoverAreasM2,
        headlandPolygon: layout.headlandPolygon,
        marginPolygon: layout.marginPolygon,
        speciesCountArray: layout.speciesCountArray,

        sidesCloseToBearing: turf.featureCollection(layout.sidesCloseToBearing),
        intersectionPoints: turf.featureCollection(layout.intersectionPoints),
        headlandSides: turf.featureCollection(layout.headlandSides),
        treeMarkerArray: layout.treeMarkerArray,
      });
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT LAYOUT ROUTE (supports public access)
router.get(
  "/projects/:id/layout",
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      console.log(`Project: ${req.params.id}`);
      const [foundProject] = await Project.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
        {
          $lookup: {
            from: "layers",
            localField: "layer",
            foreignField: "_id",
            as: "layer",
          },
        },
        {
          $lookup: {
            from: "systemdesigns",
            localField: "systemdesign",
            foreignField: "_id",
            as: "systemdesign",
          },
        },
        { $unwind: "$layer" },
        {
          $unwind: { path: "$systemdesign", preserveNullAndEmptyArrays: true },
        },
      ]).exec();

      if (!foundProject) {
        return res.status(404).send({ error: "Project not found" });
      }

      // Check if project is public or user is the owner
      const isPublic = foundProject.isPublic === true;
      const isOwner = req.user && foundProject.owner?.id?.toString() === req.user._id.toString();

      if (isPublic || isOwner) {
        res.send({ project: foundProject });
      } else if (!req.user) {
        res.status(401).send({ error: "Authentication required" });
      } else {
        res.status(403).send({ error: "Unauthorized" });
      }
    } catch (err) {
      console.log(err);
      res.status(500).send({ error: "Internal server error" });
    }
  },
);

router.get(
  "/projects/:id/design-preview",
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundProject = await Project.findById(req.params.id)

        .populate("layer")
        .populate("systemdesign")
        .populate({
          path: "systemdesign",
          populate: { path: "rows.sequence", populate: { path: "species" } },
        })
        .populate({
          path: "systemdesign",
          populate: { path: "rows", populate: { path: "groundcover" } },
        })
        .exec();

      if (foundProject?.isPublic || (req.user && foundProject?.owner?.id.equals(req.user._id))) {
        console.time("systemBasedLayout");
        const layout = await runSystemBasedLayout(
          foundProject.systemdesign,
          foundProject.layer.geometry,
        );
        console.timeEnd("systemBasedLayout");
        res.send({
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
      } else {
        res.send({ error: "no project found" });
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT UPDATE ROUTE
router.put(
  "/projects/:id",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const project = await Project.findById(req.params.id);
      project?.set(sanitizeMongoDocument(req.body.project));
      await project?.save();
      // req.flash("success", "Successfully added service");
      res.send(`/projects/${escapeHtml(req.params.id)}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT UPDATE ROUTE
router.put(
  "/projects/:id/layout",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    console.log("Here");
    try {
      const project = await Project.findById(req.params.id);
      project?.set(sanitizeMongoDocument(req.body.project));
      await project?.save();
      // req.flash("success", "Successfully added service");
      res.send(`/projects/${escapeHtml(req.params.id)}/layout`);
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT 3D VIZ
router.get(
  "/projects/:id/3dviz",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    res.send();
  },
);

// PROJECT STATUS CHANGE ROUTE - IMPLEMENT
router.put(
  "/projects/:id/implement",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      await Project.findByIdAndUpdate(req.params.id, {
        $set: { status: "Implementation" },
      });
      res.send(`/projects/${escapeHtml(req.params.id)}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT STATUS CHANGE ROUTE - RETIRED
router.put(
  "/projects/:id/retire",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      await Project.findByIdAndUpdate(req.params.id, {
        $set: { status: "Retired" },
      });
      res.send(`/projects/${escapeHtml(req.params.id)}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT STATUS CHANGE ROUTE - COMPLETE
router.put(
  "/projects/:id/complete",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const completedProject = await Project.findByIdAndUpdate(req.params.id, {
        $set: { status: "Completed" },
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
            res.send(`/projects/${escapeHtml(req.params.id)}`);
          } else {
            console.log("No projectArea");
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log("No completedProject");
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ADD PROJECT EDGE SYSTEM NEW
router.get(
  "/projects/:id/addedgesystem",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundProject = await Project.findById(req.params.id);
      try {
        const foundSystems = await System.find({ "owner.id": req.user?._id });
        // SORT OUT MONOCULTURE SYSTEMS
        const realSystems: ISystemSchema[] = [];
        for (let i = 0; i < foundSystems.length; i++) {
          const systemNameSplit = foundSystems[i].name.split(" ");
          if (!(systemNameSplit[systemNameSplit.length - 1] === "monoculture")) {
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
  "/projects/:id/addedgesystem",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND SYSTEM
    try {
      const rawSystemId = req.body.systemid;
      if (typeof rawSystemId !== "string" || !mongoose.Types.ObjectId.isValid(rawSystemId)) {
        return res.status(400).send({ error: "Invalid system id" });
      }

      const foundSystem = await System.findById(new mongoose.Types.ObjectId(rawSystemId));

      // FIND PROJECT
      try {
        const foundProject = await Project.findByIdAndUpdate(req.params.id, {
          $set: { edgesystem: foundSystem },
        });
        if (foundProject) {
          res.send(`/projects/${foundProject._id}`);
        } else {
          console.log("No foundProject");
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
  "/projects/:id/generateassets",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({ path: "system", populate: { path: "model.species" } })
        .populate("edgesystem")
        .populate("layer")
        .populate({
          path: "rows",
          populate: { path: "sequence", populate: { path: "model.species" } },
        })
        .populate({
          path: "areas",
          populate: {
            path: "rotation",
            populate: { path: "model.speciesmix.species" },
          },
        })
        .exec();
      if (foundProject) {
        // FIND SYSTEM
        try {
          // SET VARIABLES HERE
          let layout: any;
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
              const updatedProject = await Project.findByIdAndUpdate(foundProject._id, {
                $push: { assets: { $each: createdAssets } },
              });

              // SAVE TREE ASSETS ON ROWS AS WELL - IF NO ROWS, GENERATE THEM AND AREAS?
              if (updatedProject) {
                try {
                  const foundRows = await Row.find({
                    _id: { $in: updatedProject.rows },
                  });

                  for (let i = 0; i < createdAssets.length; i++) {
                    const ref = treeAssetRowRef[i];
                    console.log(`ref ${ref}`);
                    // @ts-expect-error
                    foundRows[ref].assets.push(createdAssets[i]);
                  }
                  // SAVE ROWS INDIVIDUALLY
                  for (let i = 0; i < foundRows.length; i++) {
                    await foundRows[i].save();
                  }
                  console.log("Assets added to project");
                  res.send(`/projects/${escapeHtml(req.params.id)}`);
                } catch (err) {
                  console.log(err);
                }
              } else {
                console.log("No updatedProject");
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
        console.log("No foundProject");
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
  "/projects/:id/deleterows",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id);
      if (foundProject) {
        try {
          await Row.deleteMany({ _id: { $in: foundProject.rows } });
          // DELETE ROWS
          try {
            const updatedProject = await Project.findByIdAndUpdate(req.params.id, {
              $set: { rows: [] },
            });
            if (updatedProject) {
              // REDIRECT
              res.send(`/projects/${updatedProject._id}/layout`);
            } else {
              console.log("No updatedProject");
            }
          } catch (err) {
            console.log(err);
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log("No foundProject");
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT ASSET SHOW PAGE
router.get(
  "/projects/:id/assets",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate("assets")
        .populate("layer")
        .exec();

      const allTrees: string[] = [];
      const allTreesArray: string[] = [];
      // GENERATE ASSET CIRCLES
      const treeCanopyArray: turf.Feature<turf.Polygon, turf.Properties>[] = [];
      if (foundProject) {
        for (let i = 0; foundProject.assets.length > i; i++) {
          const point = turf.point([foundProject.assets[i].lat, foundProject.assets[i].lng]);
          const circle1 = circle(point.geometry.coordinates, 1, {
            units: "meters",
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
        console.log("No foundProject");
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SERVICES DELETE ROUTE
router.delete(
  "/projects/:id",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
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
          console.log("project removed from layer");

          // DELETE BUDGET(S)
          try {
            await Budget.findByIdAndDelete(foundProject.budgets.establishment);
            console.log("establishment budget deleted from project");

            try {
              await Budget.findByIdAndDelete(foundProject.budgets.management);
              console.log("management budget deleted from project");
              // DELETE ACTIVITIES
              for (const activity of foundProject.activities) {
                try {
                  await Activity.findByIdAndDelete(activity);
                } catch (err) {
                  console.log(err);
                }
              }

              // DELETE PROJECT
              try {
                await Project.findByIdAndDelete(req.params.id);
                console.log("project deleted");
                res.send("/projects");
              } catch (err) {
                console.log(err);
                res.send("/projects");
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
        console.log("No foundProject");
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// --------------- NESTED ROUTES ---------------- //

// LAYER PROJECT NEW ROUTE WITH SYSTEM REF
router.get(
  "/layers/:id/systems/:system/projects/new",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
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
  "/layers/:id/new-project",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    console.log("THIS ROUTE");
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
  "/layers/:id/projects/duplicate",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // Lookup place using id

    try {
      // const foundLayer = await Layer.findById(req.params.id)
      // 	.exec();

      const source = req.body.project.source;
      source.id = undefined;
      source._id = undefined;

      // create new project

      const createdProject = await Project.create(source);
      createdProject.name = req.body.project.name;

      // create new systemdesign

      if (createdProject.systemdesign?._id || createdProject.systemdesign) {
        const systemDesignId = createdProject.systemdesign?._id ?? createdProject.systemdesign;

        const existingSystemDesign = await SystemDesign.findById(systemDesignId);

        if (!existingSystemDesign) {
          console.log("System Design not found", existingSystemDesign);
        }

        existingSystemDesign.id = undefined;
        existingSystemDesign._id = undefined;
        const newSystemDesign = await SystemDesign.create(
          JSON.parse(JSON.stringify(existingSystemDesign)),
        );
        await newSystemDesign.save();

        createdProject.systemdesign = newSystemDesign;
      }

      await createdProject.save();

      // get layer, append project, save layer

      const foundLayer = await Layer.findById(req.params.id);
      if (!foundLayer) {
        throw new Error("Layer not found");
      }
      foundLayer.projects.push(createdProject.id);
      await foundLayer.save();

      console.log("Project2", createdProject);

      res.send(createdProject);
    } catch (err) {
      console.log(err);
      res.send(`/layers/${escapeHtml(req.params.id)}`);
    }
  },
);

// GET projects for a layer
router.get(
  "/layers/:id/projects",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const projects = await Project.find({ layer: req.params.id })
        .select("name description status systemdesign")
        .populate("systemdesign", "rows")
        .exec();
      res.send(projects);
    } catch (err) {
      console.log(err);
      res.status(500).send({ error: "Failed to fetch projects" });
    }
  },
);

router.post(
  "/layers/:id/projects",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // Lookup place using id

    try {
      const foundLayer = await Layer.findById(req.params.id).populate("rows").exec();

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

        createdProject.status = "planning";
        // Connect new project to layer
        foundLayer.projects.push(createdProject.id);
        await foundLayer.save();
        // Save rows from layer on project - Do it so that they are just blank for now
        if (req.body.existingrows === "on") {
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
      res.send(`/layers/${escapeHtml(req.params.id)}`);
    }
  },
);

// LAYER PROJECT CREATE ROUTE
router.post(
  "/layers/:id/systems/:system/projects",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // Lookup place using id

    try {
      const foundLayer = await Layer.findById(req.params.id).populate("rows").exec();

      const createdProject = await Project.create(req.body.project);

      // FIND SYSTEM AND ADD TO PROJECT
      const foundSystem = await System.findById(req.params.system).populate("model.species").exec();

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
        createdProject.status = "planning";
        // Connect new project to layer
        foundLayer.projects.push(createdProject);
        await foundLayer.save();
        // Save rows from layer on project - Do it so that they are just blank for now
        if (req.body.existingrows === "on") {
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
      res.send(`/layers/${escapeHtml(req.params.id)}`);
    }
  },
);

// PROJECT ASSETS DELETE ROUTE
router.delete(
  "/projects/:id/allassets",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id).populate("assets");
      // FIND ASSETS AND DELETE
      if (foundProject) {
        for (let i = foundProject.assets.length - 1; i >= 0; i--) {
          await foundProject.assets[i].deleteOne();
          // DELETE ASSET
          try {
            await Asset.findByIdAndDelete(foundProject.assets[i]);
            console.log("Deleted asset");
          } catch (err) {
            console.log(err);
          }
        }
        res.send(`/projects/${foundProject.id}`);
      } else {
        console.log("No foundProject");
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// ROW NEW ROUTE
router.get(
  "/projects/:id/row/new",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id).populate("layer").exec();
      if (foundProject) {
        // FIND MY SYSTEMS
        try {
          const foundSequences = await Sequence.find({
            "owner.id": req.user?._id,
          });
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
router.post(
  "/projects/:id/row",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // REDIRECT IF NO GEOMETRY
    if (req.body.geometry === "") {
      res.status(400).send({ error: "No geometry found" });
    } else {
      // CREATE ROW HERE?
      const tempGeo = JSON.parse(req.body.geometry);
      const row: any = {
        geometry: req.body.geometry,
        name: req.body.row.name,
        // ADD ROW LENGTH PARAM
        rowlength: turfLength(tempGeo, { units: "meters" }),
      };
      if (!(req.body.sequenceid === "none") && req.body.sequenceid) {
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
            console.log("Row has been added to project");
            res.send(`/projects/${foundProject.id}/layout`);
          } else {
            console.log("No foundProject");
          }
        } catch (err) {
          console.log(err);
        }
      } catch (err) {
        console.log(err);
      }
    }
  },
);

// EDIT ROW
router.get(
  "/projects/:id/row/:pid/edit",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND LAYER
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({ path: "rows", populate: { path: "sequence" } })
        .populate("layer")
        .exec();
      // FIND ROW
      try {
        const foundRow = await Row.findById(req.params.pid).populate("sequence").exec();
        // FIND MY SYSTEMS
        try {
          const foundSequences = await Sequence.find({
            "owner.id": req.user?._id,
          });
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
  "/projects/:id/row/:pid",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // CREATE ROW HERE?
    const row: any = {
      name: req.body.row.name,
    };
    if (!(req.body.sequenceid === "none") && req.body.sequenceid) {
      if (
        typeof req.body.sequenceid !== "string" ||
        !mongoose.Types.ObjectId.isValid(req.body.sequenceid)
      ) {
        return res.status(400).send({ error: "Invalid sequence id" });
      }
      row.sequence = new mongoose.Types.ObjectId(req.body.sequenceid);
    }
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id);
      // FIND AND UPDATE ROW
      if (foundProject) {
        try {
          const foundRow = await Row.findById(req.params.pid);
          foundRow?.set(sanitizeMongoDocument(row));
          await foundRow?.save();
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
  "/projects/:id/row/:pid",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND LAYER
    try {
      const updatedProject = await Project.findById(req.params.id);
      // REMOVE ROW
      if (updatedProject) {
        console.log(`Length before ${updatedProject.rows.length}`);
        for (const row of updatedProject.rows) {
          if (row._id.toString() === req.params.pid) {
            await row.deleteOne();
          }
        }
        // DELETE ROW
        try {
          await Row.findByIdAndDelete(req.params.pid);
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
  "/projects/:id/areas/:pid/edit",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND LAYER
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({ path: "areas", populate: { path: "rotation" } })
        .populate("layer")
        .exec();
      // FIND ROW
      try {
        const foundArea = await Area.findById(req.params.pid).populate("rotation").exec();
        // FIND MY SYSTEMS
        try {
          const foundRotations = await Rotation.find({
            "owner.id": req.user?._id,
          });
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
  "/projects/:id/areas/:pid",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // CREATE AREA HERE?

    const area: any = {
      name: req.body.area.name,
    };

    if (!(req.body.rotationid === "none") && req.body.rotationid) {
      if (
        typeof req.body.rotationid !== "string" ||
        !mongoose.Types.ObjectId.isValid(req.body.rotationid)
      ) {
        return res.status(400).send({ error: "Invalid rotation id" });
      }
      area.rotation = new mongoose.Types.ObjectId(req.body.rotationid);
    }
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id);
      // FIND AND UPDATE AREA
      if (foundProject) {
        try {
          const updatedArea = await Area.findById(req.params.pid);
          updatedArea?.set(sanitizeMongoDocument(area));
          await updatedArea?.save();
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
router.get(
  "/projects/:id/financials",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundProject = await Project.findById(req.params.id)
        .populate({ path: "system", populate: { path: "model.species" } })
        .populate("edgesystem")
        .populate("layer")
        .populate("rows")
        .populate({
          path: "rows",
          populate: { path: "sequence", populate: { path: "model.species" } },
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
          const discountedTotal = YoY[i] * (1 - foundProject.financial.discountRate) ** (i + 1);
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
          listofSpeciesIds = foundProject.system.uniqueSpecies.map((us) => us.id as string);
        }

        listofSpeciesIds = _.uniq(listofSpeciesIds);

        console.log("species", listofSpeciesIds);

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
          path: "activities",
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
        console.log("No foundProject");
      }
    } catch (err) {
      console.log(err);
    }
  },
);

router.patch(
  "/projects/:id/financials",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    const project = await Project.findById(req.params.id);

    project!.financial.discountRate = req.body.discountrate;
    project!.financial.period = req.body.timeperiod;
    await project!.save();

    res.send();
  },
);

router.patch(
  "/projects/:id/financials/activities",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    const project = await Project.findById(req.params.id).populate("system");

    const system = project?.system;

    const newActivities: [
      {
        id: string;
        activities: [
          {
            activityType: string;
            subtype: string;
            name: string;
            time: {
              startMonth: number;
              endMonth: number;
            };
            price: number;
          },
        ];
      },
    ] = req.body.map((newactivity) => ({
      id: newactivity.id,
      activities: newactivity.activities.filter((el) => el !== "none").map((el) => JSON.parse(el)),
    }));

    system!.uniqueSpecies.forEach((uniqueSpecies) => {
      const match = newActivities.find((el) => el.id === uniqueSpecies.id.toString());

      if (match) {
        uniqueSpecies.activities = match!.activities;
      }
    });

    await system?.save();

    res.send();
  },
);

// --------- SYSTEM LAYOUT CUSTOM ALIGNMENT ROUTES --------

// ALIGNMENT NEW ROUTE
router.get(
  "/projects/:id/alignmentrow/new",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id).populate("layer").exec();
      if (foundProject) {
        // FIND MY SYSTEMS
        try {
          const foundSequences = await Sequence.find({
            "owner.id": req.user?._id,
          });
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
router.put(
  "/projects/:id/alignmentrow",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const project = await Project.findById(req.params.id);
      project?.set({
        alignment: "bearing",
        bearingline: sanitizeMongoValue(req.body.geometry),
      });
      await project?.save();
      // req.flash("success", "Successfully added service");
      res.send(`/projects/${escapeHtml(req.params.id)}/layout`);
    } catch (err) {
      console.log(err);
    }
  },
);

// -------------------- PDFS

// BUDGET PDF
router.get(
  "/projects/:id/budgetpdf",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT

    // GENERATE PDF TEST
    const myDoc = new PDFDocument({ bufferPages: true });

    const buffers: any[] = [];
    myDoc.on("data", buffers.push.bind(buffers));
    myDoc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        "Content-Length": Buffer.byteLength(pdfData),
        "Content-Type": "application/pdf",
        "Content-disposition": "attachment;filename=test.pdf",
      });
    });

    myDoc.font("Times-Roman").fontSize(12).text("this is a test text");

    myDoc.end();
  },
);

router.put(
  "/projects/:projectid/set-public",
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    const isPublic = req.body.isPublic;
    const projectid = req.params.projectid;
    const project = await Project.findById(projectid);

    if (project && typeof isPublic === "boolean") {
      project.isPublic = isPublic;
      await project.save();
      res.sendStatus(200);
    } else {
      res.sendStatus(400);
    }
  },
);

// PROJECT SHOW ROUTE
router.get(
  "/layers/:layerid/projects/:id",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundLayer = await Layer.findById(req.params.layerid)
        .populate("systems.future")
        .populate("projects")
        .populate("systems.present")
        .populate("systems.past")
        .exec();

      try {
        const foundProject = await Project.findById(req.params.id)
          .populate("layer")
          .populate("assets")
          .populate("budgets.establishment")
          .populate("budgets.management")
          .populate("system")
          .populate("edgesystem")
          .populate("activities")
          .exec();
        if (foundProject) {
          // TEST WITH BLANK
          let estPostings: IPostingSchema[] = [];
          if (foundProject.budgets.establishment) {
            estPostings = foundProject.budgets.establishment.postings;
          }

          try {
            const establishementPostings = await Posting.find({
              _id: estPostings,
            });

            console.log(`Establishment postings: ${establishementPostings.length}`);
            // TEST WITH BLANK
            let manPostings: IPostingSchema[] = [];
            if (foundProject.budgets.management) {
              manPostings = foundProject.budgets.management.postings;
            }

            try {
              const managementPostings = await Posting.find({
                _id: manPostings,
              });
              console.log(`Management postings: ${managementPostings.length}`);
              const irr = 0;
              // SET YEARS VARIABLE FOR BOTH GRAPH AND BUDGET
              let years = 0;
              if (foundProject.budgets.establishment || foundProject.budgets.management) {
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
              if (foundProject.budgets.establishment || foundProject.budgets.management) {
                // var totalEstablishment = 0;
                if (establishementPostings.length > 0) {
                  for (let i = 0; i < establishementPostings.length; i++) {
                    if (
                      establishementPostings[i].postType === "labor" ||
                      establishementPostings[i].postType === "material"
                    ) {
                      YoY[establishementPostings[i].year] -=
                        establishementPostings[i].value * establishementPostings[i].amount;
                    } else if (
                      establishementPostings[i].postType === "product" ||
                      establishementPostings[i].postType === "service"
                    ) {
                      YoY[establishementPostings[i].year] +=
                        establishementPostings[i].value * establishementPostings[i].amount;
                    }
                  }
                }
                if (managementPostings.length > 0) {
                  for (let i = 0; i < managementPostings.length; i++) {
                    if (
                      managementPostings[i].postType === "labor" ||
                      managementPostings[i].postType === "material"
                    ) {
                      YoY[managementPostings[i].year] -=
                        managementPostings[i].value * managementPostings[i].amount;
                    } else if (
                      managementPostings[i].postType === "product" ||
                      managementPostings[i].postType === "service"
                    ) {
                      YoY[managementPostings[i].year] +=
                        managementPostings[i].value * managementPostings[i].amount;
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
          console.log("No foundProject");
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// --------------- NESTED ROUTES ---------------- //

export default router;
