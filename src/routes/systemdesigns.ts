import express from 'express';
import Species from '../models/species.js';

import Animal from '../models/animal.js';
import Project from '../models/project.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken, Variables } from '../app.js';
import SystemDesign from '../models/systemdesign.js';

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

// NESTED AREA SYSTEM NEW ROUTE
router.get(
  '/projects/:projectid/set-system',
  async (c) => {
    await middleware.isLoggedIn(c)
    console.log('new system');
    // FIND LAYER ID
    // try {
    //   const foundLayer = await Layer.findById(c.req.param('entityid'));
    // FIND ALL SPECIES IN THE DATABASE

    const foundProject = await Project.findById(c.req.param('projectid')).populate('systemdesign');

    if (foundProject) {
      try {
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
        // FIND ALL ANIMALS AND SORT
        try {
          const foundAnimals = await Animal.find();
          // SORT ANIMALS
          foundAnimals.sort((a, b) => {
            if (a.name < b.name) {
              return -1;
            }
            if (a.name > b.name) {
              return 1;
            }
            return 0;
          });
          // RENDER NEW SYSTEM PAGE WITH SPECIES
          return c.json({
            // layer: foundLayer,
            systemdesign: foundProject.systemdesign,
            species: foundSpecies,
            animals: foundAnimals,
            rows: c.req.query('rows'),
            distance: c.req.query('distance'),
            length: c.req.query('length'),
          });
        } catch (err) {
          console.log(err);
        }
      } catch (err) {
        console.log(err);
      }
    }
    // } catch (err) {
    //   console.log(err);
    // }
  },
);

router.put(
  '/projects/:projectid/set-systemdesign',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    const foundProject = await Project.findById(c.req.param('projectid')).populate('systemdesign');

    // CHeck if project exists
    if (foundProject) {
      // Find system on project

      if (foundProject.systemdesign) {
        console.log('##### found system design #####');

        await foundProject.systemdesign.replaceOne((await c.req.json()));
      } else {
        console.log('##### didnt find system design #####');

        const newSystemDesign = await new SystemDesign((await c.req.json()));
        await newSystemDesign.save();
        foundProject.systemdesign = newSystemDesign;
        await foundProject.save();
      }

      c.status(200);
      return c.json({})
    } else {
      c.status(400)
return c.json({ error: 'Project not found' });
    }
  },
);

}
