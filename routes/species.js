var express = require("express");
var router = express.Router();
var Species = require("../models/species");
var Flow = require("../models/flow");
var middleware = require("../middleware");

// SPECIES INDEX
router.get("/species", middleware.isLoggedIn, function(req, res){
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
router.get("/species/:id", middleware.isLoggedIn, function(req, res){ // ONLY ADMIN ACCESS?
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

module.exports = router;