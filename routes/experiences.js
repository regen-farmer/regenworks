var express = require("express");
var router = express.Router();
var Place = require("../models/place");
var Experience = require("../models/experience");
var middleware = require("../middleware");

// EXPERIENCES INDEX ROUTE
router.get("/experiences", function(req, res){
    // Get all experiences from DB
    Experience.find({}, function(err, allExperiences){
        if(err) {
            console.log(err);
        } else {
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
            // Add username and ID to experience.
            experience.owner.id = req.user._id;
            experience.owner.username = req.user.username;
            // Save the experience
            experience.save();
            // Redirect to experience INDEX page
            // req.flash("success", "Successfully added experience");
            res.redirect("/experiences");
        }
    });
});

// EXPERIENCES SHOW ROUTE
router.get("/experiences/:id", function(req, res){
    Experience.findById(req.params.id, function(err, foundExperience){
        if(err){
            console.log(err);
        } else {
            res.render("experiences/show", {experience: foundExperience});
        }
    });
});

// PLACE EXPERIENCES EDIT ROUTE
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

// PLACE EXPERIENCES UPDATE ROUTE
router.put("/experiences/:id", function(req, res){
    Experience.findByIdAndUpdate(req.params.id, req.body.experience, function(err, updatedExperience){
        if(err) {
            console.log(err);
        } else {
            console.log(updatedExperience);
            res.redirect("/experiences/" + req.params.id);
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

// PLACE EXPERIENCES INDEX ROUTE - NOT NEEDED?

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
            Experience.create(req.body.experience, function(err, experience){
                if(err){
                    console.log(err);
                } else {
                    console.log(experience);
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
                }
            });
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

module.exports = router;