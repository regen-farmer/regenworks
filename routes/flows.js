var express = require("express");
var router = express.Router();
var Flow = require("../models/flow");
var Species = require("../models/species");
var Parcel = require("../models/parcel");
var System = require("../models/system");
var middleware = require("../middleware");

// PARCEL FLOWS
router.get("/parcels/:id/flows", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate("layers").exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            // RENDER ACTIVITIES
            res.render("flows/index", {parcel: foundParcel})
        }
    });
});

// NESTED SPECIES FLOW NEW ROUTE
router.get("/species/:id/flows/new", middleware.isLoggedIn, function(req, res){
    // FIND SPECIES ID
    Species.findById(req.params.id, function(err, foundSpecies){
        if(err){
            console.log(err);
        } else {
            res.render("flows/new", {species: foundSpecies});
        }
    })
});

// NESTED SPECIES FLOW CREATE ROUTE
router.post("/species/:id/flows", middleware.isLoggedIn, function(req, res){
    // FIND SPECIES
    Species.findById(req.params.id, function(err, foundSpecies){
        if(err){
            console.log(err);
        } else {
            console.log(req.body.flow);
            Flow.create(req.body.flow, function(err, createdFlow){
                if(err) {
                    console.log(err);
                } else {
                    foundSpecies.flows.push(createdFlow);
                    foundSpecies.save();
                    res.redirect("/species/" + foundSpecies._id);
                }
            });
        }
    });
});

// NESTED SYSTEM FLOW NEW ROUTE


// NESTED SYSTEM FLOW CREATE ROUTE

module.exports = router;