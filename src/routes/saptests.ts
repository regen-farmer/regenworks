import express from "express";
var router = express.Router();
import Parcel from "../models/parcel";
import Layer from "../models/layer";
import Saptest from "../models/saptest";
var middleware = require("../middleware");


// PARCEL LAYER SAP TEST NEW
router.get("/parcels/:id/layers/:pid/saptests/new", middleware.isLoggedIn, function(req, res){
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
                    res.render("saptests/new", {parcel: foundParcel, layer: foundLayer});
                }
            });
        }
    });
});

// PARCEL LAYER SOIL TEST CREATE
router.post("/parcels/:id/layers/:pid/saptests", middleware.isLoggedIn, function(req, res){
    // PARSE COORDINATES
    /*var sapTest = req.body.saptest;
    var parsedCoordinates = req.body.coordinates.split(", ");
    console.log(parsedCoordinates);
    soiltest.lat = parsedCoordinates[0];
    soiltest.lat = parsedCoordinates[1];
    res.redirect("/parcels/" + req.params.id + "/status");*/
    // CREATE SOIL TEST
    Saptest.create(req.body.saptest, function(err, createdSaptest){
        if(err){
            console.log(err);
        } else {
            Layer.findByIdAndUpdate(req.params.pid, { $push: { saptests: createdSaptest } }, function(err, updatedLayer){
                if(err){
                    console.log(err);
                } else {
                    // RENDER PARCEL LAYER SAP TEST PAGE
                    res.redirect("/parcels/" + req.params.id + "/status");
                }
            });
        }
    });
});

module.exports = router;