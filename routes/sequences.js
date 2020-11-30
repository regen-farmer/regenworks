var express = require("express");
var router = express.Router();
var Sequence = require("../models/sequence");
var Layer = require("../models/layer");
var Project = require("../models/project");
var middleware = require("../middleware");


// SEQUENCE INDEX

// NEW AREA SYSTEM GRID NEW ROUTE
router.get("/layers/:id/sequences/spacing", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            res.render("sequences/spacing", {layer: foundLayer});
        }
    });
});


// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post("/layers/:id/sequences/spacing", middleware.isLoggedIn, function(req, res){
    // CHECK LENGTH IS DIVISIBLE
    if((req.body.length / req.body.distance) % 1 === 0){
        // FIND LAYER
        Layer.findById(req.params.id, function(err, foundLayer){
            if(err){
                console.log(err);
            } else {
                res.redirect("/layers/" + foundLayer._id + "/sequences/new?distance=" + req.body.distance + "&length=" + req.body.length);
            }
        });
    } else {
        req.flash("error", "Length must be divisible with distance between species in sequence.");
        res.redirect("back");
    }
});

// SEQUENCE NEW
router.get("/layers/:id/sequences/new", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            res.render("sequences/new", {layer: foundLayer});
        }
    });
});

// SEQUENCE CREATE
router.post("/layers/:id/sequences", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            Sequence.create(req.body.sequence, function(err, createdSequence){
                if(err){
                    console.log(err);
                } else {
                    // SAVE SEQUENCE ON LAYER?

                    res.redirect("/layers/" + foundLayer._id + "/layout");
                }
            });
        }
    });
});


// SEQUENCE SHOW
router.get("/layers/:id/sequences/:pid", middleware.isLoggedIn, function(req, res){
    // FIND LAYER

    // FIND SEQUENCE
    Sequence.findById(req.params.pid, function(err, foundSequence){
        if(err){
            console.log(err);
        } else {
            res.render("sequences/show", {sequence: foundSequence});
        }
    });
});

// SEQUENCE EDIT
router.get("/layers/:id/sequences/edit", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id).populate("rows.sequence").exec(function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            // FIND SEQUENCES

            res.render("sequences/edit", {layer: foundLayer});
        }
    });
});

// SEQUENCE UPDATE
router.put("/layers/:id/sequences", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            Sequence.findByIdAndUpdate(req.body.sequence, function(err, updatedSequence){
                if(err){
                    console.log(err);
                } else {
                    res.redirect("/layers/" + foundLayer._id + "/layout");
                }
            });
        }
    });
});

// SEQUENCE DELETE


module.exports = router;