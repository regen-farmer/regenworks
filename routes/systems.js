var express = require("express");
var router = express.Router();
var unique = require("array-unique");
var System = require("../models/system");
var Layer = require("../models/layer");
var Species = require("../models/species");
var Parcel = require("../models/parcel");
var Animal = require("../models/animal");
var Project = require("../models/project");
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

// LAYER FUTURE SYSTEMS COMPARE ROUTE
router.get("/layers/:id/systems/compare", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id).populate("systems.future").exec(function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            // FIND FUTURE SYSTEM TO POPULATE ROWS ETC
            System.find({"_id": foundLayer.systems.future}).populate("flows").populate("rows.sequense").exec(function(err, foundSystems){
                if(err){
                    console.log(err);
                } else {
                    for(i=0;i<foundSystems.length;i++){
                        // FIND ALL SPECIES IN SYSTEM
                        var allSpecies = [];
                        var allUtilities = [];
                        var grid = 0;
                        foundSystems[i].rows.forEach(function(row){
                            row.sequense.forEach(function(species){
                                allSpecies.push(species.nameCommon);
                                if(species.utilities.length > 0){
                                    for(j=0;j<species.utilities.length;j++){
                                        allUtilities.push(species.utilities[j]);
                                    }
                                }
                            });
                            grid = grid + row.width;
                        });
                        // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                        var uniqueSpecies = unique(allSpecies);
                        foundSystems[i].uniqueSpecies = uniqueSpecies;
                        var uniqueUtilities = unique(allUtilities);
                        foundSystems[i].uniqueUtilities = uniqueUtilities;
                        foundSystems[i].grid = grid;
                    }
                    res.render("systems/compare", {layer: foundLayer, systems: foundSystems});
                }
            });
        }
    });
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
router.get("/systems/:id/edit", middleware.isLoggedIn, function(req, res){
    System.findById(req.params.id).populate("rows.sequense").populate("animals").exec(function(err, foundSystem){
        if(err){
            console.log(err);
        } else {
            Species.find(function(err, foundSpecies){
                if(err){
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
                            // SORT SPECIES
                            function compare1( a, b ) {
                                if ( a.nameCommon < b.nameCommon ){
                                    return -1;
                                }
                                if ( a.nameCommon > b.nameCommon ){
                                    return 1;
                                }
                                return 0;
                            }
                            foundAnimals.sort(compare1);
                            res.render("systems/edit", {system: foundSystem, species: foundSpecies, animals: foundAnimals});
                        }
                    })
                }
            })
        }
    });
});

// SYSTEM EDIT W. SPECIES ROUTE
router.get("/systems/:id/edit/:speciesid", middleware.isLoggedIn, function(req, res){
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
            // PUSH NEW SPECIES TO LIST
            allSpecies.push(req.params.speciesid);
            // FIND UNIQUE SPECIES / REMOVE DUPLICATES
            var uniqueSpecies = unique(allSpecies);
            // FIND ALL SPECIES IN SYSTEM
            Species.find({"_id": uniqueSpecies}, function(err, foundSpecies){
                if(err){
                    console.log(err);
                } else {
                    res.render("systems/edit", {system: foundSystem, species: foundSpecies});
                }
            });
        }
    });
});

// SYSTEM UPDATE ROUTE
router.put("/systems/:id", middleware.isLoggedIn, function(req, res){ // NEED TO CHECK OWNERSHIP HERE!!! YES
    System.findById(req.params.id, function(err, foundSystem){
        // CLEAN SYSTEM - MAKE MIDDLEWARE FOR THIS
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
        // does user own the system?
        if(foundSystem.owner.id.equals(req.user._id)){
            // if true, update existing system
            System.findByIdAndUpdate(req.params.id, system, function(err, updatedSystem){
                if(err){
                    console.log(err);
                } else {
                    res.redirect("/systems/" + updatedSystem._id);
                }
            });
        } else {
            // if false, create a new system and add current user as owner
            System.create(system, function(err, createdSystem){
                if(err){
                    console.log(err);
                } else {
                    // Add owner
                    createdSystem.owner.id = req.user._id;
                    createdSystem.owner.username = req.user.username;
                    createdSystem.save();
                    // REPLACE IN PRESENT
                    Layer.find({"owner.id": req.user._id, "systems.present": foundSystem._id}, function(err, foundLayersPresent){
                        if(err){
                            console.log(err);
                        } else {
                            console.log(foundLayersPresent.length + " present found");
                            if(foundLayersPresent.length > 0){
                                foundLayersPresent.forEach(function(layer){
                                    // REPLACE SYSTEM
                                    layer.systems.present = createdSystem;
                                    // NO NEED TO PUSH TO PAST IN THIS CASE
                                    layer.save();
                                });
                            }
                        }
                    }); // IMPORTANT TO CHECK FOR USER!!! LIKE CHECKING OWNERSHIP
                    // REPLACE IN FUTURE DRAFT
                    Layer.find({"owner.id": req.user._id, "systems.future": foundSystem._id}, function(err, foundLayersFuture){
                        if(err){
                            console.log(err);
                        } else {
                            console.log(foundLayersFuture.length + " future drafts found");
                            if(foundLayersFuture.length > 0){
                                foundLayersFuture.forEach(function(layer){
                                    // REMOVE ORIGINAL SYSTEM
                                    layer.systems.future.remove(foundSystem);
                                    // ADD NEW SYSTEM
                                    layer.systems.future.push(createdSystem);
                                    layer.save();
                                });
                            }
                        }
                    });
                    // REPLACE IN PROJECT
                    Project.find({"owner.id": req.user._id, "system": foundSystem._id}, function(err, foundProjects){
                        if(err){
                            console.log(err);
                        } else {
                            console.log(foundProjects.length + " projects found");
                            if(foundProjects.length > 0){
                                foundProjects.forEach(function(project){
                                    // REPLACE SYSTEM
                                    project.system = createdSystem;
                                    project.save();
                                });
                            }
                        }
                    });
                    // Redirect to system page
                    res.redirect("/systems/" + createdSystem._id);
                }
            });
        }
    });
});

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
                                        if(row.sequense[0].nameCommon === "Arabian coffee" || row.sequense[0].nameCommon === "Cacao" || row.sequense[0].nameCommon === "Cashew"){
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
                                            // FIND ALL SPECIES IN SYSTEM
                                            var allSpecies = [];
                                            var allUtilities = [];
                                            var grid = 0;
                                            foundSystems[i].rows.forEach(function(row){
                                                row.sequense.forEach(function(species){
                                                    allSpecies.push(species.nameCommon);
                                                    if(species.utilities.length > 0){
                                                        for(j=0;j<species.utilities.length;j++){
                                                            allUtilities.push(species.utilities[j]);
                                                        }
                                                    }
                                                });
                                                grid = grid + row.width;
                                            });
                                            // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                                            var uniqueSpecies = unique(allSpecies);
                                            foundSystems[i].uniqueSpecies = uniqueSpecies;
                                            var uniqueUtilities = unique(allUtilities);
                                            foundSystems[i].uniqueUtilities = uniqueUtilities;
                                            // SAVE GRID
                                            foundSystems[i].grid = grid;
                                            systems.push(foundSystems[i]);
                                        }
                                    }
                                    // COMMODITY SYSTEMS
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