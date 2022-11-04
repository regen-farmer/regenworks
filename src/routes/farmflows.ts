var express = require("express");
var router = express.Router();
var Farmflow = require("../models/farmflow");
var Parcel = require("../models/parcel");
var Layer = require("../models/layer");
var Row = require("../models/row");
var Area = require("../models/area");
var middleware = require("../middleware");
var Species = require("../models/species");
var unique = require("array-unique");
var turfLength = require("@turf/length");

function compare1( a, b ) {
    if ( a.position[1] < b.position[1] ){
        return -1;
    }
    if ( a.position[1] > b.position[1] ){
        return 1;
    }
    return 0;
}
// PARCEL FARMFLOWS
router.get("/parcels/:id/farmflows", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate({path:'layers', populate:{path:'rows', populate:{path:'farmflows'}}}).populate({path:'layers', populate:{path:'areas', populate:{path:'farmflows'}}}).exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            // RENDER ACTIVITIES
            res.render("farmflows/index", {parcel: foundParcel})
        }
    });
});

// --------------- NESTED ROUTES ROW BASED ---------------- //

router.get("/parcels/:id/layers/:pid/rows/:rid/farmflows/new", middleware.isLoggedIn, function(req, res){
    // FIND ROW SEQUENCE SPECIES
    Row.findById(req.params.rid).populate({path:'sequence', populate:{path:'model.species'}}).exec(function(err, foundRow){
        if(err){
            console.log(err);
        } else {
            // FIND ALL SPECIES
            if(foundRow.sequence){
                console.log("species there");
                var allSpecies:any[] = [];
                foundRow.sequence.model.forEach(function(species){
                    allSpecies.push(species.species);
                });
                // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                var uniqueSpecies = unique(allSpecies);
                console.log(uniqueSpecies);
                res.render("farmflows/rownew", {parcelid: req.params.id, layerid: req.params.pid, rowid: req.params.rid, row: foundRow, species: uniqueSpecies})

            } else {
                res.redirect("back");
            }
        }
    });
});

// CREATE FARMFLOW ON ROW
router.post("/parcels/:id/layers/:pid/rows/:rid/farmflows", middleware.isLoggedIn, function(req, res){
    // FIND SPECIES
    Species.findById(req.body.species, function(err, foundSpecies){
        if(err){
            console.log(err);
        } else {
            // CREATE ACTIVITY
            var newFarmFlow = req.body.farmflow;
            newFarmFlow.species = foundSpecies;
            Farmflow.create(newFarmFlow, function(err, createdFarmflow){
                if(err){
                    console.log(err);
                } else {
                    Row.findByIdAndUpdate(req.params.rid, { $push: { farmflows : createdFarmflow } }, function(err, updatedRow){
                        if(err){
                            console.log(err);
                        } else {
                            res.redirect("/parcels/" + req.params.id + "/farmflows")
                        }
                    });
                }
            });
        }
    });
});

// --------------- NESTED ROUTES AREA BASED ---------------- //

router.get("/parcels/:id/layers/:pid/areas/:rid/farmflows/new", middleware.isLoggedIn, function(req, res){
    // FIND AREA ROTATION SPECIES
    Area.findById(req.params.rid).populate({path:'rotation', populate:{path:'model.speciesmix.species'}}).exec(function(err, foundArea){
        if(err){
            console.log(err);
        } else {
            // FIND ALL SPECIES
            if(foundArea.rotation){
                console.log("species there");
                var allSpecies:any[] = [];
                foundArea.rotation.model.forEach(function(speciesmix){
                    allSpecies.push(speciesmix.speciesmix[0].species);
                });
                // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                var uniqueSpecies = unique(allSpecies);
                console.log(uniqueSpecies);
                res.render("farmflows/areanew", {parcelid: req.params.id, layerid: req.params.pid, areaid: req.params.rid, area: foundArea, species: uniqueSpecies})

            } else {
                res.redirect("back");
            }
        }
    });
});

// CREATE FARMFLOW ON AREA
router.post("/parcels/:id/layers/:pid/areas/:rid/farmflows", middleware.isLoggedIn, function(req, res){
    // FIND SPECIES
    Species.findById(req.body.species, function(err, foundSpecies){
        if(err){
            console.log(err);
        } else {
            // CREATE ACTIVITY
            var newFarmFlow = req.body.farmflow;
            newFarmFlow.species = foundSpecies;
            Farmflow.create(newFarmFlow, function(err, createdFarmflow){
                if(err){
                    console.log(err);
                } else {
                    Area.findByIdAndUpdate(req.params.rid, { $push: { farmflows : createdFarmflow } }, function(err, updatedArea){
                        if(err){
                            console.log(err);
                        } else {
                            res.redirect("/parcels/" + req.params.id + "/farmflows")
                        }
                    });
                }
            });
        }
    });
});

