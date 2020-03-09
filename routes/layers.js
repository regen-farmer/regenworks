var express = require("express");
var router = express.Router();
var Layer = require("../models/layer");
var Parcel = require("../models/parcel");
var System = require("../models/system");
var Species = require("../models/species");
var middleware = require("../middleware");
var logger = require("../middleware/logger");
var unique = require("array-unique");

// LAYER INDEX ROUTE

// NESTED PARCEL LAYER NEW ROUTE
router.get("/parcels/:id/layers/new", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL ID
    Parcel.findById(req.params.id, function(err, foundParcel){
        if(err) {
            console.log(err);
            logger.error(err.message);
            // res.flash(err
        } else {
            Species.find(function(err, foundSpecies){
                if(err){
                    console.log(err);
                } else {
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
                    res.render("layers/new", {parcel: foundParcel, species: foundSpecies});
                }
            });
        }
    });
});

// NESTED PARCEL LAYER CREATE ROUTE
router.post("/parcels/:id/layers", middleware.checkParcelOwnership, function(req, res){
    // Lookup place using id
    Parcel.findById(req.params.id, function(err, foundParcel){
        if(err) {
            console.log(err);
            res.redirect("/parcels");
        } else {
            Layer.create(req.body.layer, function (err, layer) {
                if (err) {
                    console.log(err);
                } else {
                    // Add username and ID to Layer.
                    layer.owner.id = req.user._id;
                    layer.owner.username = req.user.username;
                    // Save the layer
                    layer.save();
                    // Save JSON file to geometry
                    layer.geometry = req.body.geometry;
                    layer.size = req.body.layersize;
                    layer.lat = foundParcel.lat;
                    layer.lng = foundParcel.lng;
                    // Save the layer
                    layer.save();
                    // Connect new layer to parcel
                    foundParcel.layers.push(layer); // MOVE THIS UP TO AVOID ERRORS IF LAYER FAILS?!!!
                    foundParcel.save();
                    console.log(layer);
                    // Redirect to parcels SHOW page
                    // req.flash("success", "Successfully added comment");
                    if(layer.type == "agroforestry"){
                        res.redirect("/layers/" + layer._id + '/systems/new');
                    } else {
                        var tempspecies = req.body.maincrop;
                        if(req.body.maincrop === ""){
                            tempspecies = "5e665452cccc150b186d4cd1";
                        }
                        Species.findById(tempspecies, function(err, foundSpecies){
                            if(err){
                                console.log(err);
                            } else {
                                // DEFINE SYSTEM WITH ONE ROW AND ONE SPECIES
                                var presentsystem = {
                                    name: foundSpecies.nameCommon + " monoculture",
                                    description: "",
                                    rows: [
                                        {
                                            width: 2,
                                            sequense: []
                                        }
                                    ],
                                    shared: false
                                };
                                presentsystem.rows[0].sequense.push(foundSpecies);
                                // CREATE SYSTEM
                                System.create(presentsystem, function(err, createdSystem){
                                    if(err){
                                        console.log(err);
                                    } else {
                                        // ASS SYSTEM TO PRESENT SYSTEM
                                        layer.systems.present = createdSystem;
                                        layer.save();
                                        res.redirect("/parcels/" + foundParcel._id);
                                    }
                                });
                            }
                        });
                    }
                }
            });
        }
    });
});

// LAYER SHOW ROUTES
router.get("/layers/:id", middleware.isLoggedIn, function(req, res){ // MAKE LAYER OWNERSHIP MIDDLEWARE
    Layer.findById(req.params.id).populate("systems.future").populate("systems.present").populate("systems.past").exec(function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            System.findById(foundLayer.systems.present._id).populate("rows.sequense").exec(function(err, foundSystem){
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
                            res.render("layers/show", {layer: foundLayer, presentsystem: foundSystem, species: foundSpecies});
                        }
                    });
                }
            });
        }
    });
});

// LAYER EDIT ROUTE
router.get("/layers/:id/edit", middleware.isLoggedIn, function(req, res){ // MAKE LAYER OWNERSHIP MIDDLEWARE
    // Find specific activity in database
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            res.render("layers/edit", {layer: foundLayer});
        }
    });
});

// LAYER UPDATE ROUTE
router.put("/layers/:id", middleware.isLoggedIn, function(req, res){
    Layer.findByIdAndUpdate(req.params.id, req.body.layer, function(err, updatedLayer){
        if(err) {
            console.log(err);
        } else {
            console.log(updatedLayer);
            res.redirect("/layers/" + req.params.id);
        }
    });
});

// LAYER DELETE ROUTE
router.delete("/layers/:id", middleware.isLoggedIn, function(req, res){ // CHECK OWNERSHIP
    Layer.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/parcels");
        } else {
            res.redirect("/parcels");
        }
    });
});

// LAYER CURRENT SYSTEM UPDATE
router.post("/layers/:id/presentsystem", middleware.isLoggedIn, function(req, res){
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            System.findById(req.body.systemid, function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    // PUSH CURRENT SYSTEM TO PAST
                    if(!(foundLayer.systems.present == "")){
                        foundLayer.systems.past.push(foundLayer.systems.present);
                    }
                    // SET CURRENT SYSTEM TO FUTURE DRAFT
                    foundLayer.systems.present = foundSystem;
                    foundLayer.type = "agroforestry";
                    console.log(foundSystem.name + " has been set to current system");
                    // REMOVE FUTURE DRAFT FROM FUTURE ARRAY
                    foundLayer.systems.future.remove(foundSystem);
                    console.log(foundSystem.name + " has been removed from future systems");
                    foundLayer.save();
                    res.redirect("/layers/" + foundLayer._id);
                }
            });
        }
    });
});

// LAYER ADD FUTURE SYSTEM DRAFT
router.post("/layers/:id/editfuture", middleware.isLoggedIn, function(req, res){
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            System.findById(req.body.systemid, function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    foundLayer.systems.future.push(foundSystem);
                    foundLayer.save();
                    console.log("Now there is " + foundLayer.systems.future.length + " future drafts on this area");
                    res.redirect("/layers/" + foundLayer._id);
                }
            });
        }
    });
});

module.exports = router;