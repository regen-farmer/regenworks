var express = require('express')
var router = express.Router()
import Project from '../models/project'
import Layer from '../models/layer'
import Area from '../models/area'
var middleware = require('../middleware')

// NEW AREA ON PROJECT
router.get(
  '/projects/:id/areas/new',
  middleware.isLoggedIn,
  function (req, res) {
    // FIND PROJECT
    Project.findById(req.params.id)
      .populate('layer')
      .exec(function (err, foundProject) {
        if (err) {
          console.log(err)
        } else {
          res.render('areas/new', { project: foundProject })
        }
      })
  }
)

// CREATE AREA ON PROJECT
router.post('/projects/:id/areas', middleware.isLoggedIn, function (req, res) {
  // CREATE AREA HERE?
  var area = {
    geometry: req.body.geometry,
    name: req.body.area.name,
    size: req.body.layersize,
  }
  // CREATE ROW
  Area.create(area, async function (err, createdArea) {
    if (err) {
      console.log(err)
    } else {
      // FIND PROJECT
      try {
        let updatedProject = await Project.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { areas: createdArea } });
        console.log('Area has been added to project')
        res.redirect('/projects/' + updatedProject.id + '/layout')
      } 
      catch (err) {
            console.log(err)
      }  
    }
  })
})

// DELETE AREA ON PROJECT
router.delete(
  '/projects/:id/areas/:pid',
  middleware.isLoggedIn,
  function (req, res) {
    // FIND PROJECT
    Project.findById(req.params.id, async function (err, updatedProject) {
      if (err) {
        console.log(err)
      } else {
        // REMOVE ROW
        console.log('Length before ' + updatedProject.areas.length)
        updatedProject.areas.remove(req.params.pid)
        updatedProject.save()
        // DELETE ROW
        try {
          await Area.findByIdAndRemove(req.params.pid)
          console.log('Length after ' + updatedProject.areas.length)
          res.redirect('/projects/' + updatedProject._id + '/layout')
        } catch (err: any) {
          console.log(err)
        }
      }
    })
  }
)

// PROJECT DELETE ALL ROWS, AND LATER ON AREAS ON PROJECT
router.get(
  '/projects/:id/deleteareas',
  middleware.isLoggedIn,
  async function (req, res) {
    // FIND PROJECT
    try {
      let foundProject = await Project.findById(req.params.id)
      // DELETE AREAS
      try {
        await Area.deleteMany({ _id: { $in: foundProject.areas } })
        // CLEAR AREA ARRAY ON PROJECT
        try {
          let updatedProject = await Project.findByIdAndUpdate(req.params.id, {
            $set: { areas: [] },
          })
          res.redirect('/projects/' + updatedProject._id + '/layout')
        } catch (err) {
          console.log(err)
        }
      } catch (err) {
        console.log(err)
      }
    } catch (err) {
      console.log(err)
    }
  }
)

module.exports = router
