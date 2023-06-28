import express from "express";
import unique from "array-unique";
import { length as turfLength, helpers as turf, along } from "@turf/turf";
import Farmflow from "../models/farmflow.js";
import Parcel from "../models/parcel.js";
import Layer from "../models/layer.js";
import Row from "../models/row.js";
import Area from "../models/area.js";
import Species, { ISpeciesSchema } from "../models/species.js";
import middleware from "../middleware/index.js";
import { UserDocument } from "../models/user.js";
import { Auth0IDToken, Variables } from "../app.js";

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
  // PARCEL FARMFLOWS
  router.get("/parcels/:entityid/farmflows", async (c) => {
    await middleware.isLoggedIn(c);
    try {
      // FIND PARCEL
      const foundParcel = await Parcel.findById(c.req.param('entityid'))
        .populate({
          path: "layers",
          populate: { path: "rows", populate: { path: "farmflows" } },
        })
        .populate({
          path: "layers",
          populate: { path: "areas", populate: { path: "farmflows" } },
        })
        .exec();
      // RENDER ACTIVITIES
      return c.json({ parcel: foundParcel });
    } catch (err) {
      console.log(err);
    }
  });

  // --------------- NESTED ROUTES ROW BASED ---------------- //

  router.get("/parcels/:entityid/layers/:pid/rows/:rid/farmflows/new", async (c) => {
    await middleware.isLoggedIn(c);
    // FIND ROW SEQUENCE SPECIES
    const foundRow = await Row.findById(c.req.param('rid'))
      .populate({ path: "sequence", populate: { path: "model.species" } })
      .exec();
    if (foundRow) {
      // FIND ALL SPECIES
      if (foundRow.sequence) {
        console.log("species there");
        const allSpecies: ISpeciesSchema[] = [];
        foundRow.sequence.model.forEach((species) => {
          allSpecies.push(species.species);
        });
        // FIND UNIQUE SPECIES / REMOVE DUPLICATES
        const uniqueSpecies = unique(allSpecies);
        console.log(uniqueSpecies);
        return c.json({
          parcelid: c.req.param('entityid'),
          layerid: c.req.param('pid'),
          rowid: c.req.param('rid'),
          row: foundRow,
          species: uniqueSpecies,
        });
      } else {
        c.status(400);
        return c.json({ error: "Row with the requested id does not exist" });
      }
    }
  });

  // CREATE FARMFLOW ON ROW
  router.post("/parcels/:entityid/layers/:pid/rows/:rid/farmflows", async (c) => {
    await middleware.isLoggedIn(c);
    // FIND SPECIES
    try {
      const foundSpecies = await Species.findById((await c.req.json()).species);
      // CREATE ACTIVITY
      const newFarmFlow = (await c.req.json()).farmflow;
      newFarmFlow.species = foundSpecies;
      const createdFarmflow = await Farmflow.create(newFarmFlow);

      try {
        await Row.findByIdAndUpdate(c.req.param('rid'), {
          $push: { farmflows: createdFarmflow },
        });
        return c.json(`/parcels/${c.req.param('entityid')}/farmflows`);
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  });

  // --------------- NESTED ROUTES AREA BASED ---------------- //

  router.get("/parcels/:entityid/layers/:pid/areas/:rid/farmflows/new", async (c) => {
    await middleware.isLoggedIn(c);
    // FIND AREA ROTATION SPECIES
    const foundArea = await Area.findById(c.req.param('rid'))
      .populate({
        path: "rotation",
        populate: { path: "model.speciesmix.species" },
      })
      .exec();

    // FIND ALL SPECIES
    if (foundArea && foundArea.rotation) {
      console.log("species there");
      const allSpecies: ISpeciesSchema[] = [];
      foundArea.rotation.model.forEach((speciesmix) => {
        allSpecies.push(speciesmix.speciesmix[0].species);
      });
      // FIND UNIQUE SPECIES / REMOVE DUPLICATES
      const uniqueSpecies = unique(allSpecies);
      console.log(uniqueSpecies);
      return c.json({
        parcelid: c.req.param('entityid'),
        layerid: c.req.param('pid'),
        areaid: c.req.param('rid'),
        area: foundArea,
        species: uniqueSpecies,
      });
    } else {
      c.status(400);
      return c.json({ error: "Area with the requested id does not exist" });
    }
  });

  // CREATE FARMFLOW ON AREA
  router.post("/parcels/:entityid/layers/:pid/areas/:rid/farmflows", async (c) => {
    await middleware.isLoggedIn(c);
    // FIND SPECIES
    try {
      const foundSpecies = await Species.findById((await c.req.json()).species);
      // CREATE ACTIVITY
      const newFarmFlow = (await c.req.json()).farmflow;
      newFarmFlow.species = foundSpecies;
      const createdFarmflow = await Farmflow.create(newFarmFlow);

      try {
        await Area.findByIdAndUpdate(c.req.param('rid'), {
          $push: { farmflows: createdFarmflow },
        });
        return c.json(`/parcels/${c.req.param('entityid')}/farmflows`);
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  });

  // VIZ YIELDS
  router.get("/parcels/:entityid/layers/:pid/farmflows/viz", async (c) => {
    await middleware.isLoggedIn(c);
    // CREATE ACTIVITY
    const foundLayer = await Layer.findById(c.req.param('pid'))
      .populate({ path: "rows", populate: { path: "farmflows" } })
      .populate({ path: "rows", populate: { path: "sequence" } })
      .exec();
    if (foundLayer) {
      // CREATE ROW ASSETS AND SORT ACCORDING TO YIELDS
      let max = 0;
      let min = 100000;
      for (let i = 0; i < foundLayer.rows.length; i++) {
        for (let j = 0; j < foundLayer.rows[i].farmflows.length; j++) {
          if (foundLayer.rows[i].farmflows[j].amount > max) {
            max = foundLayer.rows[i].farmflows[j].amount;
          }
          if (foundLayer.rows[i].farmflows[j].amount < min) {
            min = foundLayer.rows[i].farmflows[j].amount;
          }
        }
      }
      // const rowArrayLow = [];
      // const rowArrayMed = [];
      // const rowArrayHigh = [];
      // CREATE MARKERS
      const treeAssetsArray: {
        marker: turf.Feature<turf.Point, turf.Properties>;
        species: ISpeciesSchema;
      }[] = [];
      for (let i = 0; i < foundLayer.rows.length; i++) {
        // SET ROW DATA
        if (foundLayer.rows[i].sequence) {
          const datasetRows = foundLayer.rows[i].sequence.model;
          /* foundLayer.rows[i].sequence.model.forEach(function (species) {
                        var count = 0;
                        for (j = 0; j < datasetRows.length; j++) {
                            if (datasetRows[j].row === species.position[0]) {
                                datasetRows[j].array.push(species);
                                count = count + 1;
                            }
                        }
                        if (count === 0) {
                            datasetRows.push({row: species.position[0], array: [species]});
                        }
                    }); */
          // SORT ROW ITEMS
          datasetRows.sort((a, b) => {
            if (a.position < b.position) {
              return -1;
            }
            if (a.position > b.position) {
              return 1;
            }
            return 0;
          });
          // ROW LENGTH
          const rowLine = JSON.parse(foundLayer.rows[i].geometry);
          const rowLength = turfLength(rowLine, { units: "meters" });
          console.log(`Row length ${rowLength}`);
          // SYSTEM MODEL LENGTH
          const systemModelLength = foundLayer.rows[i].sequence.sequencelength;
          /* if (datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1] <= 1) {
                        systemModelLength = datasetRows[1].array[(datasetRows[1].array.length - 1)].position[1];
                    } else {
                        systemModelLength = datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1];
                    } */
          console.log(`System model length:${systemModelLength}`);
          // FIND MODEL COUNT AND REST
          const systemModelCount = Math.floor(rowLength / systemModelLength);
          const systemModelRowRest =
            (rowLength / systemModelLength -
              Math.floor(rowLength / systemModelLength)) *
            systemModelLength;
          // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
          const firstTreeMarker = turf.point(rowLine.geometry.coordinates[0]);
          /*
                    treeMarkerArray.push(firstTreeMarker);
*/
          const firstAsset = {
            marker: firstTreeMarker,
            species: datasetRows[datasetRows.length - 1].species,
          };
          treeAssetsArray.push(firstAsset);
          // ROW MARKERS
          // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
          for (let j = 0; j < systemModelCount; j++) {
            for (let k = 0; k < datasetRows.length; k++) {
              // CREATE COORDINATES FOR THE TREE
              const treeMarker = along(
                rowLine,
                j * systemModelLength + datasetRows[k].position,
                { units: "meters" }
              );
              // CREATE ASSET OBJECT
              /* var asset = {
                                species: treeRows[treeRowCount].array[k].species.id,
                                lat: treeMarker.geometry.coordinates[0],
                                lng: treeMarker.geometry.coordinates[1],
                                name: treeRows[treeRowCount].array[k].species.nameCommon
                            }; */
              //
              const asset = {
                marker: treeMarker,
                species: datasetRows[k].species,
              };
              // ADD TREE OBJECT TO ARRAY
              /*
                            treeMarkerArray.push(treeMarker);
*/
              treeAssetsArray.push(asset);
            }
          }
          // ADD REST
          for (let j = 0; j < datasetRows.length; j++) {
            if (datasetRows[j].position < systemModelRowRest) {
              /*
                                                                    treeArray.push(treeRows[treeRowCount].array[j].species);
                            */
              // ADD POINT MARKER FOR REMAINING TREES
              const treeMarker2 = along(
                rowLine,
                systemModelCount * systemModelLength + datasetRows[j].position,
                { units: "meters" }
              );
              const asset2 = {
                marker: treeMarker2,
                species: datasetRows[j].species,
              };
              /*
                            treeMarkerArray.push(treeMarker2);
*/
              treeAssetsArray.push(asset2);
            }
          }
        }
      }
      console.log(`max: ${max}`);
      console.log(`min: ${min}`);
      return c.json(`/parcels/${c.req.param('entityid')}/farmflows`);
      /*
            return c.json("farmflows/viz");
*/
    }
  });
}
