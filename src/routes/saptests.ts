import express from 'express';
import Parcel from '../models/parcel.js';
import Layer from '../models/layer.js';
import Saptest from '../models/saptest.js';
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

// PARCEL LAYER SAP TEST NEW
router.get('/parcels/:entityid/layers/:pid/saptests/new', async (c) => {
await middleware.isLoggedIn(c);
  // FIND PARCEL
  try {
    const foundParcel = Parcel.findById(c.req.param('entityid')).populate('layers').exec();
    // FIND LAYER

    try {
      const foundLayer = Layer.findById(c.req.param('pid'));
      // RENDER ACTIVITIES
      return c.json({ parcel: foundParcel, layer: foundLayer });
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// PARCEL LAYER SOIL TEST CREATE
router.post('/parcels/:entityid/layers/:pid/saptests', async (c) => {
await middleware.isLoggedIn(c);
const payload = await c.req.json();
  // PARSE COORDINATES
  /* var sapTest = payload.saptest;
    var parsedCoordinates = payload.coordinates.split(", ");
    console.log(parsedCoordinates);
    soiltest.lat = parsedCoordinates[0];
    soiltest.lat = parsedCoordinates[1];
    return c.json("/parcels/" + c.req.param('entityid') + "/status"); */
  // CREATE SOIL TEST
  try {
    const createdSaptest = await Saptest.create(payload.saptest);
    try {
      await Layer.findByIdAndUpdate(c.req.param('pid'), { $push: { saptests: createdSaptest } });
      // RENDER PARCEL LAYER SAP TEST PAGE
      return c.json(`/parcels/${c.req.param('entityid')}/status`);
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

}
