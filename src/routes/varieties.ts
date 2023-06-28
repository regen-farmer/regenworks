import express from 'express';
import Variety from '../models/variety.js';
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

// VARIETY INDEX
router.get('/varieties', async (c) => {
await middleware.isLoggedIn(c);
  // Get all varieties from DB
  try {
    const allUserVarieties = await Variety.find({ 'owner.id': c.get('user')?._id }).populate('species').exec();
    return c.json({ varieties: allUserVarieties });
  } catch (err) {
    console.log(err);
  }
});

// VARIETY NEW
router.get('/varieties/new', async (c) => {
await middleware.isLoggedIn(c);
  // FIND ALL SPECIES
  try {
    const allSpecies = await Species.find();
    // SORT SPECIES
    allSpecies.sort((a, b) => {
      if (a.genus < b.genus) {
        return -1;
      }
      if (a.genus > b.genus) {
        return 1;
      }
      return 0;
    });
    return c.json({ species: allSpecies });
  } catch (err) {
    console.log(err);
  }
});

// VATERTY CREATE
router.post('/varieties', async (c) => {
await middleware.isLoggedIn(c);
const payload = await c.req.json();
  // CLEAN NONE OPTIONS
  const variety = payload.variety;
  if (payload.variety.species === '') {
    delete variety.species;
  }
  if (payload.variety.hybrid === '') {
    delete variety.hybrid;
  }
  if (payload.variety.rootstock.species === '') {
    delete variety.rootstock.species;
  }
  // CREATE VARIETY
  const createdVariety = await Variety.create(variety);

  // SET OWNERSHIP
  createdVariety.owner.id = c.get('user')?._id.toString()!;
  await createdVariety.save();
  // REDIRECT TO USER
  return c.json(`/users/${c.get('user')?._id}`);
});

}
