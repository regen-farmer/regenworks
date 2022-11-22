import express from 'express';
import Parcel from '../models/parcel';
import Layer from '../models/layer';
import Saptest from '../models/saptest';
import middleware from '../middleware';

const router = express.Router();

// PARCEL LAYER SAP TEST NEW
router.get('/parcels/:id/layers/:pid/saptests/new', middleware.isLoggedIn, async (req, res) => {
  // FIND PARCEL
  try {
    const foundParcel = Parcel.findById(req.params.id).populate('layers').exec();
    // FIND LAYER

    try {
      const foundLayer = Layer.findById(req.params.pid);
      // RENDER ACTIVITIES
      res.render('saptests/new', { parcel: foundParcel, layer: foundLayer });
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// PARCEL LAYER SOIL TEST CREATE
router.post('/parcels/:id/layers/:pid/saptests', middleware.isLoggedIn, async (req, res) => {
  // PARSE COORDINATES
  /* var sapTest = req.body.saptest;
    var parsedCoordinates = req.body.coordinates.split(", ");
    console.log(parsedCoordinates);
    soiltest.lat = parsedCoordinates[0];
    soiltest.lat = parsedCoordinates[1];
    res.redirect("/parcels/" + req.params.id + "/status"); */
  // CREATE SOIL TEST
  try {
    const createdSaptest = await Saptest.create(req.body.saptest);
    Layer.findByIdAndUpdate(req.params.pid, { $push: { saptests: createdSaptest } }, (err) => {
      if (err) {
        console.log(err);
      } else {
      // RENDER PARCEL LAYER SAP TEST PAGE
        res.redirect(`/parcels/${req.params.id}/status`);
      }
    });
  } catch (err) {
    console.log(err);
  }
});

export default router;
