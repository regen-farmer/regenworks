var express = require("express");
var router = express.Router();
var Parcel = require("../models/parcel");
var Layer = require("../models/layer");
var middleware = require("../middleware");


// PARCEL LAYER SOIL TEST NEW
router.get("/parcels/:id/layers/:pid/soiltests/new", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate("layers").exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            // FIND LAYER
            Layer.findById(req.params.pid, function(err, foundLayer){
                if(err){
                    console.log(err);
                } else {
                    // RENDER ACTIVITIES
                    res.render("soiltests/new", {parcel: foundParcel, layer: foundLayer});
                }
            });
        }
    });
});

// PARCEL LAYER SOIL TEST CREATE
router.post("/parcels/:id/layers/:pid/soiltests", middleware.isLoggedIn, function(req, res){
    // PARSE COORDINATES
    var soilTest = req.body.soiltest;
    var parsedCoordinates = req.body.coordinates.split(", ");
    console.log(parsedCoordinates);
    soiltest.lat = parsedCoordinates[0];
    soiltest.lat = parsedCoordinates[1];
    res.redirect("/parcels/" + req.params.id + "/status");
    // CREATE SOIL TEST
    Soiltest.create(soilTest, function(err, createdSoiltest){
        if(err){
            console.log(err);
        } else {
            Layer.findByIdAndUpdate(req.params.pid, function(err, foundLayer){
                if(err){
                    console.log(err);
                } else {
                    // RENDER PARCEL LAYER SOIL TEST PAGE
                    res.redirect("/parcels/" + req.params.id + "/status");
                }
            });
        }
    });
});

module.exports = router;