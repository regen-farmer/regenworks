import express from 'express';
import Rotation from '../models/rotation.js';
import Layer from '../models/layer.js';
import Project from '../models/project.js';
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

// NEW AREA SYSTEM GRID NEW ROUTE
router.get('/layers/:entityid/rotations/steps', async (c) => {
await middleware.isLoggedIn(c);
  // FIND LAYER
  try {
    const foundLayer = await Layer.findById(c.req.param('entityid'));
    return c.json({ layer: foundLayer, project: '' });
  } catch (err) {
    console.log(err);
  }
});

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post('/layers/:entityid/rotations/steps', async (c) => {
await middleware.isLoggedIn(c);
const payload = await c.req.json();
  // CHECK LENGTH IS DIVISIBLE
  if ((payload.length / payload.distance) % 1 === 0) {
    // FIND LAYER
    try {
      const foundLayer = await Layer.findById(c.req.param('entityid'));
      if (foundLayer) {
        return c.json(`/layers/${foundLayer._id}/rotations/new?distance=${payload.distance}&length=${payload.length}`);
      }
    } catch (err) {
      console.log(err);
    }
  } else {
    console.log('Length must be divisible with distance between species in rotation.');
    c.status(400)
return c.json({ error: 'Length must be divisible with distance between species in rotation.' });
  }
});

// ROTATION NEW
router.get('/layers/:entityid/rotations/new', async (c) => {
await middleware.isLoggedIn(c);
  // FIND LAYER
  try {
    const foundLayer = await Layer.findById(c.req.param('entityid'));
    // FIND ALL SPECIES
    try {
      const foundSpecies = await Species.find();
      // SORT SPECIES
      foundSpecies.sort((a, b) => {
        if (a.genus < b.genus) {
          return -1;
        }
        if (a.genus > b.genus) {
          return 1;
        }
        return 0;
      });
      return c.json({
        layer: foundLayer, project: '', species: foundSpecies, distance: c.req.query('distance'), length: c.req.query('length'),
      });
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// SEQUENCE CREATE

// NEW AREA SYSTEM GRID NEW ROUTE
router.get('/projects/:entityid/rotations/steps', async (c) => {
await middleware.isLoggedIn(c);
  // FIND LAYER
  try {
    const foundProject = await Project.findById(c.req.param('entityid'));
    return c.json({ project: foundProject });
  } catch (err) {
    console.log(err);
  }
});

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post('/projects/:entityid/rotations/steps', async (c) => {
await middleware.isLoggedIn(c);
const payload = await c.req.json();
  // FIND PROJECT
  try {
    const foundProject = await Project.findById(c.req.param('entityid'));
    if (foundProject) {
      return c.json(`/projects/${foundProject._id}/rotations/new?steps=${payload.steps}`);
    }
  } catch (err) {
    console.log(err);
  }
});

// ROTATION NEW
router.get('/projects/:entityid/rotations/new', async (c) => {
await middleware.isLoggedIn(c);
  // FIND LAYER
  try {
    const foundProject = await Project.findById(c.req.param('entityid'));
    // FIND ALL SPECIES
    try {
      const foundSpecies = await Species.find();
      // SORT SPECIES

      foundSpecies.sort((a, b) => {
        if (a.genus < b.genus) {
          return -1;
        }
        if (a.genus > b.genus) {
          return 1;
        }
        return 0;
      });
      return c.json({ project: foundProject, species: foundSpecies, steps: c.req.query('steps') });
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// CREATE PROJECT ROTATION
router.post('/projects/:entityid/rotations', async (c) => {
await middleware.isLoggedIn(c);
const payload = await c.req.json();
  // FIND LAYER
  try {
    const foundProject = await Project.findById(c.req.param('entityid'));
    if (foundProject) {
      // const model:any[] = [];
      // // CHECK IF ARRAY
      // if (!(payload.model.speciesmix.species instanceof Array)) {
      //   const speciesmix: any = {
      //     species: payload.model.speciesmix.species,
      //   };
      //   model.push(speciesmix);
      // } else {
      //   for (let i = 0; i < payload.model.speciesmix.speciwwes.length; i++) {
      //   // FIX IF ONLY ONE ITEM IN ROW
      //   // IF SPECIES ID IS NULL
      //     if (!(payload.model.speciesmix.species[i] === '')) {
      //       const speciesmix: any = {
      //         speciesmix: [
      //           {
      //             species: payload.model.speciesmix.species[i],
      //             amount: 0,
      //           },
      //         ],
      //         planting: {
      //           year: payload.model.planting.year[i],
      //           month: payload.model.planting.month[i],
      //         },
      //         harvest: {
      //           year: payload.model.harvest.year[i],
      //           month: payload.model.harvest.month[i],
      //         },
      //       };
      //       model.push(speciesmix);
      //     }
      //   }
      // }
      const rotation = payload.rotation;
      // rotation.model = payload.model;
      try {
        const createdRotation = await Rotation.create(rotation);
        console.log(`rotation: ${createdRotation}`);
        // SAVE SEQUENCE ON LAYER?
        createdRotation.owner.id = c.get('user')?._id.toString()!;
        await createdRotation.save();
        return c.json(createdRotation);
      } catch (err) {
        console.log(err);
      }
    }
  } catch (err) {
    console.log(err);
  }
});

// EDIT PROJECT ROTATION
router.get('/projects/:entityid/rotations/:pid/edit', async (c) => {
await middleware.isLoggedIn(c);
  // FIND LAYER
  try {
    const foundProject = await Project.findById(c.req.param('entityid')).populate({ path: 'areas.rotation', populate: { path: 'model.species' } }).exec();
    // FIND SEQUENCES
    try {
      const foundRotation = await Rotation.findById(c.req.param('pid')).populate('model.speciesmix.species').exec();

      // FIND ALL SPECIES
      return c.json({ project: foundProject, rotation: foundRotation });
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// UPDATE PROJECT ROTATION
router.put('/projects/:entityid/rotations/:pid', async (c) => {
await middleware.isLoggedIn(c);
const payload = await c.req.json();
  // FIND LAYER
  const rotation = payload.rotation;
  try {
    const foundProject = await Project.findById(c.req.param('entityid'));
    if (foundProject) {
      try {
        await Rotation.findByIdAndUpdate(c.req.param('pid'), rotation);
        return c.json(`/projects/${foundProject._id}/layout`);
      } catch (err) {
        console.log(err);
      }
    }
  } catch (err) {
    console.log(err);
  }
});
}
