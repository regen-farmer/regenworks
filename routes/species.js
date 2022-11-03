const express = require('express');

const router = express.Router();
const Species = require('../models/species');
const Flow = require('../models/flow');
const middleware = require('../middleware');

// SPECIES INDEX
router.get('/species', middleware.adminIsLoggedIn, (req, res) => {
  Species.find((err, foundSpecies) => {
    if (err) {
      console.log(err);
    } else {
      res.render('species', { species: foundSpecies });
    }
  });
});

// SPECIES NEW
router.get('/species/new', middleware.isLoggedIn, (req, res) => { // ONLY ADMIN ACCESS?
  res.render('species/new');
});

// SPECIES CREATE
router.post('/species', middleware.isLoggedIn, (req, res) => { // ONLY ADMIN ACCESS?
  Species.create(req.body.species, (err, createdSpecies) => {
    if (err) {
      console.log(err);
    } else {
      console.log(createdSpecies);
      res.redirect('species');
    }
  });
});

// SPECIES SHOW
router.get('/species/:id', middleware.adminIsLoggedIn, (req, res) => { // ONLY ADMIN ACCESS?
  Species.findById(req.params.id).populate('flows').exec((err, foundSpecies) => {
    if (err) {
      console.log(err);
    } else {
      res.render('species/show', { species: foundSpecies });
    }
  });
});

// SPECIES EDIT
router.get('/species/:id/edit', middleware.isLoggedIn, (req, res) => { // ONLY ADMIN ACCESS?
  Species.findById(req.params.id, (err, foundSpecies) => {
    if (err) {
      console.log(err);
    } else {
      res.render('species/edit', { species: foundSpecies });
    }
  });
});

// SPECIES UPDATE
router.put('/species/:id', middleware.isLoggedIn, (req, res) => {
  Species.findByIdAndUpdate(req.params.id, req.body.species, (err, updatedSpecies) => {
    if (err) {
      console.log(err);
    } else {
      console.log(updatedSpecies);
      res.redirect(`/species/${req.params.id}`);
    }
  });
});

// SPECIES DELETE

// SPECIES ACTIVITY NEW ROUTE
router.get('/species/:id/activities/new', middleware.isLoggedIn, (req, res) => {
  Species.findById(req.params.id, (err, foundSpecies) => {
    if (err) {
      console.log(err);
    } else {
      res.render('species/activity', { species: foundSpecies });
    }
  });
});

// SPECIES ACTIVITY CREATE ROUTE
router.post('/species/:id/activities', middleware.isLoggedIn, (req, res) => {
  // SPLIT TYPE TO MAIN AND SUB ACTIVITY TYPE
  const types = req.body.activity.activityType.split(' ');
  const activity = {
    activityType: types[0],
    subtype: types[1],
    name: req.body.activity.name,
    time: {
      startMonth: req.body.activity.time.startMonth,
      endMonth: req.body.activity.time.endMonth,
    },
    price: req.body.activity.price,
  };
  Species.findByIdAndUpdate(req.params.id, { $addToSet: { activities: activity } }, (err, updatedSpecies) => {
    if (err) {
      console.log(err);
    } else {
      console.log(`${req.body.activity.name} has been added to the species`);
      res.redirect(`/species/${updatedSpecies._id}`);
    }
  });
});

// SPECIES ACTIVITY EDIT ROUTE
router.get('/species/:id/activities/edit', middleware.isLoggedIn, (req, res) => {
  Species.findById(req.params.id, (err, foundSpecies) => {
    if (err) {
      console.log(err);
    } else {
      const activity = foundSpecies.activities[req.query.index];
      res.render('species/editactivity', { species: foundSpecies, activity, index: req.query.index });
    }
  });
});

// SPECIES ACTIVITY UPDATE ROUTE
router.put('/species/:id/activities', middleware.isLoggedIn, (req, res) => {
  // SPLIT TYPE TO MAIN AND SUB ACTIVITY TYPE
  const types = req.body.activity.activityType.split(' ');
  const activity = {
    activityType: types[0],
    subtype: types[1],
    name: req.body.activity.name,
    time: {
      startMonth: req.body.activity.time.startMonth,
      endMonth: req.body.activity.time.endMonth,
    },
    price: req.body.activity.price,
  };
    // FIND SPECIES
  Species.findById(req.params.id, (err, updatedSpecies) => {
    if (err) {
      console.log(err);
    } else {
      // CHANGE ACTIVITY DETAILS
      updatedSpecies.activities[req.query.index] = activity;
      updatedSpecies.save();
      res.redirect(`/species/${updatedSpecies._id}`);
    }
  });
});

// SPECIES NUTRIENTS CREATE ROUTE
router.get('/species/:id/nutrients/new', middleware.isLoggedIn, (req, res) => {
  Species.findById(req.params.id, (err, foundSpecies) => {
    if (err) {
      console.log(err);
    } else {
      res.render('species/nutrients', { species: foundSpecies });
    }
  });
});

// SPECIES NUTRIENTS UPDATE ROUTE
router.put('/species/:id/nutrients', middleware.isLoggedIn, (req, res) => {
  Species.findByIdAndUpdate(req.params.id, { $set: { nutrients: req.body.nutrients } }, (err, updatedSpecies) => {
    if (err) {
      console.log(err);
    } else {
      res.redirect(`/species/${updatedSpecies._id}`);
    }
  });
});

module.exports = router;
