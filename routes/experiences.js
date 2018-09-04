var express = require("express");
var router = express.Router();
var Place = require("../models/place");
var Experience = require("../models/experience");
var geodist = require("geodist"); // TO CALCULATE DISTANCE BETWEEN COORDINATES
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

// EXPERIENCES SEARCH ROUTE
router.post("/experiences/search", function(req, res){
    // Save location to variable
    var location = req.body.locationexp;
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
        // Create temporary variable to store distances between experience and user coordinates
        var tempDataArrBelow = [];
        var tempDataArrAbove = [];
        // Set above and below target
        var distTarget = 30;
        // Find all experiences in the database and save to temporary variable "allExperiences"
        Experience.find({}, function(err, allExperiences){
            if(err) {
                console.log(err);
            } else {
                const monthNames = ["Januar", "Februar", "Marts", "April", "Maj", "Juni",
                    "Juli", "August", "September", "Oktober", "November", "December"
                ];
                // Put experience in temporary array
                allExperiences.forEach(function(experience){
                    // Create object with experience inside
                    var experienceData = experience;
                    // Calculate distance between user coordinates and experience coordinates
                    var dist = geodist({lat: experience.lat, lon: experience.lng}, {lat: latUser, lon: lngUser}, {unit: "km"});
                    // Create element in the place object with the distance
                    experienceData.distance = dist;
                    // Set month and day parameters
                    var dateParts = experience.start.date.split("-");
                    var monthNumber = parseInt(dateParts[1], 10) - 1;
                    experience.month = monthNames[monthNumber];
                    experience.day = parseInt(dateParts[2], 10);
                    // Push object with experience to the temporary array tempDataArr depending on distance
                    if(dist < distTarget){
                        tempDataArrBelow.push(experienceData);
                    } else {
                        tempDataArrAbove.push(experienceData);
                    }
                });
                // Sort below list ascending based on the date
                tempDataArrBelow.sort(function(a, b){
                    var a1= Date.parse(a.start.date), b1= Date.parse(b.start.date);
                    if(a1== b1) return 0;
                    return a1> b1? 1: -1;
                });
                // Sort above list ascending based on the date
                tempDataArrAbove.sort(function(a, b){
                    var a1= Date.parse(a.start.date), b1= Date.parse(b.start.date);
                    if(a1== b1) return 0;
                    return a1> b1? 1: -1;
                });
                res.render("experiences/search", {experiencesBelow: tempDataArrBelow, experiencesAbove: tempDataArrAbove, searchterm: req.body.locationexp});
            }
        });
    });
});

// EXPERIENCES INDEX ROUTE
router.get("/experiences", function(req, res){
    // Get all experiences from DB
    Experience.find({}, function(err, allExperiences){
        if(err) {
            console.log(err);
        } else {
            const monthNames = ["Januar", "Februar", "Marts", "April", "Maj", "Juni",
                "Juli", "August", "September", "Oktober", "November", "December"
            ];
            allExperiences.forEach(function(experience){
                var dateParts = experience.start.date.split("-");
                var monthNumber = parseInt(dateParts[1], 10) - 1;
                experience.month = monthNames[monthNumber];
                experience.day = parseInt(dateParts[2], 10);
            });
            res.render("experiences/index", {experiences: allExperiences});
        }
    });
});

// EXPERIENCES NEW ROUTE
router.get("/experiences/new", middleware.isLoggedIn, function(req, res){
    var place = undefined;
    res.render("experiences/new", {place: place});
});

// EXPERIENCES CREATE ROUTE
router.post("/experiences", middleware.isLoggedIn, function(req, res){
    // Create a new experience
    Experience.create(req.body.experience, function(err, experience){
        if(err){
            console.log(err);
        } else {
            console.log(experience);
            // CONVERT ADDRESS TO COORDINATES USING GEOCODER
            geocoder.geocode(req.body.experience.location, function(err, data) {
                if (err || !data.length) {
                    console.log(err);
                    return res.redirect("back");
                }
                experience.lat = data[0].latitude;
                experience.lng = data[0].longitude;
                experience.location = data[0].formattedAddress;
                // Add username and ID to experience
                experience.owner.id = req.user._id;
                experience.owner.username = req.user.username;
                // Save the experience
                experience.save();
                // Redirect to experience INDEX page
                // req.flash("success", "Successfully added experience");
                res.redirect("/experiences");
            });
        }
    });
});

