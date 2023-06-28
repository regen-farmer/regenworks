import express from 'express';
// import Well from "../models/well.js";
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
// import Species from "../models/species.js";
// import Animal from "../models/animal.js";

// NESTED PARCEL WELL NEW ROUTE
router.get('/parcels/:id/wells/new', async (c) => {
await middleware.isLoggedIn(c);
  // FIND PARCEL ID
  try {
    const foundParcel = await Parcel.findById(c.req.param('id'));
    return c.json({ parcel: foundParcel });
  } catch (err) {
    console.log(err);
  }
});

// NESTED PARCEL WELL CREATE ROUTE

}
