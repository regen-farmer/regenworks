import express from 'express';
// import Well from "../models/well";
import Parcel from '../models/parcel';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();
// import Species from "../models/species";
// import Animal from "../models/animal";

// NESTED PARCEL WELL NEW ROUTE
router.get('/parcels/:id/wells/new', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema, idToken?: Auth0IDToken }, res: express.Response) => {
  // FIND PARCEL ID
  try {
    const foundParcel = await Parcel.findById(req.params.id);
    res.send( { parcel: foundParcel });
  } catch (err) {
    console.log(err);
  }
});

// NESTED PARCEL WELL CREATE ROUTE

export default router;
