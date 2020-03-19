var express = require("express");
var router = express.Router();
var unique = require("array-unique");
var System = require("../models/system");
var Layer = require("../models/layer");
var Species = require("../models/species");
var Parcel = require("../models/parcel");
var middleware = require("../middleware");

// NESTED AREA SYSTEM INDEX
router.get("/layers/:id/systems", middleware.isLoggedIn, function(req, res){
    // FIND LAYER ID
    Layer.findById(req.params.id).populate("systems.future").populate("systems.present").populate("systems.past").exec(function(err, foundLayer){
        if(err) {
            console.log(err);
        } else {
            res.render("systems/index", {layer: foundLayer});
        }
    });
});

// NESTED AREA SYSTEM NEW ROUTE
router.get("/layers/:id/systems/new", middleware.isLoggedIn, function(req, res){
    // FIND LAYER ID
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err) {
            console.log(err);
        } else {
            // FIND ALL SPECIES IN THE DATABASE
            Species.find(function(err, foundSpecies){
                if(err) {
                    console.log(err);
                } else {
                    // SORT SPECIES
                    function compare( a, b ) {
                        if ( a.nameCommon < b.nameCommon ){
                            return -1;
                        }
                        if ( a.nameCommon > b.nameCommon ){
                            return 1;
                        }
                        return 0;
                    }
                    foundSpecies.sort(compare);
                    // RENDER NEW SYSTEM PAGE WITH SPECIES
                    res.render("systems/new", {layer: foundLayer, species: foundSpecies});
                }
            });
        }
    });
});

// NESTED AREA SYSTEM CREATE ROUTE
router.post("/layers/:id/systems", middleware.isLoggedIn, function(req, res){
    // FIND LAYER ID
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err) {
            console.log(err);
        } else {
            // GET SYSTEM
            var system = req.body.system;
            // SET BOOLEAN
            if(req.body.system.shared){
                system.shared = true;
            }
            // CLEAN ARRAY
            var rows = [];
            for(i=0;i<system.rows.length;i++){
                // REMOVE ITEMS WITH "NONE" (WHAT IF ROWS HAVE DIFFERENT AMOUNTS?!) REDIRECT?!
                for(var j = system.rows[i].sequense.length - 1; j >= 0; j--){
                    if(system.rows[i].sequense[j] === ""){
                        system.rows[i].sequense.splice(j, 1);
                    }
                }
                // REMOVE EMPTY ROWS IF WIDTH IS NOT FILLED OUT
                if(!(system.rows[i].width === "")){
                    rows.push(system.rows[i]);
                }
            }
            // INSERT UPDATED ROWS
            system.rows = rows;
            System.create(system, function(err, createdSystem){
                if(err) {
                    console.log(err);
                } else {
                    console.log(createdSystem);
                    // ADD OWNER
                    createdSystem.owner.id = req.user._id;
                    createdSystem.owner.username = req.user.username;
                    createdSystem.save();
                    // IF LAYER IS AGROFORESTRY AND NO PRESENT, PUSH TO CURRENT
                    if(foundLayer.type === "agroforestry" && foundLayer.systems.present === undefined){
                        foundLayer.systems.present = createdSystem;
                        foundLayer.save();
                        res.redirect("/layers/" + foundLayer._id);
                    } else {
                        // Push system to layer future if layer type is not agroforestry
                        foundLayer.systems.future.push(createdSystem);
                        foundLayer.save();
                        res.redirect("/layers/" + foundLayer._id);
                    }
                }
            })
        }
    })
});

// SYSTEM SHOW ROUTE
router.get("/systems/:id", middleware.isLoggedIn, function(req, res){
    System.findById(req.params.id).populate("rows.sequense").exec(function(err, foundSystem){
        if(err){
            console.log(err);
        } else {
            // FIND ALL SPECIES IN SYSTEM
            var allSpecies = [];
            foundSystem.rows.forEach(function(row){
                row.sequense.forEach(function(species){
                    allSpecies.push(species.id);
                });
            });
            // FIND UNIQUE SPECIES / REMOVE DUPLICATES
            var uniqueSpecies = unique(allSpecies);
            // FIND SPECIES AND POPULATE FLOWS
            Species.find({"_id": uniqueSpecies}).populate("flows").exec(function(err, foundSpecies){
                if(err) {
                    console.log(err);
                } else {
                    res.render("systems/show", {system: foundSystem, species: foundSpecies});
                }
            });
        }
    });
});

// SYSTEM EDIT ROUTE

// SYSTEM UPDATE ROUTE

// SYSTEM DELETE ROUTE

// SYSTEM SUCCESSION ROUTE
router.get("/systems/:id/succession", middleware.isLoggedIn, function (req, res) {
    System.findById(req.params.id).populate("rows").exec(function(err, foundSystem){
        if(err) {
            console.log(err);
        } else {
            res.render("succession", {system: foundSystem});
        }
    });
});

