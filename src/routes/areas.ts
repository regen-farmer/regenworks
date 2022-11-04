var express = require("express");
var router = express.Router();
var Project = require("../models/project");
var Layer = require("../models/layer");
var Area = require("../models/area");
var middleware = require("../middleware");

// NEW AREA ON PROJECT
router.get("/projects/:id/areas/new", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id).populate("layer").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            res.render("areas/new", {project: foundProject});
        }
    });
});

// CREATE AREA ON PROJECT
router.post("/projects/:id/areas", middleware.isLoggedIn, function(req, res){
    // CREATE AREA HERE?
    var area = {
        geometry: req.body.geometry,
        name: req.body.area.name,
        size: req.body.layersize
    };
    // CREATE ROW
    Area.create(area, function(err, createdArea){
        if(err){
            console.log(err);
        } else {
            // FIND PROJECT
            Project.findByIdAndUpdate(req.params.id, {$addToSet: {areas: createdArea}}, function(err, updatedProject){
                if(err){
                    console.log(err);
                } else {
                    // CREATE ROW
                    console.log("Area has been added to project");
                    res.redirect("/projects/" + updatedProject.id + "/layout");
                }
            });
        }
    });
});

// DELETE AREA ON PROJECT
router.delete("/projects/:id/areas/:pid", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id, function(err, updatedProject){
        if(err){
            console.log(err);
        } else {
            // REMOVE ROW
            console.log("Length before " + updatedProject.areas.length);
            updatedProject.areas.remove(req.params.pid);
            updatedProject.save();
            // DELETE ROW
            Area.findByIdAndRemove(req.params.pid, function(err){
                if(err){
                    console.log(err);
                } else {
                    console.log("Length after " + updatedProject.areas.length);
                    res.redirect("/projects/" + updatedProject._id + "/layout");
                }
            });
        }
    });
});

// PROJECT DELETE ALL ROWS, AND LATER ON AREAS ON PROJECT
router.get("/projects/:id/deleteareas", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // DELETE AREAS
            Area.deleteMany ({_id: {$in: foundProject.areas}}, function(err){
                if(err){
                    console.log(err);
                } else {
                    // CLEAR AREA ARRAY ON PROJECT
                    Project.findByIdAndUpdate(req.params.id, { $set: { areas: [] }}, function(err, updatedProject){
                        if(err){
                            console.log(err);
                        } else {
                            // REDIRECT
                            res.redirect("/projects/" + updatedProject._id + "/layout");
                        }
                    });
                }
            });
        }
    });
});

module.exports = router;