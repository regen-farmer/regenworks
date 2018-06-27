var express = require("express");
var router = express.Router();
var Place = require("../models/place");
var Service = require("../models/service");
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

// SERVICES INDEX ROUTE
router.get("/services", function(req, res){
    // Get all experiences from DB
    Service.find({}, function(err, allServices){
        if(err) {
            console.log(err);
        } else {
            res.render("services/index", {services: allServices});
        }
    });
});

// SERVICES NEW ROUTE
router.get("/services/new", middleware.isLoggedIn, function(req, res){
    var place = undefined;
    res.render("services/new", {place: place});
});

// SERVICES CREATE ROUTE
router.post("/services", middleware.isLoggedIn, function(req, res){
    // Create a new service
    Service.create(req.body.service, function(err, service){
        if(err){
            console.log(err);
        } else {
            // CONVERT ADDRESS TO COORDINATES USING GEOCODER
            geocoder.geocode(req.body.service.location, function(err, data) {
                if (err || !data.length) {
                    console.log(err);
                    return res.redirect("back");
                }
                service.lat = data[0].latitude;
                service.lng = data[0].longitude;
                service.location = data[0].formattedAddress;
                // Add username and ID to experience
                service.owner.id = req.user._id;
                service.owner.username = req.user.username;
                // Save the service - Not need if created after this step
                service.save();
                // Redirect to services INDEX page
                // req.flash("success", "Successfully added service");
                res.redirect("/services");
            });
        }
    });
});

// SERVICES SHOW ROUTE
router.get("/services/:id", function(req, res){
    Service.findById(req.params.id, function(err, foundService){
        if(err){
            console.log(err);
        } else {
            const monthNames = ["Januar", "Februar", "Marts", "April", "Maj", "Juni",
                "Juli", "August", "September", "Oktober", "November", "December"
            ];
            var datePartsStart = foundService.period.start.split("-");
            var monthNumberStart = parseInt(datePartsStart[1], 10) - 1;
            var monthStart = monthNames[monthNumberStart];
            var datePartsEnd = foundService.period.end.split("-");
            var monthNumberEnd = parseInt(datePartsEnd[1], 10) - 1;
            var monthEnd = monthNames[monthNumberEnd];
            res.render("services/show", {service: foundService, monthStart: monthStart, monthEnd: monthEnd});
        }
    });
});

// SERVICES EDIT ROUTE
router.get("/services/:id/edit", function(req, res){ // MAKE SERVICE OWNERSHIP MIDDLEWARE
    // Find specific experience in database
    Service.findById(req.params.id, function(err, foundService){
        if(err){
            console.log(err);
        } else {
            res.render("services/edit", {service: foundService});
        }
    });
});

// SERVICES UPDATE ROUTE
router.put("/services/:id", middleware.isLoggedIn, function(req, res){
    // Create a new service
    Service.findByIdAndUpdate(req.params.id, req.body.service, function(err, updatedService){
        if(err){
            console.log(err);
        } else {
            // CONVERT ADDRESS TO COORDINATES USING GEOCODER
            geocoder.geocode(updatedService.location, function(err, data) {
                if (err || !data.length) {
                    console.log(err);
                    return res.redirect("back");
                } else {
                    updatedService.lat = data[0].latitude;
                    updatedService.lng = data[0].longitude;
                    updatedService.location = data[0].formattedAddress;
                    // Save the service - Not need if created after this step
                    updatedService.save();
                    // Redirect to services INDEX page
                    // req.flash("success", "Successfully added service");
                    res.redirect("/services/" + req.params.id);
                }
            });
        }
    });
});

// SERVICES DELETE ROUTE
router.delete("/services/:id", function(req, res){ // MAKE SERVICE OWNERSHIP MIDDLEWARE
    Service.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/services");
        } else {
            res.redirect("/services");
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

// PLACE EXPERIENCES NEW ROUTE
router.get("/places/:id/services/new", middleware.isLoggedIn, function(req, res){
    // FIND PLACE ID
    Place.findById(req.params.id, function(err, foundPlace){
        if(err) {
            console.log(err);
            // res.flash(err
        } else {
            res.render("services/new", {place: foundPlace});
        }
    });
});

// PLACE EXPERIENCES CREATE ROUTE
router.post("/places/:id/services", middleware.isLoggedIn, function(req, res){
    // Lookup place using id
    Place.findById(req.params.id, function(err, foundPlace){
        if(err) {
            console.log(err);
            res.redirect("/places");
        } else {
            Service.create(req.body.service, function (err, service) {
                if (err) {
                    console.log(err);
                } else {
                    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
                    geocoder.geocode(req.body.service.location, function (err, data) {
                        if (err || !data.length) {
                            console.log(err);
                            return res.redirect("back");
                        }
                        service.lat = data[0].latitude;
                        service.lng = data[0].longitude;
                        service.location = data[0].formattedAddress;
                        // Add username and ID to service.
                        service.owner.id = req.user._id;
                        service.owner.username = req.user.username;
                        // Add host name and ID to service.
                        service.host.id = foundPlace.id;
                        service.host.name = foundPlace.name;
                        // Save the service
                        service.save();
                        // Connect new service to place
                        foundPlace.services.push(service);
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