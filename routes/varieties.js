var express = require("express");
var router = express.Router();
var Variety = require("../models/variety");
var Species = require("../models/species");
var middleware = require("../middleware");

// VARIETY NEW
router.get("/varieties/new", middleware.isLoggedIn, function(req, res){
    // FIND ALL SPECIES
    Species.find(function(err, allSpecies){
        if(err) {
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
            res.render("varieties/new", {species: allSpecies});
        }
    });
});

// VATERTY CREATE
router.post("/varieties", middleware.isLoggedIn, function(req, res){
    // CLEAN NONE OPTIONS
    var variety = req.body.variety;
    if(req.body.variety.species === ""){
        delete variety.species;
    }
    if(req.body.variety.hybrid === ""){
        delete variety.hybrid;
    }
    if(req.body.variety.rootstock.species === ""){
        delete variety.rootstock.species;
    }
    // CREATE VARIETY
    Variety.create(variety, function(err, createdVariety){
        if(err){
            console.log(err);
        } else {
            // SET OWNERSHIP
            createdVariety.owner.id = req.user._id;
            createdVariety.owner.username = req.user.username;
            createdVariety.save();
            // REDIRECT TO USER
            res.redirect("/users/" + req.user._id);
        }
    });
});

module.exports = router;