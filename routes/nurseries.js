var express = require("express");
var router = express.Router();
var Nursery = require("../models/nursery");
var NurseryProduct = require("../models/nurseryproduct");
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
router.get("/nurseries", middleware.isLoggedIn, function(req, res){
    // FIND NURSERY BASED ON USER
    Nursery.find({"owner._id": req.user.id}, function(err, foundNurseries){
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
router.post("/nurseries", middleware.isLoggedIn, function(req, res){
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
/*

                foundUser.nurseries.push(createdNursery);
                foundUser.save();
*/

                console.log("Nursery created: " + createdNursery);
                res.redirect("/nurseries/" + createdNursery._id);
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


module.exports = router;