// VIZ YIELDS
router.get("/parcels/:id/layers/:pid/farmflows/viz", middleware.isLoggedIn, function(req, res){
    // CREATE ACTIVITY
    Layer.findById(req.params.pid).populate({path:"rows", populate:{path:'farmflows'}}).populate({path:"rows", populate:{path:'sequence'}}).exec(function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            // CREATE ROW ASSETS AND SORT ACCORDING TO YIELDS
            var max = 0;
            var min = 100000;
            for(let i=0;i<foundLayer.rows.length;i++){
                for(let j=0;j<foundLayer.rows[i].farmflows.length;j++){
                    if(foundLayer.rows[i].farmflows[j].amount > max){
                        max = foundLayer.rows[i].farmflows[j].amount;
                    }
                    if(foundLayer.rows[i].farmflows[j].amount < min){
                        min = foundLayer.rows[i].farmflows[j].amount;
                    }
                }
            }
            var rowArrayLow:any[] = [];
            var rowArrayMed:any[] = [];
            var rowArrayHigh:any[] = [];
            // CREATE MARKERS
            var treeAssetsArray:any[] = [];
            for(let i=0;i<foundLayer.rows.length;i++){
                // SET ROW DATA
                if(foundLayer.rows[i].sequence) {
                    var datasetRows = foundLayer.rows[i].sequence.model;
                    /*foundLayer.rows[i].sequence.model.forEach(function (species) {
                        var count = 0;
                        for (j = 0; j < datasetRows.length; j++) {
                            if (datasetRows[j].row === species.position[0]) {
                                datasetRows[j].array.push(species);
                                count = count + 1;
                            }
                        }
                        if (count === 0) {
                            datasetRows.push({row: species.position[0], array: [species]});
                        }
                    });*/
                    // SORT ROW ITEMS
                    datasetRows.sort(compare1);
                    // ROW LENGTH
                    var rowLine = JSON.parse(foundLayer.rows[i].geometry);
                    var rowLength = turfLength(rowLine, {units: "meters"});
                    console.log("Row length " + rowLength);
                    // SYSTEM MODEL LENGTH
                    var systemModelLength = foundLayer.rows[i].sequence.sequencelength;
                    /*if (datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1] <= 1) {
                        systemModelLength = datasetRows[1].array[(datasetRows[1].array.length - 1)].position[1];
                    } else {
                        systemModelLength = datasetRows[0].array[(datasetRows[0].array.length - 1)].position[1];
                    }*/
                    console.log("System model length:" + systemModelLength);
                    // FIND MODEL COUNT AND REST
                    var systemModelCount = Math.floor(rowLength / systemModelLength);
                    var systemModelRowRest = ((rowLength / systemModelLength) - Math.floor(rowLength / systemModelLength)) * systemModelLength;
                    // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
                    var firstTreeMarker = turf.point(rowLine.geometry.coordinates[0]);
/*
                    treeMarkerArray.push(firstTreeMarker);
*/
                    var firstAsset = {
                        marker: firstTreeMarker,
                        species: datasetRows[(datasetRows.length - 1)].species
                    };
                    treeAssetsArray.push(firstAsset);
                    // ROW MARKERS
                    // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
                    for (let j = 0; j < systemModelCount; j++) {
                        for (let k = 0; k < datasetRows.length; k++) {
                            // CREATE COORDINATES FOR THE TREE
                            var treeMarker = along(rowLine, (j * systemModelLength + datasetRows[k].position), {units: "meters"});
                            // CREATE ASSET OBJECT
                            /*var asset = {
                                species: treeRows[treeRowCount].array[k].species.id,
                                lat: treeMarker.geometry.coordinates[0],
                                lng: treeMarker.geometry.coordinates[1],
                                name: treeRows[treeRowCount].array[k].species.nameCommon
                            };*/
                            //
                            var asset = {
                                marker: treeMarker,
                                species: datasetRows[k].species
                            };
                            // ADD TREE OBJECT TO ARRAY
/*
                            treeMarkerArray.push(treeMarker);
*/
                            treeAssetsArray.push(asset);
                        }
                    }
                    // ADD REST
                    for (let j = 0; j < datasetRows.length; j++) {
                        if (datasetRows[j].position < systemModelRowRest) {
                            /*
                                                                    treeArray.push(treeRows[treeRowCount].array[j].species);
                            */
                            // ADD POINT MARKER FOR REMAINING TREES
                            var treeMarker2 = along(rowLine, (systemModelCount * systemModelLength + datasetRows[j].position), {units: "meters"});
                            var asset2 = {
                                marker: treeMarker2,
                                species: datasetRows[j].species
                            };
/*
                            treeMarkerArray.push(treeMarker2);
*/
                            treeAssetsArray.push(asset2);
                        }
                    }
                }
            }
            console.log("max: " + max);
            console.log("min: " + min);
            res.redirect("/parcels/" + req.params.id + "/farmflows");
/*
            res.render("farmflows/viz");
*/
        }
    });
});

module.exports = router;