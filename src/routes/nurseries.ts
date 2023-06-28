import express from 'express';
import NodeGeocoder from 'node-geocoder';
import Nursery from '../models/nursery.js';
import User, { UserDocument } from '../models/user.js';
import middleware from '../middleware/index.js';
import { Auth0IDToken, Variables } from '../app.js';

// NODE GEOCODER CODE
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

const options: NodeGeocoder.Options = {
  provider: 'google',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
};

const geocoder = NodeGeocoder(options);

// NURSERY INDEX
router.get('/nurseries', async (c) => {
await middleware.isLoggedIn(c);
  // FIND NURSERY BASED ON USER
  try {
    const foundNurseries = await Nursery.find({ 'owner.id': c.get('user')?._id });
    console.log(foundNurseries.length);
    return c.json({ nurseries: foundNurseries });
  } catch (err) {
    console.log(err);
  }
});

// NURSERY NEW
router.get('/nurseries/new', async (c) => {
await middleware.isLoggedIn(c);
  // ADMIN LOGIN REQUIRED
  return c.json({});
});

// ANIMAL CREATE
router.post('/nurseries', async (c) => {
await middleware.isLoggedIn(c);
  // SET INITIAL VARIABLE
  const newNursery = (await c.req.json()).nursery;
  // GEOLOCATION
  geocoder.geocode((await c.req.json()).nursery.location, async (err, data) => {
    if (err || !data.length) {
      console.log(err);
      console.log(data);
      c.status(500)
      return c.json({ error: `Error while geocoding: ${err.toString()}` });
    }
    // SET NEW LATS
    newNursery.lat = data[0].latitude;
    newNursery.lng = data[0].longitude;
    newNursery.location = data[0].formattedAddress;
    try {
      const createdNursery = await Nursery.create(newNursery);
      // SET OWNERSHIP
      createdNursery.owner.id = c.get('user')?._id.toString()!;
      await createdNursery.save();
      // ADD TO USER
      try {
        const foundUser = await User.findById(c.get('user')?._id);
        // Add the parcel to the users parcels for referencing
        if (foundUser) {
          foundUser.nurseries.push(createdNursery);
          await foundUser.save();
          // REDIRECT
          console.log(`Nursery created: ${createdNursery}`);
          return c.json(`/nurseries/${createdNursery._id}`);
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  });
});

// NURSERY SHOW
router.get('/nurseries/:id', async (c) => {
await middleware.isLoggedIn(c);
  // DO OWNERSHIP MODEL
  // FIND NURSERY
  try {
    const foundNursery = await Nursery.findById(c.req.param('id'))
      .populate('products')
      .exec();
    // RENDER SHOW PAGE
    return c.json({ nursery: foundNursery });
  } catch (err) {
    console.log(err);
  }
});

// NURSERY EDIT
router.get('/nurseries/:id/edit', async (c) => {
await middleware.isLoggedIn(c);
  // FIND NURSERY
  try {
    const foundNursery = await Nursery.findById(c.req.param('id'));
    return c.json({ nursery: foundNursery });
  } catch (err) {
    console.log(err);
  }
});

// NURSERY UPDATE
router.put('/nurseries/:id', async (c) => {
await middleware.isLoggedIn(c);
  // SETUP NEW GEO
  // SET INITIAL VARIABLE
  const newNursery = (await c.req.json()).nursery;
  // GEOLOCATION
  geocoder.geocode((await c.req.json()).nursery.location, async (err, data) => {
    if (err || !data.length) {
      console.log(err);
      console.log(data);
      c.status(500)
      return c.json({ error: `Error while geocoding: ${err.toString()}` });
    }
    // SET NEW LATS
    newNursery.lat = data[0].latitude;
    newNursery.lng = data[0].longitude;
    newNursery.location = data[0].formattedAddress;
    try {
      const updateNursery = await Nursery.findByIdAndUpdate(
        c.req.param('id'),
        newNursery,
      );
      // REDIRECT
      if (updateNursery) {
        console.log(`Nursery update: ${updateNursery}`);
        return c.json(`/nurseries/${updateNursery._id}`);
      } else {
        console.log('No updateNursery');
      }
    } catch (err) {
      console.log(err);
    }
  });
});

}
