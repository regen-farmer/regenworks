const express = require('express');

const router = express.Router();
const Parcel = require('../models/parcel');
const Layer = require('../models/layer');
const Saptest = require('../models/saptest');
const middleware = require('../middleware');

// PARCEL LAYER SAP TEST NEW
router.get('/parcels/:id/layers/:pid/saptests/new', middleware.isLoggedIn, (req, res) => {
  // FIND PARCEL
  Parcel.findById(req.params.id).populate('layers').exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      // FIND LAYER
      Layer.findById(req.params.pid, (err, foundLayer) => {
        if (err) {
          console.log(err);
        } else {
          // RENDER ACTIVITIES
          res.render('saptests/new', { parcel: foundParcel, layer: foundLayer });
        }
      });
    }
  });
});

// PARCEL LAYER SOIL TEST CREATE
router.post('/parcels/:id/layers/:pid/saptests', middleware.isLoggedIn, (req, res) => {
  // PARSE COORDINATES
  /* var sapTest = req.body.saptest;
    var parsedCoordinates = req.body.coordinates.split(", ");
    console.log(parsedCoordinates);
    soiltest.lat = parsedCoordinates[0];
    soiltest.lat = parsedCoordinates[1];
    res.redirect("/parcels/" + req.params.id + "/status"); */
  // CREATE SOIL TEST
  Saptest.create(req.body.saptest, (err, createdSaptest) => {
    if (err) {
      console.log(err);
    } else {
      Layer.findByIdAndUpdate(req.params.pid, { $push: { saptests: createdSaptest } }, (err, updatedLayer) => {
        if (err) {
          console.log(err);
        } else {
          // RENDER PARCEL LAYER SAP TEST PAGE
          res.redirect(`/parcels/${req.params.id}/status`);
        }
      });
    }
  });
});

module.exports = router;
