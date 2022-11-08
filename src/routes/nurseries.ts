import express from "express";
var router = express.Router();
import Nursery from "../models/nursery";
import NurseryProduct from "../models/nurseryproduct";
import User from "../models/user";
var middleware = require("../middleware");

// NODE GEOCODER CODE
var NodeGeocoder = require("node-geocoder");

var options = {
    provier: "google",
    httpAdapter: "https",
    apiKey: process.env.GEOCODER_API_KEY,
    formatter: null
};

var geocoder = NodeGeocoder(options);

// NURSERY INDEX
router.get("/nurseries", middleware.isLoggedIn, function(req:any, res){
    // FIND NURSERY BASED ON USER
    Nursery.find({'owner.id': req.user._id}, function(err, foundNurseries){
        if(err){
            console.log(err);
        } else {
            console.log(foundNurseries.length);
            res.render("nurseries/index", {nurseries: foundNurseries});
        }
    });
});

// NURSERY NEW
router.get("/nurseries/new", middleware.isLoggedIn, function(req, res){ // ADMIN LOGIN REQUIRED
    res.render("nurseries/new");
});

// ANIMAL CREATE
router.post("/nurseries", middleware.isLoggedIn, function(req:any, res){
    // SET INITIAL VARIABLE
    var newNursery = req.body.nursery;
    // GEOLOCATION
    geocoder.geocode(req.body.nursery.location, function(err, data) {
        if (err || !data.length) {
            console.log(err);
            console.log(data);
            return res.redirect("back");
        }
        // SET NEW LATS
        newNursery.lat = data[0].latitude;
        newNursery.lng = data[0].longitude;
        newNursery.location = data[0].formattedAddress;
        Nursery.create(newNursery, function (err, createdNursery) {
            if (err) {
                console.log(err);
            } else {
                // SET OWNERSHIP
                createdNursery.owner.id = req.user._id;
                createdNursery.owner.username = req.user.username;
                createdNursery.save();
                // ADD TO USER
                User.findById(req.user._id, function(err, foundUser){
                    if(err) {
                        console.log(err);
                    } else {
                        // Add the parcel to the users parcels for referencing
                        foundUser.nurseries.push(createdNursery);
                        foundUser.save();
                        // REDIRECT
                        console.log("Nursery created: " + createdNursery);
                        res.redirect("/nurseries/" + createdNursery._id);
                    }
                });
            }
        });
    });
});

// NURSERY SHOW
router.get("/nurseries/:id", middleware.isLoggedIn, function(req, res){ // DO OWNERSHIP MODEL
    // FIND NURSERY
    Nursery.findById(req.params.id).populate("products").exec(function(err, foundNursery){
        if(err){
            console.log(err);
        } else {
            // RENDER SHOW PAGE
            res.render("nurseries/show", {nursery: foundNursery});
        }
    });
});

// NURSERY EDIT
router.get("/nurseries/:id/edit", middleware.isLoggedIn, function(req, res){
    // FIND NURSERY
    Nursery.findById(req.params.id, function(err, foundNursery){
        if(err){
            console.log(err);
        } else {
            res.render("nurseries/edit", {nursery: foundNursery});
        }
    });
});


// NURSERY UPDATE
router.put("/nurseries/:id", middleware.isLoggedIn, function(req, res){
    // SETUP NEW GEO
    // SET INITIAL VARIABLE
    var newNursery = req.body.nursery;
    // GEOLOCATION
    geocoder.geocode(req.body.nursery.location, async function(err, data) {
        if (err || !data.length) {
            console.log(err);
            console.log(data);
            return res.redirect("back");
        }
        // SET NEW LATS
        newNursery.lat = data[0].latitude;
        newNursery.lng = data[0].longitude;
        newNursery.location = data[0].formattedAddress;
        try {
            let updateNursery = await Nursery.findByIdAndUpdate(req.params.id, newNursery);
            // REDIRECT
            console.log("Nursery update: " + updateNursery);
            res.redirect("/nurseries/" + updateNursery._id);
        } catch (err) {
                console.log(err);
        } 
        
    });
});


module.exports = router;