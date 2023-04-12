import express from 'express';
import unique from 'array-unique';
import { length as turfLength, helpers as turf, along } from '@turf/turf';
import Farmflow from '../models/farmflow';
import Parcel from '../models/parcel';
import Layer from '../models/layer';
import Row from '../models/row';
import Area from '../models/area';
import Species, { ISpeciesSchema } from '../models/species';
import middleware from '../middleware';
import { UserDocument } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();

// PARCEL FARMFLOWS
router.get(
  '/parcels/:id/farmflows',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    try {
    // FIND PARCEL
      const foundParcel = await Parcel.findById(req.params.id)
        .populate({
          path: 'layers',
          populate: { path: 'rows', populate: { path: 'farmflows' } },
        })
        .populate({
          path: 'layers',
          populate: { path: 'areas', populate: { path: 'farmflows' } },
        })
        .exec();
      // RENDER ACTIVITIES
      res.send({ parcel: foundParcel });
    } catch (err) {
      console.log(err);
    }
  },
);

// --------------- NESTED ROUTES ROW BASED ---------------- //

router.get(
  '/parcels/:id/layers/:pid/rows/:rid/farmflows/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND ROW SEQUENCE SPECIES
    const foundRow = await Row.findById(req.params.rid)
      .populate({ path: 'sequence', populate: { path: 'model.species' } })
      .exec();
    if (foundRow) {
      // FIND ALL SPECIES
      if (foundRow.sequence) {
        console.log('species there');
        const allSpecies: ISpeciesSchema[] = [];
        foundRow.sequence.model.forEach((species) => {
          allSpecies.push(species.species);
        });
        // FIND UNIQUE SPECIES / REMOVE DUPLICATES
        const uniqueSpecies = unique(allSpecies);
        console.log(uniqueSpecies);
        res.send({
          parcelid: req.params.id,
          layerid: req.params.pid,
          rowid: req.params.rid,
          row: foundRow,
          species: uniqueSpecies,
        });
      } else {
        res.send('back');
      }
    }
  },
);

// CREATE FARMFLOW ON ROW
router.post(
  '/parcels/:id/layers/:pid/rows/:rid/farmflows',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND SPECIES
    try {
      const foundSpecies = await Species.findById(req.body.species);
      // CREATE ACTIVITY
      const newFarmFlow = req.body.farmflow;
      newFarmFlow.species = foundSpecies;
      const createdFarmflow = await Farmflow.create(newFarmFlow);

      try {
        await Row.findByIdAndUpdate(
          req.params.rid,
          { $push: { farmflows: createdFarmflow } },
        );
        res.send(`/parcels/${req.params.id}/farmflows`);
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// --------------- NESTED ROUTES AREA BASED ---------------- //

router.get(
  '/parcels/:id/layers/:pid/areas/:rid/farmflows/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND AREA ROTATION SPECIES
    const foundArea = await Area.findById(req.params.rid)
      .populate({
        path: 'rotation',
        populate: { path: 'model.speciesmix.species' },
      })
      .exec();

    // FIND ALL SPECIES
    if (foundArea && foundArea.rotation) {
      console.log('species there');
      const allSpecies: ISpeciesSchema[] = [];
      foundArea.rotation.model.forEach((speciesmix) => {
        allSpecies.push(speciesmix.speciesmix[0].species);
      });
      // FIND UNIQUE SPECIES / REMOVE DUPLICATES
      const uniqueSpecies = unique(allSpecies);
      console.log(uniqueSpecies);
      res.send({
        parcelid: req.params.id,
        layerid: req.params.pid,
        areaid: req.params.rid,
        area: foundArea,
        species: uniqueSpecies,
      });
    } else {
      res.send('back');
    }
  },
);

// CREATE FARMFLOW ON AREA
router.post(
  '/parcels/:id/layers/:pid/areas/:rid/farmflows',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND SPECIES
    try {
      const foundSpecies = await Species.findById(req.body.species);
      // CREATE ACTIVITY
      const newFarmFlow = req.body.farmflow;
      newFarmFlow.species = foundSpecies;
      const createdFarmflow = await Farmflow.create(newFarmFlow);

      try {
        await Area.findByIdAndUpdate(
          req.params.rid,
          { $push: { farmflows: createdFarmflow } },
        );
        res.send(`/parcels/${req.params.id}/farmflows`);
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// VIZ YIELDS
router.get(
  '/parcels/:id/layers/:pid/farmflows/viz',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // CREATE ACTIVITY
    const foundLayer = await Layer.findById(req.params.pid)
      .populate({ path: 'rows', populate: { path: 'farmflows' } })
      .populate({ path: 'rows', populate: { path: 'sequence' } })
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
          const rowLength = turfLength(rowLine, { units: 'meters' });
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
          const systemModelRowRest = (rowLength / systemModelLength
              - Math.floor(rowLength / systemModelLength))
            * systemModelLength;
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
                { units: 'meters' },
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
                { units: 'meters' },
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
      res.send(`/parcels/${req.params.id}/farmflows`);
      /*
            res.send("farmflows/viz");
*/
    }
  },
);

export default router;
