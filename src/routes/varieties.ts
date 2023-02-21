import express from 'express';
import Variety from '../models/variety';
import Species from '../models/species';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();

// VARIETY INDEX
router.get('/varieties', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema, idToken?: Auth0IDToken }, res: express.Response) => {
  // Get all varieties from DB
  Variety.find({ 'owner.id': req.user?._id }).populate('species').exec((err, allUserVarieties) => {
    if (err) {
      console.log(err);
    } else {
      res.send( { varieties: allUserVarieties });
    }
  });
});

// VARIETY NEW
router.get('/varieties/new', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema, idToken?: Auth0IDToken }, res: express.Response) => {
  // FIND ALL SPECIES
  Species.find((err, allSpecies) => {
    if (err) {
      console.log(err);
    } else {
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
      res.send( { species: allSpecies });
    }
  });
});

// VATERTY CREATE
router.post('/varieties', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema, idToken?: Auth0IDToken }, res: express.Response) => {
  // CLEAN NONE OPTIONS
  const variety = req.body.variety;
  if (req.body.variety.species === '') {
    delete variety.species;
  }
  if (req.body.variety.hybrid === '') {
    delete variety.hybrid;
  }
  if (req.body.variety.rootstock.species === '') {
    delete variety.rootstock.species;
  }
  // CREATE VARIETY
  const createdVariety = await Variety.create(variety);

  // SET OWNERSHIP
  createdVariety.owner.id = req.user?._id;
  await createdVariety.save();
  // REDIRECT TO USER
  res.send(`/users/${req.user?._id}`);
});

export default router;
