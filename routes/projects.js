var express = require("express");
var router = express.Router();
var Parcel = require("../models/parcel");
var Project = require("../models/project");
var Practice = require("../models/practice");
var Layer = require("../models/layer");
var System = require("../models/system");
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

// PROJECTS INDEX ROUTE
router.get("/projects", middleware.isLoggedIn, function(req, res){
    // GET ALL USERS PROJECTS IN DB
    Project.find({'owner.id': req.user._id}, function(err, allProjects){
        if(err) {
            console.log(err);
        } else {
            res.render("projects/index", {projects: allProjects});
        }
    });
});

// SERVICES NEW ROUTE
router.get("/projects/new", middleware.isLoggedIn, function(req, res){
    var place = undefined;
    res.render("projects/new", {place: place});
});

// SERVICES CREATE ROUTE
router.post("/projects", middleware.isLoggedIn, function(req, res){
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
                // Redirect to projects INDEX page
                // req.flash("success", "Successfully added service");
                res.redirect("/projects");
            });
        }
    });
});

// SERVICES SHOW ROUTE
router.get("/projects/:id", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            res.render("projects/show", {project: foundProject});
        }
    });
});

// SERVICES EDIT ROUTE
router.get("/projects/:id/edit", middleware.isLoggedIn, function(req, res){ // MAKE SERVICE OWNERSHIP MIDDLEWARE
    // Find specific experience in database
    Service.findById(req.params.id, function(err, foundService){
        if(err){
            console.log(err);
        } else {
            res.render("projects/edit", {service: foundService});
        }
    });
});

// SERVICES UPDATE ROUTE
router.put("/projects/:id", middleware.isLoggedIn, function(req, res){
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
                    // Redirect to projects INDEX page
                    // req.flash("success", "Successfully added service");
                    res.redirect("/projects/" + req.params.id);
                }
            });
        }
    });
});

// SERVICES DELETE ROUTE
router.delete("/projects/:id", middleware.isLoggedIn, function(req, res){ // MAKE SERVICE OWNERSHIP MIDDLEWARE
    Service.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/projects");
        } else {
            res.redirect("/projects");
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

// LAYER PROJECT NEW ROUTE WITH SYSTEM REF
router.get("/layers/:id/projects/new/:system", middleware.isLoggedIn, function(req, res){ // CHECK OWNERSHIP!!!
    // FIND PLACE ID
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err) {
            console.log(err);
            // res.flash(err
        } else {
            System.findById(req.params.system, function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    res.render("projects/new", {layer: foundLayer, system: foundSystem});
                }
            });
        }
    });
});

// LAYER PROJECT CREATE ROUTE
router.post("/layers/:id/projects", middleware.isLoggedIn, function(req, res){
    // Lookup place using id
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err) {
            console.log(err);
            res.redirect("/layers/" + req.params.id);
        } else {
            Project.create(req.body.project, function (err, createdProject) {
                if (err) {
                    console.log(err);
                } else {
                    // Add username and ID to service.
                    createdProject.owner.id = req.user._id;
                    createdProject.owner.username = req.user.username;
                    // Save the service
                    createdProject.save();
                    // Connect new service to place
                    foundLayer.projects.push(createdProject);
                    foundLayer.save();
                    // Redirect to parcels SHOW page
                    // req.flash("success", "Successfully added comment");
                    res.redirect("/projects/" + createdProject._id);
                }
            });
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

module.exports = router;