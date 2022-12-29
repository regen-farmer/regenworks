import express from 'express';
import Flow from '../models/flow';
import Species from '../models/species';
import Parcel from '../models/parcel';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';

const router = express.Router();

// PARCEL FLOWS
router.get('/parcels/:id/flows', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // FIND PARCEL
  Parcel.findById(req.params.id).populate({ path: 'layers', populate: { path: 'rows' } }).exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      // RENDER ACTIVITIES
      res.render('flows/index', { parcel: foundParcel });
    }
  });
});

// NESTED SPECIES FLOW NEW ROUTE
router.get('/species/:id/flows/new', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  try {
    const foundSpecies = await Species.findById(req.params.id);
    res.render('flows/new', { species: foundSpecies });
  } catch (err) {
    console.log(err);
  }
});

// NESTED SPECIES FLOW CREATE ROUTE
router.post('/species/:id/flows', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // FIND SPECIES
  try {
    const foundSpecies = await Species.findById(req.params.id);
    console.log(req.body.flow);

    if (foundSpecies) {
      try {
        const createdFlow = await Flow.create(req.body.flow);
        foundSpecies.flows.push(createdFlow);
        await foundSpecies.save();
        res.redirect(`/species/${foundSpecies._id}`);
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

export default router;
