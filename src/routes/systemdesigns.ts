import express from 'express';
import Species from '../models/species.js';

import Animal from '../models/animal.js';
import Project from '../models/project.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken } from '../app.js';
import SystemDesign from '../models/systemdesign.js';

const router = express.Router();

// NESTED AREA SYSTEM NEW ROUTE
router.get(
  '/projects/:projectid/set-system',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    console.log('new system');
    // FIND LAYER ID
    // try {
    //   const foundLayer = await Layer.findById(req.params.id);
    // FIND ALL SPECIES IN THE DATABASE

    const foundProject = await Project.findById(req.params.projectid).populate('systemdesign');

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
          res.send({
            // layer: foundLayer,
            systemdesign: foundProject.systemdesign,
            species: foundSpecies,
            animals: foundAnimals,
            rows: req.query.rows,
            distance: req.query.distance,
            length: req.query.length,
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
  middleware.isLoggedIn,
  async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
    // FIND PROJECT
    const foundProject = await Project.findById(req.params.projectid).populate('systemdesign');

    // CHeck if project exists
    if (foundProject) {
      // Find system on project

      if (foundProject.systemdesign) {
        console.log('##### found system design #####');

        await foundProject.systemdesign.replaceOne(req.body);
      } else {
        console.log('##### didnt find system design #####');

        const newSystemDesign = await new SystemDesign(req.body);
        await newSystemDesign.save();
        foundProject.systemdesign = newSystemDesign;
        await foundProject.save();
      }

      res.sendStatus(200);
    } else {
      res.status(400).send({ error: 'Project not found' });
    }
  },
);

export default router;
