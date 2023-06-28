import express from 'express';
import { centroid, helpers as turf } from '@turf/turf';
import Parcel from '../models/parcel.js';
import Layer from '../models/layer.js';
import Soiltest from '../models/soiltest.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken, Variables } from '../app.js';

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

// PARCEL LAYER SOIL TEST NEW
router.get(
  '/parcels/:entityid/layers/:pid/soiltests/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PARCEL
    try {
      const foundParcel = await Parcel.findById(c.req.param('entityid'))
        .populate('layers')
        .exec();
      // FIND LAYER

      try {
        const foundLayer = await Layer.findById(c.req.param('pid'));
        return c.json({
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
  '/parcels/:entityid/layers/:pid/soiltests',
  async (c) => {
    await middleware.isLoggedIn(c)
    const payload = await c.req.json();
    // PARSE COORDINATES
    /* var soilTest = payload.soiltest;
    var parsedCoordinates = payload.coordinates.split(", ");
    console.log(parsedCoordinates);
    soiltest.lat = parsedCoordinates[0];
    soiltest.lat = parsedCoordinates[1];
    return c.json("/parcels/" + c.req.param('entityid') + "/status"); */
    // CREATE SOIL TEST
    try {
      const createdSoiltest = await Soiltest.create(payload.soiltest);
      try {
        await Layer.findByIdAndUpdate(
          c.req.param('pid'),
          { $push: { soiltests: createdSoiltest } },
        );
        // RENDER PARCEL LAYER SOIL TEST PAGE
        return c.json(`/parcels/${c.req.param('entityid')}/status`);
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PARCEL
router.get(
  '/parcels/:entityid/soiltests/viz',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PARCEL
    try {
      const foundParcel = await Parcel.findById(c.req.param('entityid'))
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
        const geometryArray1: turf.Feature[] = [];
        const geometryArray2: turf.Feature[] = [];
        const geometryArray3: turf.Feature[] = [];
        const geometryArray4: turf.Feature[] = [];
        const geometryArray5: turf.Feature[] = [];
        const placesArray: turf.Feature[] = [];
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
        return c.json({
          parcel: foundParcel,
          collection1,
          collection2,
          collection3,
          collection4,
          collection5,
          places,
        });

        /* Layer.findById(c.req.param('pid'), function(err, foundLayer){
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

}
