import express from "express";
var router = express.Router();
import Rotation from "../models/rotation";
import Layer from "../models/layer";
import Project from "../models/project";
import Species from "../models/species";
var middleware = require("../middleware");
import Sequence from "../models/sequence";

// NEW AREA SYSTEM GRID NEW ROUTE
router.get("/layers/:id/rotations/steps", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            res.render("rotations/steps", {layer: foundLayer, project: ""});
        }
    });
});


// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post("/layers/:id/rotations/steps", middleware.isLoggedIn, function(req, res){
    // CHECK LENGTH IS DIVISIBLE
    if((req.body.length / req.body.distance) % 1 === 0){
        // FIND LAYER
        Layer.findById(req.params.id, function(err, foundLayer){
            if(err){
                console.log(err);
            } else {
                res.redirect("/layers/" + foundLayer._id + "/rotations/new?distance=" + req.body.distance + "&length=" + req.body.length);
            }
        });
    } else {
        req.flash("error", "Length must be divisible with distance between species in rotation.");
        res.redirect("back");
    }
});


// ROTATION NEW
router.get("/layers/:id/rotations/new", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            // FIND ALL SPECIES
            Species.find(function(err, foundSpecies){
                if(err){
                    console.log(err);
                } else {
                    // SORT SPECIES
                    function compare( a, b ) {
                        if ( a.genus < b.genus ){
                            return -1;
                        }
                        if ( a.genus > b.genus ){
                            return 1;
                        }
                        return 0;
                    }
                    foundSpecies.sort(compare);
                    res.render("sequences/new", {layer: foundLayer, project: "", species: foundSpecies, distance: req.query.distance, length: req.query.length});

                }
            });
        }
    });
});

// SEQUENCE CREATE

// NEW AREA SYSTEM GRID NEW ROUTE
router.get("/projects/:id/rotations/steps", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            res.render("rotations/steps", {project: foundProject});
        }
    });
});


// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post("/projects/:id/rotations/steps", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            res.redirect("/projects/" + foundProject._id + "/rotations/new?steps=" + req.body.steps);
        }
    });
});

// ROTATION NEW
router.get("/projects/:id/rotations/new", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // FIND ALL SPECIES
            Species.find(function(err, foundSpecies){
                if(err){
                    console.log(err);
                } else {
                    // SORT SPECIES
                    function compare( a, b ) {
                        if ( a.genus < b.genus ){
                            return -1;
                        }
                        if ( a.genus > b.genus ){
                            return 1;
                        }
                        return 0;
                    }
                    foundSpecies.sort(compare);
                    res.render("rotations/new", {project: foundProject, species: foundSpecies, steps: req.query.steps});

                }
            });
        }
    });
});

// CREATE PROJECT ROTATION
router.post("/projects/:id/rotations", middleware.isLoggedIn, function(req:any, res){
    // FIND LAYER
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            var model:any[] = [];
            // CHECK IF ARRAY
            if(!(req.body.model.speciesmix.species instanceof Array)) {
                var speciesmix: any = {
                    species: req.body.model.speciesmix.species
                };
                model.push(speciesmix);
            } else {
                for(let i=0;i<req.body.model.speciesmix.species.length;i++){
                    // FIX IF ONLY ONE ITEM IN ROW
                    // IF SPECIES ID IS NULL
                    if(!(req.body.model.speciesmix.species[i] === "")){
                        var speciesmix: any = {
                            speciesmix: [
                                {
                                    species: req.body.model.speciesmix.species[i],
                                    amount: 0
                                }
                            ],
                            planting: {
                                year: req.body.model.planting.year[i],
                                month: req.body.model.planting.month[i]
                            },
                            harvest: {
                                year: req.body.model.harvest.year[i],
                                month: req.body.model.harvest.month[i]
                            }
                        };
                        model.push(speciesmix);
                    }
                }
            }
            var rotation = req.body.rotation;
            rotation.model = model;
            Rotation.create(rotation, function(err, createdRotation){
                if(err){
                    console.log(err);
                } else {
                    console.log("rotation: " + createdRotation);
                    // SAVE SEQUENCE ON LAYER?
                    createdRotation.owner.id = req.user._id;
                    createdRotation.owner.username = req.user.username;
                    createdRotation.save();
                    res.redirect("/projects/" + foundProject._id + "/layout");
                }
            });
        }
    });
});

// EDIT PROJECT ROTATION
router.get("/projects/:id/rotations/:pid/edit", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Project.findById(req.params.id).populate({path:'areas.rotation', populate:{path:'model.species'}}).exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // FIND SEQUENCES
            Rotation.findById(req.params.pid).populate('model.species').exec(function(err, foundRotation){
                if(err){
                    console.log(err);
                } else {
                    // FIND ALL SPECIES
                    res.render("rotations/edit", {project: foundProject, rotation: foundRotation});
                }
            });
        }
    });
});

// UPDATE PROJECT ROTATION
router.put("/projects/:id/rotations/:pid", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    var rotation = req.body.rotation;
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            Rotation.findByIdAndUpdate(req.params.pid, rotation, function(err, updatedRotation){
                if(err){
                    console.log(err);
                } else {
                    res.redirect("/projects/" + foundProject._id + "/layout");
                }
            });
        }
    });
});
module.exports = router;