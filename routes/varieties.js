const express = require('express');

const router = express.Router();
const Variety = require('../models/variety');
const Species = require('../models/species');
const middleware = require('../middleware');

// VARIETY INDEX
router.get('/varieties', middleware.isLoggedIn, (req, res) => {
  // Get all varieties from DB
  Variety.find({ 'owner.id': req.user._id }).populate('species').exec((err, allUserVarieties) => {
    if (err) {
      console.log(err);
    } else {
      res.render('varieties/index', { varieties: allUserVarieties });
    }
  });
});

// VARIETY NEW
router.get('/varieties/new', middleware.isLoggedIn, (req, res) => {
  // FIND ALL SPECIES
  Species.find((err, allSpecies) => {
    if (err) {
      console.log(err);
    } else {
      // SORT SPECIES
      function compare(a, b) {
        if (a.genus < b.genus) {
          return -1;
        }
        if (a.genus > b.genus) {
          return 1;
        }
        return 0;
      }
      allSpecies.sort(compare);
      res.render('varieties/new', { species: allSpecies });
    }
  });
});

// VATERTY CREATE
router.post('/varieties', middleware.isLoggedIn, (req, res) => {
  // CLEAN NONE OPTIONS
  const { variety } = req.body;
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
  Variety.create(variety, (err, createdVariety) => {
    if (err) {
      console.log(err);
    } else {
      // SET OWNERSHIP
      createdVariety.owner.id = req.user._id;
      createdVariety.owner.username = req.user.username;
      createdVariety.save();
      // REDIRECT TO USER
      res.redirect(`/users/${req.user._id}`);
    }
  });
});

module.exports = router;
