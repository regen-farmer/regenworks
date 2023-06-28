import express from 'express';
import Flow from '../models/flow.js';
import Species from '../models/species.js';
import Parcel from '../models/parcel.js';
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

// PARCEL FLOWS
router.get('/parcels/:entityid/flows', async (c) => {
await middleware.isLoggedIn(c);
  try {
    // FIND PARCEL
    const foundParcel = await Parcel.findById(c.req.param('entityid')).populate({ path: 'layers', populate: { path: 'rows' } }).exec();
    return c.json({ parcel: foundParcel });
  } catch (err) {
    console.log(err);
  }
});

// NESTED SPECIES FLOW NEW ROUTE
router.get('/species/:entityid/flows/new', async (c) => {
await middleware.isLoggedIn(c);
  try {
    const foundSpecies = await Species.findById(c.req.param('entityid'));
    return c.json({ species: foundSpecies });
  } catch (err) {
    console.log(err);
  }
});

// NESTED SPECIES FLOW CREATE ROUTE
router.post('/species/:entityid/flows', async (c) => {
await middleware.isLoggedIn(c);
  // FIND SPECIES
  try {
    const foundSpecies = await Species.findById(c.req.param('entityid'));
    console.log((await c.req.json()).flow);

    if (foundSpecies) {
      try {
        const createdFlow = await Flow.create((await c.req.json()).flow);
        foundSpecies.flows.push(createdFlow);
        await foundSpecies.save();
        return c.json(`/species/${foundSpecies._id}`);
      } catch (err) {
        console.log(err);
      }
    }
  } catch (err) {
    console.log(err);
  }
});

// NESTED SYSTEM FLOW NEW ROUTE

// NESTED SYSTEM FLOW CREATE ROUTE

}
