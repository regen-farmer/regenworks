const express = require('express');

const router = express.Router();
const Project = require('../models/project');
const Layer = require('../models/layer');
const Area = require('../models/area');
const middleware = require('../middleware');

// NEW AREA ON PROJECT
router.get('/projects/:id/areas/new', middleware.isLoggedIn, (req, res) => {
  // FIND PROJECT
  Project.findById(req.params.id).populate('layer').exec((err, foundProject) => {
    if (err) {
      console.log(err);
    } else {
      res.render('areas/new', { project: foundProject });
    }
  });
});

// CREATE AREA ON PROJECT
router.post('/projects/:id/areas', middleware.isLoggedIn, (req, res) => {
  // CREATE AREA HERE?
  const area = {
    geometry: req.body.geometry,
    name: req.body.area.name,
    size: req.body.layersize,
  };
    // CREATE ROW
  Area.create(area, (err, createdArea) => {
    if (err) {
      console.log(err);
    } else {
      // FIND PROJECT
      Project.findByIdAndUpdate(req.params.id, { $addToSet: { areas: createdArea } }, (err, updatedProject) => {
        if (err) {
          console.log(err);
        } else {
          // CREATE ROW
          console.log('Area has been added to project');
          res.redirect(`/projects/${updatedProject.id}/layout`);
        }
      });
    }
  });
});

// DELETE AREA ON PROJECT
router.delete('/projects/:id/areas/:pid', middleware.isLoggedIn, (req, res) => {
  // FIND PROJECT
  Project.findById(req.params.id, (err, updatedProject) => {
    if (err) {
      console.log(err);
    } else {
      // REMOVE ROW
      console.log(`Length before ${updatedProject.areas.length}`);
      updatedProject.areas.remove(req.params.pid);
      updatedProject.save();
      // DELETE ROW
      Area.findByIdAndRemove(req.params.pid, (err) => {
        if (err) {
          console.log(err);
        } else {
          console.log(`Length after ${updatedProject.areas.length}`);
          res.redirect(`/projects/${updatedProject._id}/layout`);
        }
      });
    }
  });
});

// PROJECT DELETE ALL ROWS, AND LATER ON AREAS ON PROJECT
router.get('/projects/:id/deleteareas', middleware.isLoggedIn, (req, res) => {
  // FIND PROJECT
  Project.findById(req.params.id, (err, foundProject) => {
    if (err) {
      console.log(err);
    } else {
      // DELETE AREAS
      Area.deleteMany({ _id: { $in: foundProject.areas } }, (err) => {
        if (err) {
          console.log(err);
        } else {
          // CLEAR AREA ARRAY ON PROJECT
          Project.findByIdAndUpdate(req.params.id, { $set: { areas: [] } }, (err, updatedProject) => {
            if (err) {
              console.log(err);
            } else {
              // REDIRECT
              res.redirect(`/projects/${updatedProject._id}/layout`);
            }
          });
        }
      });
    }
  });
});

module.exports = router;
