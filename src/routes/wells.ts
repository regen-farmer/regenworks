import express from 'express';
// import Well from "../models/well";
import Parcel from '../models/parcel';
import middleware from '../middleware';
import logger from '../middleware/logger';

const router = express.Router();
// import Species from "../models/species";
// import Animal from "../models/animal";

// NESTED PARCEL WELL NEW ROUTE
router.get('/parcels/:id/wells/new', middleware.isLoggedIn, (req, res) => {
  // FIND PARCEL ID
  Parcel.findById(req.params.id, (err, foundParcel) => {
    if (err) {
      console.log(err);
      logger.error(err.message);
      // res.flash(err)
    } else {
      res.render('wells/new', { parcel: foundParcel });
    }
  });
});

// NESTED PARCEL WELL CREATE ROUTE

export default router;
