var express = require("express");
var router = express.Router();
var User = require("../models/user");
var Parcel = require("../models/parcel");
var Practice = require("../models/practice");
var Layer = require("../models/layer");
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

// PARCEL INDEX ROUTE
router.get("/parcels", middleware.isLoggedIn, function(req, res){
    // Get all parcels from DB
    Parcel.find({'owner.id': req.user._id}, function(err, allUserParcels){
        if(err) {
            console.log(err);
        } else {
            res.render("parcels/index", {parcels: allUserParcels});
        }
    });
});

// PARCEL NEW ROUTE
router.get("/parcels/new", middleware.isLoggedIn, function (req, res){
    // Find all products in database and pass to ejs
    Practice.find(function(err, foundPractices){
        if(err){
            console.log(err);
        } else {
            res.render("parcels/new", {practices: foundPractices});
        }
    });
});

// PARCEL CREATE ROUTE
router.post("/parcels", middleware.isLoggedIn, function(req, res){
    // Create variable with new place posted from place form
    var name = req.body.parcel.name;
    var climate = {annualaverageprec: req.body.parcel.climate.annualaverageprec};
    var soilType = req.body.parcel.soilType;
    var agType = req.body.parcel.agType;
    var size = req.body.parcel.size;
    var description = req.body.parcel.description;
    var practices = req.body.practiceids;
    var owner = {
        id: req.user._id,
        username: req.user.username
    };
    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
    geocoder.geocode(req.body.parcel.location, function(err, data){
        if(err || !data.length){
            console.log(err);
            console.log(data);
            return res.redirect("back");
        }
        var lat = data[0].latitude;
        var lng = data[0].longitude;
        var location = data[0].formattedAddress;
        // If image is blank, push in standard image
        var newParcel = {name: name, soilType: soilType, agType: agType, size: size, description: description, location: location, lat: lat, lng: lng, practices: practices, owner: owner, climate: climate};
        // Create a new parcel and save it to the database
        Parcel.create(newParcel, function(err, newlyCreated){
            if(err){
                // req.flash("error", "Something went wrong");
                console.log(err);
            } else {
                console.log(newlyCreated + "added");
                // Find user based on ID
                User.findById(newlyCreated.owner.id, function(err, foundUser){
                    if(err) {
                        console.log(err);
                    } else {
                        // Add the parcel to the users parcels for referencing
                        foundUser.parcels.push(newlyCreated);
                        foundUser.currentProject = newlyCreated;
                        foundUser.save();
                        // Save JSON file to geometry
                        newlyCreated.geometry = req.body.geometry;
                        // Save the layer
                        newlyCreated.save();
                        // req.flash("success", "You have successfully created a new parcel");
                        res.redirect("/parcels/" + newlyCreated._id + "/layers/new");
                    }
                });
            }
        });
    });
});

// PARCEL SHOW ROUTE
router.get("/parcels/:id", middleware.checkParcelOwnership, function(req, res){
    Parcel.findById(req.params.id).populate("practices").populate("layers").exec(function(err, foundParcel){
        if(err) {
            console.log(err);
        } else {
            var soilScore = 0;
            var soilScoreCount = 0;
            var bioScore = 0;
            var bioScoreCount = 0;
            var waterScore = 0;
            var waterScoreCount = 0;
            var climateScore = 0;
            var climateScoreCount = 0;
            foundParcel.practices.forEach(function(practice){
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
            var geometry = "";
            if(foundParcel.layers){
                geometry = foundParcel.layers[0].geometry;
            }
            var soilScoreFinal = (soilScore / soilScoreCount).toFixed(2);
            var bioScoreFinal = (bioScore / bioScoreCount).toFixed(2);
            var waterScoreFinal = (waterScore / waterScoreCount).toFixed(2);
            var climateScoreFinal = (climateScore / climateScoreCount).toFixed(2);
            res.render("parcels/show", {parcel: foundParcel, soilScore: soilScoreFinal, bioScore: bioScoreFinal, waterScore: waterScoreFinal, climateScore: climateScoreFinal, geometry: geometry});
        }
    });
});

// PARCEL EDIT ROUTE
router.get("/parcels/:id/edit", middleware.checkParcelOwnership, function (req, res) {
    // Find specific place in database
    Parcel.findById(req.params.id).populate("practices").exec(function(err, foundParcel){
        if(err) {
            console.log(err);
        } else {
            // Find all products in database
            Practice.find(function(err, foundPractices){
                if(err){
                    console.log(err);
                } else {
                    const practiceArray = [];
                    foundParcel.practices.forEach(function(parcelPractice){
                        practiceArray.push(parcelPractice._id.toString());
                    });
                    res.render("parcels/edit", {parcel: foundParcel, practices: foundPractices, parcelPractices: practiceArray});
                }
            });
        }
    });
});

// PLACES UPDATE ROUTE
router.put("/parcels/:id", middleware.checkParcelOwnership, function(req, res){
    // Create variable for edited place posted from edit place form
    var name = req.body.parcel.name;
    var soilType = req.body.parcel.soilType;
    var agType = req.body.parcel.agType;
    var size = req.body.parcel.size;
    var description = req.body.parcel.description;
    var practices = req.body.practiceids;
    // CONVERT NEW ADDRESS TO COORDINATES USING GEOCODER
    geocoder.geocode(req.body.parcel.location, function(err, data) {
        if (err || !data.length) {
            console.log(err);
            console.log(data);
            return res.redirect("back");
        }
        var lat = data[0].latitude;
        var lng = data[0].longitude;
        var location = data[0].formattedAddress;
        var newParcel = {
            name: name,
            soilType: soilType,
            agType: agType,
            size: size,
            description: description,
            location: location,
            lat: lat,
            lng: lng,
            practices: practices
        };
        Parcel.findByIdAndUpdate(req.params.id, newParcel, function (err, updatedParcel) {
            if (err) {
                console.log(err);
            } else {
                console.log(updatedParcel);
                res.redirect("/parcels/" + req.params.id);
            }
        });
    });
});

// PLACES DESTROY ROUTE
router.delete("/parcels/:id", middleware.checkParcelOwnership, function(req, res){
    Parcel.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/parcels");
        } else {
            res.redirect("/parcels");
        }
    });
});

// ANALYSIS ROUTE FOR ALL PARCEL LAYERS
router.get("/parcels/:id/analysis", middleware.checkParcelOwnership, function(req, res) {
    Parcel.findById(req.params.id).populate("layers").exec(function (err, foundParcel) {
        if (err) {
            console.log(err);
        } else {
            res.render("parcelanalysis", {parcel: foundParcel});
        }
    });
});

// SUCCESSION ROUTE FOR ALL SYSTEMS IN PARCEL LAYERS
router.get("/parcels/:id/composition", middleware.checkParcelOwnership, function(req, res){
    Parcel.findById(req.params.id).populate("layers").exec(function(err, foundParcel){
        if(err) {
            console.log(err);
        } else {
            var layerarray = [];
            foundParcel.layers.forEach(function(layer){
                layerarray.push(layer._id);
            });
            Layer.find({"_id": layerarray}).populate("systems.future").exec(function(err, foundLayers){
                if(err){
                    console.log(err);
                } else {
                    res.render("parcelcomposition", {parcel: foundParcel, layers: foundLayers});
                }
            });
        }
    });
});

module.exports = router;