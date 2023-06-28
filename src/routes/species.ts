import express from 'express';
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

// SPECIES INDEX
router.get('/species', async (c) => {
  await middleware.adminIsLoggedIn(c);
  try {
    const foundSpecies = await Species.find();
    return c.json({ species: foundSpecies });
  } catch (err) {
    console.log(err);
  }
});

// SPECIES NEW
router.get('/species/new', async (c) => {
await middleware.isLoggedIn(c);
  // ONLY ADMIN ACCESS?
  return c.json({});
});

// SPECIES CREATE
router.post('/species', async (c) => {
await middleware.isLoggedIn(c);
  // ONLY ADMIN ACCESS?
  try {
    const createdSpecies = await Species.create((await c.req.json()).species);
    console.log(createdSpecies);
    return c.json(createdSpecies);
  } catch (err) {
    console.log(err);
  }
});

// SPECIES SHOW
router.get('/species/:id', async (c) => {
  await middleware.adminIsLoggedIn(c)
  try {
  // ONLY ADMIN ACCESS?
    const foundSpecies = await Species.findById(c.req.param('id'))
      .populate('flows')
      .exec();
    return c.json({ species: foundSpecies });
  } catch (err) {
    console.log(err);
  }
});

// SPECIES EDIT
router.get('/species/:id/edit', async (c) => {
await middleware.isLoggedIn(c);
  // ONLY ADMIN ACCESS?
  try {
    const foundSpecies = await Species.findById(c.req.param('id'));
    return c.json({ species: foundSpecies });
  } catch (err) {
    console.log(err);
  }
});

// SPECIES UPDATE
router.put('/species/:id', async (c) => {
await middleware.isLoggedIn(c);
  try {
    const updatedSpecies = await Species.findByIdAndUpdate(
      c.req.param('id'),
      (await c.req.json()).species,
    );
    console.log(updatedSpecies);
    return c.json(`/species/${c.req.param('id')}`);
  } catch (err) {
    console.log(err);
  }
});

// SPECIES DELETE

// SPECIES ACTIVITY NEW ROUTE
router.get(
  '/species/:id/activities/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundSpecies = await Species.findById(c.req.param('id'));
      return c.json({ species: foundSpecies });
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES ACTIVITY CREATE ROUTE
router.post(
  '/species/:id/activities',
  async (c) => {
    await middleware.isLoggedIn(c)
    // SPLIT TYPE TO MAIN AND SUB ACTIVITY TYPE
    const types = (await c.req.json()).activity.activityType.split(' ');
    const activity = {
      activityType: types[0],
      subtype: types[1],
      name: (await c.req.json()).activity.name,
      time: {
        startMonth: (await c.req.json()).activity.time.startMonth,
        endMonth: (await c.req.json()).activity.time.endMonth,
      },
      price: (await c.req.json()).activity.price,
    };
    try {
      const updatedSpecies = await Species.findByIdAndUpdate(c.req.param('id'), {
        $addToSet: { activities: activity },
      });
      console.log(`${(await c.req.json()).activity.name} has been added to the species`);
      return c.json(`/species/${updatedSpecies?._id}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES ACTIVITY EDIT ROUTE
router.get(
  '/species/:id/activities/edit',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundSpecies = await Species.findById(c.req.param('id'));
      if (foundSpecies) {
        if (c.req.query('index') && typeof c.req.query('index') === 'string') {
          const activity = foundSpecies.activities[parseInt(c.req.query('index')!, 10)];
          return c.json({
            species: foundSpecies,
            activity,
            index: c.req.query('index'),
          });
        } else {
          console.warn('c.req.query(\'index\') is not string type:', c.req.query('index'));
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES ACTIVITY UPDATE ROUTE
router.put(
  '/species/:id/activities',
  async (c) => {
    await middleware.isLoggedIn(c)
    // SPLIT TYPE TO MAIN AND SUB ACTIVITY TYPE
    const types = (await c.req.json()).activity.activityType.split(' ');
    const activity = {
      activityType: types[0],
      subtype: types[1],
      name: (await c.req.json()).activity.name,
      time: {
        startMonth: (await c.req.json()).activity.time.startMonth,
        endMonth: (await c.req.json()).activity.time.endMonth,
      },
      price: (await c.req.json()).activity.price,
    };
    // FIND SPECIES
    try {
      const updatedSpecies = await Species.findById(c.req.param('id'));
      if (updatedSpecies) {
      // CHANGE ACTIVITY DETAILS
        if (c.req.query('index') && typeof c.req.query('index') === 'string') {
          updatedSpecies.activities[parseInt(c.req.query('index')!, 10)] = activity;
          await updatedSpecies.save();
          return c.json(`/species/${updatedSpecies._id}`);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES NUTRIENTS CREATE ROUTE
router.get(
  '/species/:id/nutrients/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const foundSpecies = await Species.findById(c.req.param('id'));
      return c.json({ species: foundSpecies });
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES NUTRIENTS UPDATE ROUTE
router.put(
  '/species/:id/nutrients',
  async (c) => {
    await middleware.isLoggedIn(c)
    try {
      const updatedSpecies = await Species.findByIdAndUpdate(c.req.param('id'), {
        $set: { nutrients: (await c.req.json()).nutrients },
      });
      if (updatedSpecies) {
        return c.json(`/species/${updatedSpecies._id}`);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

}
