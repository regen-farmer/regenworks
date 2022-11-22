import express from 'express';
import { centroid, helpers as turf } from '@turf/turf';
import Parcel from '../models/parcel';
import Layer from '../models/layer';
import Soiltest from '../models/soiltest';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';

const router = express.Router();

// PARCEL LAYER SOIL TEST NEW
router.get(
  '/parcels/:id/layers/:pid/soiltests/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND PARCEL
    try {
      const foundParcel = await Parcel.findById(req.params.id)
        .populate('layers')
        .exec();
      // FIND LAYER

      try {
        const foundLayer = await Layer.findById(req.params.pid);
        res.render('soiltests/new', {
          parcel: foundParcel,
          layer: foundLayer,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PARCEL LAYER SOIL TEST CREATE
router.post(
  '/parcels/:id/layers/:pid/soiltests',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // PARSE COORDINATES
    /* var soilTest = req.body.soiltest;
    var parsedCoordinates = req.body.coordinates.split(", ");
    console.log(parsedCoordinates);
    soiltest.lat = parsedCoordinates[0];
    soiltest.lat = parsedCoordinates[1];
    res.redirect("/parcels/" + req.params.id + "/status"); */
    // CREATE SOIL TEST
    try {
      const createdSoiltest = await Soiltest.create(req.body.soiltest);
      Layer.findByIdAndUpdate(
        req.params.pid,
        { $push: { soiltests: createdSoiltest } },
        (err) => {
          if (err) {
            console.log(err);
          } else {
            // RENDER PARCEL LAYER SOIL TEST PAGE
            res.redirect(`/parcels/${req.params.id}/status`);
          }
        },
      );
    } catch (err) {
      console.log(err);
    }
  },
);

// PARCEL
router.get(
  '/parcels/:id/soiltests/viz',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND PARCEL
    try {
      const foundParcel = await Parcel.findById(req.params.id)
        .populate({ path: 'layers', populate: { path: 'soiltests' } })
        .exec();
      if (foundParcel) {
        const geometry = turf.polygon([
          [
            [0, 0],
            [0, 1],
            [1, 0],
            [0, 0],
          ],
        ]);
        const geometryArray1: any[] = [];
        const geometryArray2: any[] = [];
        const geometryArray3: any[] = [];
        const geometryArray4: any[] = [];
        const geometryArray5: any[] = [];
        const placesArray: any[] = [];
        geometryArray1.push(geometry);
        geometryArray2.push(geometry);
        geometryArray3.push(geometry);
        geometryArray4.push(geometry);
        geometryArray5.push(geometry);
        if (foundParcel.layers.length > 0) {
          for (let i = 0; foundParcel.layers.length > i; i++) {
            // GET GEOMETRY
            const polygon = JSON.parse(foundParcel.layers[i].geometry);
            // PUSH TO ARRAY
            const properties = {
              description: foundParcel.layers[i].name,
            };
            const feature = turf.feature(polygon.geometry, properties);
            if (
              foundParcel.layers[i].soiltests.length
              && foundParcel.layers[i].soiltests.length > 0
            ) {
              if (foundParcel.layers[i].soiltests[0].fertility.SOM > 4) {
                geometryArray1.push(feature);
              } else if (foundParcel.layers[i].soiltests[0].fertility.SOM > 3) {
                geometryArray2.push(feature);
              } else if (foundParcel.layers[i].soiltests[0].fertility.SOM > 2) {
                geometryArray3.push(feature);
              } else if (foundParcel.layers[i].soiltests[0].fertility.SOM > 1) {
                geometryArray4.push(feature);
              } else if (foundParcel.layers[i].soiltests[0].fertility.SOM > 0) {
                geometryArray5.push(feature);
              }
            }
            // CREATE PLACE
            const centroidPoint = centroid(polygon.geometry);
            const place = turf.point(
              centroidPoint.geometry.coordinates,
              properties,
            );
            placesArray.push(place);
          }
        }
        // CREATE LABEL COLLECTION
        const placesCollection = turf.featureCollection(placesArray);
        const places = JSON.stringify(placesCollection);
        // CREATE FEATURECOLLECTION
        const featurecollection1 = turf.featureCollection(geometryArray1);
        const collection1 = JSON.stringify(featurecollection1);
        const featurecollection2 = turf.featureCollection(geometryArray2);
        const collection2 = JSON.stringify(featurecollection2);
        const featurecollection3 = turf.featureCollection(geometryArray3);
        const collection3 = JSON.stringify(featurecollection3);
        const featurecollection4 = turf.featureCollection(geometryArray4);
        const collection4 = JSON.stringify(featurecollection4);
        const featurecollection5 = turf.featureCollection(geometryArray5);
        const collection5 = JSON.stringify(featurecollection5);
        res.render('soiltests/viz', {
          parcel: foundParcel,
          collection1,
          collection2,
          collection3,
          collection4,
          collection5,
          places,
        });

        /* Layer.findById(req.params.pid, function(err, foundLayer){
           if(err){
               console.log(err);
           } else {
               // RENDER ACTIVITIES
           }
       }); */
      } else {
        console.log('No foundParcel');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

export default router;
