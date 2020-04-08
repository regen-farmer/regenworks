var express = require("express");
var router = express.Router();
var unique = require("array-unique");
var System = require("../models/system");
var Layer = require("../models/layer");
var Species = require("../models/species");
var Parcel = require("../models/parcel");
var Animal = require("../models/animal");
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
                    // FIND ALL ANIMALS AND SORT
                    Animal.find(function(err, foundAnimals){
                        if(err){
                            console.log(err);
                        } else {
                            // SORT ANIMALS
                            function compare1( a, b ) {
                                if ( a.name < b.name ){
                                    return -1;
                                }
                                if ( a.name > b.name ){
                                    return 1;
                                }
                                return 0;
                            }
                            foundAnimals.sort(compare1);
                            // RENDER NEW SYSTEM PAGE WITH SPECIES
                            res.render("systems/new", {layer: foundLayer, species: foundSpecies, animals: foundAnimals});
                        }
                    });
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
            // REMOVE ANIMAL ITEMS IF NONE
            for(var i = system.animals.length - 1; i >= 0; i--){
                if(system.animals[i] === ""){
                    system.animals.splice(i, 1);
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
    System.findById(req.params.id).populate("rows.sequense").populate("animals").exec(function(err, foundSystem){
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
    System.find().populate("rows.sequense").populate("flows").populate("animals").exec(function(err, foundSystems){
        if(err){
            console.log(err);
        } else {
            // FIND LAYER
            Layer.findById(req.params.id).populate("systems.present").exec(function(err, foundLayer){
                if(err){
                    console.log(err);
                } else {
                    System.findById(foundLayer.systems.present.id).populate("rows.sequense").populate("animals").exec(function(err, foundSystem){
                        if(err){
                            console.log(err);
                        } else {
                            Parcel.findById(req.user.currentProject, function(err, foundParcel) {
                                if (err) {
                                    console.log(err);
                                } else {
                                    // FIND SYSTEMS WITH SAME COMMODITY AS EXISTING SYSTEM (ONLY IF MONOCULTURE?)
                                    var commodity = "";
                                    var commodityName = "";
                                    foundSystem.rows.forEach(function(row){
                                        if(row.sequense[0].nameCommon === "Arabian coffee"){
                                            commodity = row.sequense[0].id;
                                            commodityName = row.sequense[0].nameCommon;
                                        }
                                    });
                                    // CHECK IF SYSTEM HAS ANIMALS
                                    var animals = "";
                                    if(foundSystem.animals.length > 0){
                                        animals = foundSystem.animals[0];
                                    }
                                    var systems = [];
                                    for(i=0;i<foundSystems.length;i++){
                                        if(foundSystems[i].shared === true){
                                            systems.push(foundSystems[i]);
                                        }
                                    }
                                    var commoditysystems = [];
                                    for(i=0;i<systems.length;i++){
                                        for(j=0;j<systems[i].rows.length;j++){
                                            if(commodity === systems[i].rows[j].sequense[0].id && !(commoditysystems.includes(systems[i]))) {
                                                console.log(systems[i].name);
                                                commoditysystems.push(systems[i]);
                                            }
                                        }
                                    }
                                    console.log("Commodity systems: " + commoditysystems.length);
                                    var systemsclimate = [];
                                    for(i=0;i<systems.length;i++){
                                        var count = 0;
                                        for(j=0;j<systems[i].rows.length;j++){
                                            if(systems[i].rows[j].sequense[0].precipitation.min < foundParcel.climate.annualaverageprec && systems[i].rows[j].sequense[0].precipitation.max > foundParcel.climate.annualaverageprec && systems[i].rows[j].sequense[0].temperature.min < foundParcel.climate.hardiness.high && systems[i].rows[j].sequense[0].temperature.max > foundParcel.climate.hardiness.low){
                                                count = count + 1;
                                            }
                                        }
                                        if(count === systems[i].rows.length){
                                            systemsclimate.push(systems[i]);
                                        }
                                    }
                                    var animalsystems = [];
                                    for(i=0;i<systemsclimate.length;i++){
                                        if(systemsclimate[i].animals.length > 0){
                                            if(systemsclimate[i].animals[0].equals(animals)) {
                                                animalsystems.push(systemsclimate[i]);
                                            }
                                        }
                                    }
                                    console.log("Animal systems: " + animalsystems.length);
                                    var systemsproven = [];
                                    for(i=0;i<systemsclimate.length;i++){
                                        if(systemsclimate[i].flows.length > 0){
                                            systemsproven.push(systemsclimate[i]);
                                        }
                                    }
                                    console.log("Proven systems for this area: " + systemsproven.length);
                                    if(systems.length < 1){
                                        res.redirect("layers/" + foundLayer._id);
                                    } else {
                                        res.render("analysis", {layer: foundLayer, systems: systems, systemsproven: systemsproven, systemsclimate: systemsclimate, commoditysystems: commoditysystems, commodity: commodityName, animalsystems: animalsystems});
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