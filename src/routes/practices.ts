import express from 'express';
import Practice from '../models/practice';
import Parcel from '../models/parcel';
import middleware from '../middleware';
import { UserDocument } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();

// PRACTICE INDEX ROUTE

// PRACTICE NEW ROUTE

// PRACTICE CREATE ROUTE

// PRACTICE SHOW ROUTE - NEED TO REFACTOR FOR NO PARCEL ID QUERY
router.get('/practices/:id', middleware.isLoggedIn, async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
  try {
    const foundPractice = await Practice.findById(req.params.id);
    try {
      const foundParcel = await Parcel.findById(req.query.parcelid);
      if (foundParcel && foundParcel.owner.id.toString() === req.user?._id.toString()) { // REFACTOR OWNERSHIP MIDDLEWARE?!?! WORKS FOR NOW
        console.log(foundParcel);
        res.send({ practice: foundPractice, parcel: foundParcel });
      } else {
        // req.flash("error", "You don't have permission to do that.");
        res.send('back');
      }
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// PRACTICE UPDATE ROUTE

// PRACTICE DELETE ROUTE

export default router;
