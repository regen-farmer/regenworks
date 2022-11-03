const express = require('express');

const router = express.Router();
const Well = require('../models/well');
const Parcel = require('../models/parcel');
const middleware = require('../middleware');
const logger = require('../middleware/logger');
const Species = require('../models/species');
const Animal = require('../models/animal');

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

module.exports = router;
