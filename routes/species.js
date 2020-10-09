var express = require("express");
var router = express.Router();
var Species = require("../models/species");
var Flow = require("../models/flow");
var middleware = require("../middleware");

// SPECIES INDEX
router.get("/species", middleware.adminIsLoggedIn, function(req, res){
    Species.find(function(err, foundSpecies){
        if(err){
            console.log(err);
        } else {
            res.render("species", {species: foundSpecies});
        }
    });
});

// SPECIES NEW
router.get("/species/new", middleware.isLoggedIn, function(req, res){ // ONLY ADMIN ACCESS?
    res.render("species/new");
});

// SPECIES CREATE
router.post("/species", middleware.isLoggedIn, function(req, res){ // ONLY ADMIN ACCESS?
    Species.create(req.body.species, function(err, createdSpecies){
        if(err) {
            console.log(err);
        } else {
            console.log(createdSpecies);
            res.redirect("species");
        }
    })
});

// SPECIES SHOW
router.get("/species/:id", middleware.adminIsLoggedIn, function(req, res){ // ONLY ADMIN ACCESS?
    Species.findById(req.params.id).populate("flows").exec(function(err, foundSpecies){
        if(err) {
            console.log(err);
        } else {
            res.render("species/show", {species: foundSpecies});
        }
    });
});

// SPECIES EDIT
router.get("/species/:id/edit", middleware.isLoggedIn, function(req, res){ // ONLY ADMIN ACCESS?
    Species.findById(req.params.id, function(err, foundSpecies){
        if(err) {
            console.log(err);
        } else {
            res.render("species/edit", {species: foundSpecies});
        }
    });
});

// SPECIES UPDATE
router.put("/species/:id", middleware.isLoggedIn, function(req, res){
    Species.findByIdAndUpdate(req.params.id, req.body.species, function (err, updatedSpecies) {
        if(err) {
            console.log(err);
        } else {
            console.log(updatedSpecies);
            res.redirect("/species/" + req.params.id);
        }
    });
});

// SPECIES DELETE

// SPECIES ACTIVITY NEW ROUTE
router.get("/species/:id/activities/new", middleware.isLoggedIn, function(req, res){
    Species.findById(req.params.id, function(err, foundSpecies){
        if(err){
            console.log(err);
        } else {
            res.render("species/activity", {species: foundSpecies});
        }
    });
});

// SPECIES ACTIVITY CREATE ROUTE
router.put("/species/:id/activities", middleware.isLoggedIn, function(req, res){
    // SPLIT TYPE TO MAIN AND SUB ACTIVITY TYPE
    var types = req.body.activity.activityType.split(" ");
    var activity = {
        activityType: types[0],
        subtype: types[1],
        name: req.body.activity.name,
        time: {
            startMonth: req.body.activity.time.startMonth,
            endMonth: req.body.activity.time.endMonth
        }
    };
    Species.findByIdAndUpdate(req.params.id, {$addToSet: {activities: activity}}, function(err, updatedSpecies){
        if(err){
            console.log(err);
        } else {
            console.log(req.body.activity.name + " has been added to the species");
            res.redirect("/species/" + updatedSpecies._id);
        }
    });
});

// SPECIES NUTRIENTS CREATE ROUTE
router.get("/species/:id/nutrients/new", middleware.isLoggedIn, function(req, res){
    Species.findById(req.params.id, function(err, foundSpecies){
        if(err){
            console.log(err);
        } else {
            res.render("species/nutrients", {species: foundSpecies});
        }
    })
});

// SPECIES NUTRIENTS UPDATE ROUTE
router.put("/species/:id/nutrients", middleware.isLoggedIn, function(req, res){
    Species.findByIdAndUpdate(req.params.id, {$set: {nutrients: req.body.nutrients}}, function(err, updatedSpecies){
        if(err){
            console.log(err);
        } else {
            res.redirect("/species/" + updatedSpecies._id);
        }
    });
});

module.exports = router;