// EXPERIENCES SHOW ROUTES
router.get("/experiences/:id", function(req, res){
    Experience.findById(req.params.id, function(err, foundExperience){
        if(err){
            console.log(err);
        } else {
            var dateParts = foundExperience.start.date.split("-");
            const monthNames = ["Januar", "Februar", "Marts", "April", "Maj", "Juni",
                "Juli", "August", "September", "Oktober", "November", "December"
            ];
            var monthNumber = parseInt(dateParts[1], 10) - 1;
            var month = monthNames[monthNumber];
            var day = parseInt(dateParts[2], 10);
            res.render("experiences/show", {experience: foundExperience, month: month, day: day});
        }
    });
});

// EXPERIENCES EDIT ROUTE
router.get("/experiences/:id/edit", function(req, res){ // MAKE EXPERIENCE OWNERSHIP MIDDLEWARE
    // Find specific experience in database
    Experience.findById(req.params.id, function(err, foundExperience){
        if(err){
            console.log(err);
        } else {
            res.render("experiences/edit", {experience: foundExperience});
        }
    });
});

// EXPERIENCES UPDATE ROUTE
router.put("/experiences/:id", function(req, res){
    Experience.findByIdAndUpdate(req.params.id, req.body.experience, function(err, updatedExperience){
        if(err) {
            console.log(err);
        } else {
            // CONVERT ADDRESS TO COORDINATES USING GEOCODER
            geocoder.geocode(updatedExperience.location, function(err, data) {
                if (err || !data.length) {
                    console.log(err);
                    return res.redirect("back");
                } else {
                    updatedExperience.lat = data[0].latitude;
                    updatedExperience.lng = data[0].longitude;
                    updatedExperience.location = data[0].formattedAddress;
                    // Save the updatedExperience
                    updatedExperience.save();
                    console.log(updatedExperience);
                    res.redirect("/experiences/" + req.params.id);
                }
            });
        }
    });
});

// PLACE EXPERIENCES DELETE ROUTE
router.delete("/experiences/:id", function(req, res){ // MAKE EXPERIENCE OWNERSHIP MIDDLEWARE
    Experience.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/places");
        } else {
            res.redirect("/places");
        }
    });
});


// --------------- NESTED ROUTES ---------------- //

// PLACE EXPERIENCES NEW ROUTE
router.get("/places/:id/experiences/new", middleware.isLoggedIn, function(req, res){
    // FIND PLACE ID
    Place.findById(req.params.id, function(err, foundPlace){
        if(err) {
            console.log(err);
            // res.flash(err
        } else {
            res.render("experiences/new", {place: foundPlace});
        }
    });
});

// PLACE EXPERIENCES CREATE ROUTE
router.post("/places/:id/experiences", middleware.isLoggedIn, function(req, res){
    // Lookup place using id
    Place.findById(req.params.id, function(err, foundPlace){
        if(err) {
            console.log(err);
            res.redirect("/places");
        } else {
            Experience.create(req.body.experience, function (err, experience) {
                if (err) {
                    console.log(err);
                } else {
                    console.log(experience);
                    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
                    geocoder.geocode(req.body.experience.location, function (err, data) {
                        if (err || !data.length) {
                            console.log(err);
                            return res.redirect("back");
                        }
                        experience.lat = data[0].latitude;
                        experience.lng = data[0].longitude;
                        experience.location = data[0].formattedAddress;
                        // Add username and ID to experience.
                        experience.owner.id = req.user._id;
                        experience.owner.username = req.user.username;
                        // Save the experience
                        experience.save();
                        // Connect new experience to place
                        foundPlace.experiences.push(experience);
                        foundPlace.save();
                        // Redirect to places SHOW page
                        // req.flash("success", "Successfully added comment");
                        res.redirect("/places/" + foundPlace._id);
                    });
                }
            });
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

module.exports = router;