// SYSTEM COMPOSITION ROUTE
router.get("/systems/:id/composition", middleware.isLoggedIn, function (req, res) {
    System.findById(req.params.id).populate("rows.sequense").exec(function(err, foundSystem){
        if(err) {
            console.log(err);
        } else {
            // FIND ALL SPECIES IN SYSTEM
            var allSpecies = [];
            foundSystem.rows.forEach(function(row){
                row.sequense.forEach(function(species){
                    allSpecies.push(species.id);
                });
            });
            // FIND UNIQUE SPECIES / REMOVE DUPLICATES
            var uniqueSpecies = unique(allSpecies);
            // FIND SPECIES AND POPULATE FLOWS
            Species.find({"_id": uniqueSpecies}).populate("flows").exec(function(err, foundSpecies){
                if(err) {
                    console.log(err);
                } else {
                    Parcel.findById(req.user.currentProject, function(err, foundParcel){
                        if(err){
                            console.log(err);
                        } else {
                            Species.find({"precipitation.max": {$gt: foundParcel.climate.annualaverageprec}, "precipitation.min": {$lt: foundParcel.climate.annualaverageprec}, "temperature.min": {$lt: foundParcel.climate.hardiness.high}, "temperature.max": {$gt: foundParcel.climate.hardiness.low}}, function(err, foundSuitableSpecies){
                                if(err){
                                    console.log(err);
                                } else {
                                    console.log(foundSuitableSpecies);
                                    res.render("composition", {system: foundSystem, species: foundSpecies, suitablespecies: foundSuitableSpecies});
                                }
                            });
                        }
                    });
                }
            });
        }
    });
});

// SYSTEM ASSESSMENT ROUTE
router.get("/layers/:id/analysis", middleware.isLoggedIn, function(req, res){
    System.find().populate("rows.sequense").populate("flows").exec(function(err, foundSystems){
        if(err){
            console.log(err);
        } else {
            // FIND LAYER
            Layer.findById(req.params.id).populate("systems.present").exec(function(err, foundLayer){
                if(err){
                    console.log(err);
                } else {
                    System.findById(foundLayer.systems.present.id).populate("rows.sequense").exec(function(err, foundSystem){
                        if(err){
                            console.log(err);
                        } else {
                            Parcel.findById(req.user.currentProject, function(err, foundParcel) {
                                if (err) {
                                    console.log(err);
                                } else {
                                    // FIND SYSTEMS WITH SAME COMMODITY AS EXISTING SYSTEM (ONLY IF MONOCULTURE?)
                                    var systems = [];
                                    for(i=0;i<foundSystems.length;i++){
                                        if(foundSystems[i].shared === true){
                                            systems.push(foundSystems[i]);
                                        }
                                    }
                                    var systemsproven = [];
                                    for(i=0;i<systems.length;i++){
                                        if(systems[i].flows.length > 0){
                                            systemsproven.push(systems[i]);
                                        }
                                    }
                                    var systemsclimate = [];
                                    for(i=0;i<systems.length;i++){
                                        if(systems[i].rows[0].sequense[0].precipitation.min < foundParcel.climate.annualaverageprec && systems[i].rows[0].sequense[0].precipitation.max > foundParcel.climate.annualaverageprec && systems[i].rows[0].sequense[0].temperature.min < foundParcel.climate.hardiness.high && systems[i].rows[0].sequense[0].temperature.max > foundParcel.climate.hardiness.low){
                                            systemsclimate.push(systems[i]);
                                        }
                                    }
                                    console.log("Proven systems for this area: " + systemsproven.length);
                                    if(systems.length < 1){
                                        res.redirect("layers/" + foundLayer._id);
                                    } else {
                                        res.render("analysis", {layer: foundLayer, systems: systems, systemsproven: systemsproven, systemsclimate: systemsclimate});
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
    });
});

// SYSTEM OCCURRENCE NEW ROUTE
router.get("/systems/:id/occurrences/new", middleware.isLoggedIn, function(req, res){
    System.findById(req.params.id, function(err, foundSystem){
        if(err){
            console.log(err);
        } else {
            res.render("systems/occurrences", {system: foundSystem});
        }
    });
});

// SYSTEM OCCURRANCE CREATE ROUTE
router.put("/systems/:id/occurrences", middleware.isLoggedIn, function(req, res){
    System.findByIdAndUpdate(req.params.id, {$addToSet: {occurrences: req.body.occurrence}}, function(err, updatedSystem){
        if(err){
            console.log(err);
        } else {
            console.log(req.body.occurrence + " has been added to the system");
            res.redirect("/systems/" + updatedSystem._id);
        }
    });
});

module.exports = router;