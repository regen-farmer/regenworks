const express = require('express');

const router = express.Router();
const Asset = require('../models/asset');
const Layer = require('../models/layer');
const Project = require('../models/project');
const Species = require('../models/species');
const middleware = require('../middleware');

// ASSET INDEX ROUTE
router.get('/assets', middleware.adminIsLoggedIn, (req, res) => {
  // Get all assets from DB
  Asset.find({ 'owner.id': req.user._id }, (err, allAssets) => {
    if (err) {
      console.log(err);
    } else {
      res.render('assets/index', { assets: allAssets });
    }
  });
});

// ASSET NEW ROUTE
router.get('/assets/new', middleware.isLoggedIn, (req, res) => {
  Layer.find({ 'owner.id': req.user._id }, (err, foundLayers) => {
    if (err) {
      console.log(err);
    } else {
      // console.log("Reached this far");
      // foundLayers.forEach(function(layer){
      //     console.log(layer.id);
      // });
      res.render('assets/new', { layers: foundLayers });
    }
  });
});

// ASSET CREATE ROUTE
router.post('/assets', middleware.isLoggedIn, (req, res) => {
  // Create a new experience
  Asset.create(req.body.asset, (err, createdAsset) => {
    if (err) {
      console.log(err);
    } else {
      // Add username and ID to experience
      createdAsset.owner.id = req.user._id;
      createdAsset.owner.username = req.user.username;
      // Save the asset - Not needed if created after this step
      createdAsset.save();
      res.redirect('/assets');
    }
  });
});

// ASSET SHOW ROUTES
router.get('/assets/:id', middleware.isLoggedIn, (req, res) => {
  // Find specific asset
  Asset.findById(req.params.id).populate('layer').exec((err, foundAsset) => {
    if (err) {
      console.log(err);
    } else {
      res.render('assets/show', { asset: foundAsset });
    }
  });
});

// ASSET EDIT ROUTE
router.get('/assets/:id/edit', middleware.isLoggedIn, (req, res) => {
  // FIND ASSET AND RENDER EDIT PAGE
  Asset.findById(req.params.id).populate('species').exec((err, foundAsset) => {
    if (err) {
      console.log(err);
    } else {
      // GET ALL SPECIES!!
      Species.find((err, foundSpecies) => {
        if (err) {
          console.log(err);
        } else {
          console.log(foundAsset.species);
          console.log(foundSpecies[0]);
          res.render('assets/edit', { asset: foundAsset, species: foundSpecies });
        }
      });
    }
  });
});

// ASSET UPDATE ROUTE
router.put('/assets/:id', middleware.isLoggedIn, (req, res) => {
  // UPDATE ASSET
  Asset.findByIdAndUpdate(req.params.id, req.body.asset, (err, updatedAsset) => {
    if (err) {
      console.log(err);
    } else {
      res.redirect(`/assets/${updatedAsset._id}`);
    }
  });
});

// ASSET DELETE ROUTE
router.delete('/assets/:id', middleware.isLoggedIn, (req, res) => { // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
  // FIND ASSET
  Asset.findById(req.params.id, (err, foundAsset) => {
    if (err) {
      console.log(err);
    } else {
      console.log(foundAsset);
      // REMOVE ASSET FROM PROJECT
      Project.find({ assets: foundAsset._id }, (err, foundProject) => {
        if (err) {
          console.log(err);
        } else {
          Project.findByIdAndUpdate(foundProject._id, { $pull: { assets: foundAsset._id } }, (err, updatedProject) => {
            if (err) {
              console.log(err);
            } else {
              // DELETE ASSET
              Asset.findByIdAndRemove(req.params.id, (err) => {
                if (err) {
                  console.log(err);
                  res.redirect('/assets');
                } else {
                  res.redirect(`/projects/${foundProject._id}`);
                }
              });
            }
          });
        }
      });
    }
  });
});

// AREA ASSET NEW ROUTE
router.get('/layers/:id/assets/new', middleware.isLoggedIn, (req, res) => {
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      res.render('assets/new', { layer: foundLayer });
    }
  });
});

// AREA ASSET CREATE ROUTE
router.post('/layers/:id/assets', middleware.isLoggedIn, (req, res) => {
  Layer.findById(req.params.id, (err, foundLayer) => {
    if (err) {
      console.log(err);
    } else {
      Asset.create(req.body.asset, (err, createdAsset) => {
        // Add username and ID to experience
        createdAsset.owner.id = req.user._id;
        createdAsset.owner.username = req.user.username;
        createdAsset.save();
        // ADD ASSET TO LAYER
        foundLayer.assets.push(createdAsset);
        // REDIRECT TO
        res.redirect(`/layers/${foundLayer._id}`);
      });
    }
  });
});

module.exports = router;
