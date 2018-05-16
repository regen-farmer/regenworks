var express = require("express");
var router = express.Router();
var Place = require("../models/place");
var Product = require("../models/product");
var geodist = require("geodist"); // TO CALCULATE DISTANCE BETWEEN COORDINATES
var middleware = require("../middleware"); // Will automatically require the middleware "index" file as the standard

// NODE GEOCODER CODE
var NodeGeocoder = require("node-geocoder");

var options = {
    provier: "google",
    httpAdapter: "https",
    apiKey: process.env.GEOCODER_API_KEY,
    formatter: null
};

var geocoder = NodeGeocoder(options);
// NODE GEOCODER CODE

// PLACES SEARCH ROUTE
router.post("/places/search", function(req, res){
    // Save location to variable
    var location = req.body.location;
    // Check if user typed postal code
    if(location.length === 4 && !isNaN(location)){
        // Add correct geolocation syntax for geocoder to find correct coordinates based on danish zip code
        location = location + ", denmark";
    };
    // Use geocoder to turn location into coordinates
    geocoder.geocode(location, function(err, data){
        if(err || !data.length){
            console.log(err);
            console.log(data);
            return res.redirect("back");
        }
        // Save user coordinates in temporary variables
        var latUser = data[0].latitude;
        var lngUser = data[0].longitude;
        // Create temporary variable to store distances between place and user coordinates
        var tempDataArr = [];
        // Find all places in the database and save to temporary variable "allPlaces"
        Place.find({}, function(err, allPlaces){
            if(err) {
                console.log(err);
            } else {
                // Put places in temporary array
                allPlaces.forEach(function(place){
                    // Create object with place inside
                    var placeData = place;
                    // Calculate distance between user coordinates and place coordinates
                    var dist = geodist({lat: place.lat, lon: place.lng}, {lat: latUser, lon: lngUser}, {unit: "km"});
                    // Create element in the place object with the distance
                    placeData.distance = dist;
                    // Push object to the temporary array tempDataArr
                    tempDataArr.push(placeData);
                });
                // Sort list ascending based on the distance
                tempDataArr.sort(function(a, b){
                    var a1= a.distance, b1= b.distance;
                    if(a1== b1) return 0;
                    return a1> b1? 1: -1;
                });
                res.render("places/search", {places: tempDataArr});
            }
        });
    });
});

// PLACES INDEX ROUTE
router.get("/places", function(req, res){
    // Get all places from DB
    Place.find({}, function(err, allPlaces){
        if(err) {
            console.log(err);
        } else {
            res.render("places/index", {places: allPlaces});
        }
    });
});

// PLACES NEW ROUTE
router.get("/places/new", middleware.isLoggedIn, function (req, res){
    // Find all products in database and pass to ejs
    Product.find(function(err, foundProducts){
        if(err){
            console.log(err);
        } else {
            res.render("places/new", {products: foundProducts});
        }
    });
});

// PLACES CREATE ROUTE
router.post("/places", middleware.isLoggedIn, function(req, res){
    // Create variable with new place posted from place form
    var name = req.body.place.name;
    var image = req.body.place.image;
    var type = req.body.place.type;
    var description = req.body.place.description;
    var phone = req.body.place.phone;
    var email = req.body.place.email;
    var website = req.body.place.website;
    var products = req.body.productids;
    var owner = {
        id: req.user._id,
        username: req.user.username
    };
    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
    geocoder.geocode(req.body.place.location, function(err, data){
        if(err || !data.length){
            console.log(err);
            console.log(data);
            return res.redirect("back");
        }
        var lat = data[0].latitude;
        var lng = data[0].longitude;
        var location = data[0].formattedAddress;
        // If image is blank, push in standard image
        var newPlace = {name: name, image: image, description: description, type: type, location: location, lat: lat, lng: lng, products: products, owner: owner, phone: phone, email: email, website: website};
        console.log(newPlace);
        // Create a new campground and save it to the database
        Place.create(newPlace, function(err, newlyCreated){
            if(err){
                console.log(err);
            } else {
                console.log(newlyCreated + "added");
                res.redirect("places");
            }
        });
    });
});

// PLACES SHOW ROUTE
router.get("/places/:id", function(req, res){
    Place.findById(req.params.id).populate("products").exec(function(err, foundPlace){
        if(err) {
            console.log(err);
        } else {
            res.render("places/show", {place: foundPlace});
        }
    });
});

// PLACES EDIT ROUTE
router.get("/places/:id/edit", middleware.checkPlaceOwnership, function (req, res) {
    // Find specific place in database
    Place.findById(req.params.id, function(err, foundPlace){
        if(err) {
            console.log(err);
        } else {
            // Find all products in database
            Product.find(function(err, foundProducts){
                if(err){
                    console.log(err);
                } else {
                    res.render("places/edit", {place: foundPlace, products: foundProducts});
                }
            });
        }
    });
});

// PLACES UPDATE ROUTE
router.put("/places/:id", middleware.checkPlaceOwnership, function(req, res){
    // Create variable for edited place posted from edit place form
    var name = req.body.place.name;
    var image = req.body.place.image;
    var type = req.body.place.type;
    var description = req.body.place.description;
    var phone = req.body.place.phone;
    var email = req.body.place.email;
    var website = req.body.place.website;
    // Create array for objects with IDs
    var products = req.body.productids;
    var owner = {
        id: req.user._id,
        username: req.user.username
    };
    // CONVERT NEW ADDRESS TO COORDINATES USING GEOCODER
    geocoder.geocode(req.body.place.location, function(err, data) {
        if (err || !data.length) {
            console.log(err);
            console.log(data);
            return res.redirect("back");
        }
        var lat = data[0].latitude;
        var lng = data[0].longitude;
        var location = data[0].formattedAddress;
        var newPlace = {
            name: name,
            image: image,
            description: description,
            type: type,
            location: location,
            lat: lat,
            lng: lng,
            owner: owner,
            products: products,
            phone: phone,
            email: email,
            website: website
        };
        Place.findByIdAndUpdate(req.params.id, newPlace, function (err, updatedPlace) {
            if (err) {
                console.log(err);
            } else {
                console.log(updatedPlace);
                res.redirect("/places/" + req.params.id);
            }
        });
    });
});

// PLACES DESTROY ROUTE
router.delete("/places/:id", middleware.checkPlaceOwnership, function(req, res){
    Place.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/places");
        } else {
            res.redirect("/places");
        }
    });
});

module.exports = router;