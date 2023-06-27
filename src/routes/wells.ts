import express from 'express';
// import Well from "../models/well.js";
import Parcel from '../models/parcel.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken } from '../app.js';

const router = express.Router();
// import Species from "../models/species.js";
// import Animal from "../models/animal.js";

// NESTED PARCEL WELL NEW ROUTE
router.get('/parcels/:id/wells/new', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  // FIND PARCEL ID
  try {
    const foundParcel = await Parcel.findById(req.params.id);
    res.send({ parcel: foundParcel });
  } catch (err) {
    console.log(err);
  }
});

// NESTED PARCEL WELL CREATE ROUTE

export default router;
