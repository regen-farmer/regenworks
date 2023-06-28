import express from 'express';
import Systemflow from '../models/systemflow.js';
import System from '../models/system.js';
import Species from '../models/species.js';
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

// SYSTEMFLOW INDEX ROUTE

// NESTED SYSTEM SYSTEMFLOW NEW ROUTE
router.get('/systems/:entityid/flows/new', async (c) => {
await middleware.isLoggedIn(c);
  // FIND SYSTEM ID
  try {
    const foundSystem = await System.findById(c.req.param('entityid'));
    const foundSpecies = await Species.find();

    // SORT SPECIES
    foundSpecies.sort((a, b) => {
      if (a.nameCommon < b.nameCommon) {
        return -1;
      }
      if (a.nameCommon > b.nameCommon) {
        return 1;
      }
      return 0;
    });
    return c.json({ system: foundSystem, species: foundSpecies });
  } catch (err) {
    console.log(err);
  }
});

// NESTED SYSTEM SYSTEMFLOW CREATE ROUTE
router.post('/systems/:entityid/flows', async (c) => {
await middleware.isLoggedIn(c);
  // FIND SYSTEM
  try {
    const foundSystem = await System.findById(c.req.param('entityid'));
    const flow = (await c.req.json()).flow;
    const data: any[] = [];
    for (let i = 0; i < flow.data.length; i++) {
      if (!(flow.data[i].species === '')) {
        data.push(flow.data[i]);
      }
    }
    flow.data = data;

    if (foundSystem) {
      try {
        const createdSystemflow = await Systemflow.create((await c.req.json()).flow);
        foundSystem.flows.push(createdSystemflow);
        await foundSystem.save();
        return c.json(`/systems/${foundSystem._id}`);
      } catch (err) {
        console.log(err);
      }
    }
  } catch (err) {
    console.log(err);
  }
});

}
