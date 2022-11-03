const express = require('express');

const router = express.Router();
const Practice = require('../models/practice');
const Parcel = require('../models/parcel');
const middleware = require('../middleware');

// PRACTICE INDEX ROUTE

// PRACTICE NEW ROUTE

// PRACTICE CREATE ROUTE

// PRACTICE SHOW ROUTE - NEED TO REFACTOR FOR NO PARCEL ID QUERY
router.get('/practices/:id', middleware.isLoggedIn, (req, res) => {
  Practice.findById(req.params.id, (err, foundPractice) => {
    if (err) {
      console.log(err);
    } else {
      Parcel.findById(req.query.parcelid, (err, foundParcel) => {
        if (err) {
          console.log(err);
        } else if (foundParcel.owner.id.equals(req.user._id)) { // REFACTOR OWNERSHIP MIDDLEWARE?!?! WORKS FOR NOW
          console.log(foundParcel);
          res.render('practices/show', { practice: foundPractice, parcel: foundParcel });
        } else {
          // req.flash("error", "You don't have permission to do that.");
          res.redirect('back');
        }
      });
    }
  });
});

// PRACTICE UPDATE ROUTE

// PRACTICE DELETE ROUTE

module.exports = router;
