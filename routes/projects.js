var express = require("express");
var router = express.Router();
var Parcel = require("../models/parcel");
var Project = require("../models/project");
var Practice = require("../models/practice");
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
            // FIND ALL THE USERS PARCELS
            Parcel.find({'owner.id': req.user._id}).populate("practices").populate("layers").exec(function(err, foundParcels){
                if(err) {
                    console.log(err);
                } else {
                    // FIND ALL PRACTICES
                    Practice.find({},function(err, allPractices){
                        if(err) {
                            console.log(err);
                        } else {
                            // FIND SCORE FOR EACH OF THE FOUR REGENSCORE FOR EACH PARCEL
                            for (i = 0; i < foundParcels.length; i++){
                                // DEFINE TEMPORARY SCORE VARIABLES AND COUNTERS
                                var soilScore = 0;
                                var soilScoreCount = 0;
                                var bioScore = 0;
                                var bioScoreCount = 0;
                                var waterScore = 0;
                                var waterScoreCount = 0;
                                var climateScore = 0;
                                var climateScoreCount = 0;
                                // SETUP TEMPORARY ARRAY FOR RECOMMENDED PRACTICES
                                foundParcels[i].recPractices = [];
                                // CALCULATE SUM OF SCORES FROM ALL PRACTICES IN PARCEL
                                foundParcels[i].practices.forEach(function(practice){
                                    if(practice.regenScores.soilScore && !(practice.regenScores.soilScore === 0)){
                                        soilScore = soilScore + practice.regenScores.soilScore;
                                        soilScoreCount = soilScoreCount + 1;
                                    }
                                    if(practice.regenScores.bioScore && !(practice.regenScores.bioScore === 0)){
                                        bioScore = bioScore + practice.regenScores.bioScore;
                                        bioScoreCount = bioScoreCount + 1;
                                    }
                                    if(practice.regenScores.waterScore && !(practice.regenScores.waterScore === 0)){
                                        waterScore = waterScore + practice.regenScores.waterScore;
                                        waterScoreCount = waterScoreCount + 1;
                                    }
                                    if(practice.regenScores.climateScore && !(practice.regenScores.climateScore === 0)){
                                        climateScore = climateScore + practice.regenScores.climateScore;
                                        climateScoreCount = climateScoreCount + 1;
                                    }
                                });
                                // PUSH FINAL SCORES TO THE PARCEL
                                foundParcels[i].soilScoreFinal = (soilScore / soilScoreCount);
                                foundParcels[i].bioScoreFinal = (bioScore / bioScoreCount);
                                foundParcels[i].waterScoreFinal = (waterScore / waterScoreCount);
                                foundParcels[i].climateScoreFinal = (climateScore / climateScoreCount);
                                // CALCULATE DIFFERENCE OF EACH SCORE FOR EACH PRACTICE
                                for (j = 0; j < allPractices.length; j++){
                                    var soilDif = 0;
                                    var bioDif = 0;
                                    var waterDif = 0;
                                    var climateDif = 0;
                                    // CALCULATE DIFFERENCE BETWEEN EACH SCORE
                                    if(allPractices[j].regenScores.soilScore && !(allPractices[j].regenScores.soilScore === 0) && foundParcels[i].soilScoreFinal){
                                        soilDif = allPractices[j].regenScores.soilScore - foundParcels[i].soilScoreFinal;
                                    }
                                    if(allPractices[j].regenScores.bioScore && !(allPractices[j].regenScores.bioScore === 0) && foundParcels[i].bioScoreFinal){
                                        soilDif = allPractices[j].regenScores.bioScore - foundParcels[i].bioScoreFinal;
                                    }
                                    if(allPractices[j].regenScores.waterScore && !(allPractices[j].regenScores.waterScore === 0) && foundParcels[i].waterScoreFinal){
                                        soilDif = allPractices[j].regenScores.waterScore - foundParcels[i].waterScoreFinal;
                                    }
                                    if(allPractices[j].regenScores.climateScore && !(allPractices[j].regenScores.climateScore === 0) && foundParcels[i].climateScoreFinal){
                                        soilDif = allPractices[j].regenScores.climateScore - foundParcels[i].climateScoreFinal;
                                    }
                                    // ADD UP ALL DIFFERENCES
                                    var scoreDifference = soilDif + bioDif + waterDif + climateDif;
                                    // ADD DIFFERENCE TO PRACTICE VARIABLE
                                    allPractices[j].scoreDiffence = scoreDifference;
                                    // PUSH PRACTICE TO PARCEL REC PRACTICE ARRAY IF IT'S NOT IN THE PARCEL ALREADY
                                    if(!(foundParcels[i].practices.includes(allPractices[j]))){
                                        foundParcels[i].recPractices.push(allPractices[j]);
                                    }
                                }
                                foundParcels[i].recPractices.sort(function (a, b) {
                                    return a.scoreDiffence - b.scoreDiffence;
                                });
                                foundParcels[i].recPractices.reverse();
                            }
                            res.render("projects/index", {projects: allProjects, parcels: foundParcels});
                        }
                    });
                }
            });
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
            res.render("projects/show", {service: foundService, monthStart: monthStart, monthEnd: monthEnd});
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

// PLACE EXPERIENCES NEW ROUTE
router.get("/parcels/:id/projects/new", middleware.isLoggedIn, function(req, res){
    // FIND PLACE ID
    Place.findById(req.params.id, function(err, foundPlace){
        if(err) {
            console.log(err);
            // res.flash(err
        } else {
            res.render("projects/new", {place: foundPlace});
        }
    });
});

// PLACE EXPERIENCES CREATE ROUTE
router.post("/parcels/:id/projects", middleware.isLoggedIn, function(req, res){
    // Lookup place using id
    Place.findById(req.params.id, function(err, foundPlace){
        if(err) {
            console.log(err);
            res.redirect("/parcels");
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
                        // Redirect to parcels SHOW page
                        // req.flash("success", "Successfully added comment");
                        res.redirect("/parcels/" + foundPlace._id);
                    });
                }
            });
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

module.exports = router;