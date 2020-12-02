var express = require("express");
var router = express.Router();
var Layer = require("../models/layer");
var Parcel = require("../models/parcel");
var System = require("../models/system");
var Species = require("../models/species");
var Animal = require("../models/animal");
var Sequence = require("../models/sequence");
var middleware = require("../middleware");
var logger = require("../middleware/logger");
var unique = require("array-unique");
var centroid = require("@turf/centroid");
var bbox = require("@turf/bbox");
var bboxPolygon = require("@turf/bbox-polygon");
var turf = require("@turf/helpers");
var lineOffset = require("@turf/line-offset");
var lineIntersect = require("@turf/line-intersect");
var length = require("@turf/length");
var buffer = require("@turf/buffer");
var area = require("@turf/area");
var along = require("@turf/along");
var circle = require("@turf/circle");
// SETUP MULTER
var multer = require("multer");
var storage = multer.memoryStorage();
var uploadMem = multer({storage: storage});
// XML2JS
var xml2js = require('xml2js');
var parser = new xml2js.Parser();

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
                    Animal.find(function(err, foundAnimals){
                        if(err){
                            console.log(err);
                        } else {
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
                            res.render("layers/new", {parcel: foundParcel, species: foundSpecies, animals: foundAnimals});
                        }
                    });
                }
            });
        }
    });
});

// NESTED PARCEL LAYER NEW WITH UPLOAD ROUTE
router.get("/parcels/:id/layers/newkml", middleware.isLoggedIn, function(req, res){
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
                    Animal.find(function(err, foundAnimals){
                        if(err){
                            console.log(err);
                        } else {
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
                            res.render("layers/newkml", {parcel: foundParcel, species: foundSpecies, animals: foundAnimals});
                        }
                    });
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
            res.redirect('/users/' + req.user.id);
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
                    var geometrycentroid = centroid(JSON.parse(req.body.geometry));
                    console.log(geometrycentroid.geometry.coordinates[0]);
                    layer.lat = geometrycentroid.geometry.coordinates[1];
                    layer.lng = geometrycentroid.geometry.coordinates[0];
                    // Save the layer
                    layer.save();
                    // Connect new layer to parcel
                    foundParcel.layers.push(layer); // MOVE THIS UP TO AVOID ERRORS IF LAYER FAILS?!!!
                    foundParcel.save();
                    console.log(layer);
                    // Redirect to parcels SHOW page
                    // req.flash("success", "Successfully added comment");
                    if(layer.type == "agroforestry"){
                        res.redirect("/layers/" + layer._id + '/systems/newgrid');
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
                                    model: [
                                        {
                                            species: foundSpecies._id,
                                            width: 2,
                                            position: [1,1]
                                        }
                                    ],
                                    shared: false,
                                    owner: {
                                        id: req.user._id,
                                        username: req.user.username
                                    },
                                    animals: []
                                };
                                // FIND ANIMAL AND PUSH TO SYSTEM
                                if(!(req.body.animal === "")){
                                    Animal.findById(req.body.animal, function(err, foundAnimal){
                                        if(err){
                                            console.log(err);
                                        } else {
                                            presentsystem.animals.push(foundAnimal);
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
                                } else {
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
                            }
                        });
                    }
                }
            });
        }
    });
});

// NESTED PARCEL LAYER CREATE WITH UPLOAD ROUTE
router.post("/parcels/:id/layersuploadkml", middleware.checkParcelOwnership, uploadMem.single("filename"), function(req, res){
    // PARSE UPLOADED FILE AND CREATE POLYGON
    parser.parseString(req.file.buffer, function(err, result){
        if(err){
            req.flash("error", err.message);
            // console.log(err);
            res.redirect("back");
        } else {
            var string = result.kml.Document[0].Placemark[0].Polygon[0].outerBoundaryIs[0].LinearRing[0].coordinates[0];
            var splitString = string.split(" ");
            // CREATE NEW ARRAY HERE? OR IS THIS OBSOLETE?
            var array = [];
            for(i=0;i<splitString.length;i++){
                var apples = JSON.parse("[" + splitString[i] + "]");
                array.push(apples);
            }
            // CHECK IF LAST ARRAY IS EMPTY?
            if(array[array.length - 1].length === 0){
                console.log("last is empty array");
                array.pop();
            }
            // THEN ADD HERE?!
            var polygon = turf.polygon([array]);
            var size = area(polygon);
            var geometry = JSON.stringify(polygon);
            // FIND PARCEL
            Parcel.findById(req.params.id, function(err, foundParcel){
                if(err){
                    console.log(err);
                } else {
                    Layer.create(req.body.layer, function(err, createdLayer){
                        if(err){
                            console.log(err);
                        } else {
                            createdLayer.owner.id = req.user._id;
                            createdLayer.owner.username = req.user.username;
                            createdLayer.geometry = geometry;
                            // CALCULATE LAYER SIZE
                            createdLayer.size = size;
                            // GEOMETRY CENTROID FOR LAT AND LNG
                            var geometrycentroid = centroid(polygon.geometry);
                            createdLayer.lat = geometrycentroid.geometry.coordinates[1];
                            createdLayer.lng = geometrycentroid.geometry.coordinates[0];
                            // Save the layer
                            createdLayer.save();
                            // PUSH LAYER TO PARCEL
                            foundParcel.layers.push(createdLayer);
                            foundParcel.save();
                            // DEFINE SYSTEM
                            if(createdLayer.type == "agroforestry"){
                                res.redirect("/layers/" + createdLayer._id + '/systems/new');
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
                                            model: [
                                                {
                                                    species: foundSpecies._id,
                                                    width: 2,
                                                    position: [1,1]
                                                }
                                            ],
                                            shared: false,
                                            owner: {
                                                id: req.user._id,
                                                username: req.user.username
                                            },
                                            animals: []
                                        };
                                        // FIND ANIMAL AND PUSH TO SYSTEM
                                        if(!(req.body.animal === "")){
                                            Animal.findById(req.body.animal, function(err, foundAnimal){
                                                if(err){
                                                    console.log(err);
                                                } else {
                                                    presentsystem.animals.push(foundAnimal);
                                                    // CREATE SYSTEM
                                                    System.create(presentsystem, function(err, createdSystem){
                                                        if(err){
                                                            console.log(err);
                                                        } else {
                                                            // ADD SYSTEM TO PRESENT SYSTEM
                                                            createdLayer.systems.present = createdSystem;
                                                            createdLayer.save();
                                                            res.redirect("/parcels/" + foundParcel._id);
                                                        }
                                                    });
                                                }
                                            });
                                        } else {
                                            // CREATE SYSTEM
                                            System.create(presentsystem, function(err, createdSystem){
                                                if(err){
                                                    console.log(err);
                                                } else {
                                                    // ADD SYSTEM TO PRESENT SYSTEM
                                                    createdLayer.systems.present = createdSystem;
                                                    createdLayer.save();
                                                    res.redirect("/parcels/" + foundParcel._id);
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                        }
                    });
                }
            });
        }
    });
});

// LAYER SHOW ROUTES
router.get("/layers/:id", middleware.isLoggedIn, function(req, res){ // MAKE LAYER OWNERSHIP MIDDLEWARE
    Layer.findById(req.params.id).populate("systems.future").populate("projects").populate("systems.present").populate("systems.past").exec(function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            if(foundLayer.systems.present === undefined){
                res.redirect("/layers/" + foundLayer._id + '/systems/newgrid')
            } else {
                System.findById(foundLayer.systems.present._id).populate("model.species").populate("animals").exec(function(err, foundSystem){
                    if(err){
                        console.log(err);
                    } else {
                        // FIND ALL SPECIES IN SYSTEM
                        var allSpecies = [];
                        var dataset = [];
                        foundSystem.model.forEach(function(species){
                            allSpecies.push(species.species);
                            var count = 0;
                            for(i=0;i<dataset.length;i++){
                                if(dataset[i].row === species.position[0]){
                                    dataset[i].array.push(species);
                                    count = count + 1;
                                }
                            }
                            if(count === 0){
                                dataset.push({row: species.position[0], array: [species]});
                            }
                        });
                        // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                        var uniqueSpecies = unique(allSpecies);
                        // SORT FIRST ROW ITEMS
                        function compare1( a, b ) {
                            if ( a.position[1] < b.position[1] ){
                                return -1;
                            }
                            if ( a.position[1] > b.position[1] ){
                                return 1;
                            }
                            return 0;
                        }
                        for(i=0;i<dataset.length;i++){
                            dataset[i].array.sort(compare1);
                            console.log(dataset[i].array[0]);
                        }
                        // FIND SPECIES AND POPULATE FLOWS
                        Species.find({"_id": uniqueSpecies}).populate("flows").exec(function(err, foundSpecies){
                            if(err) {
                                console.log(err);
                            } else {
                                res.render("layers/show", {layer: foundLayer, presentsystem: foundSystem, species: foundSpecies, rows: dataset});
                            }
                        });
                    }
                });
            }
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
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
            res.redirect('/users/' + req.user.id);
        } else {
            // REMOVE LAYER FROM PARCEL
            Parcel.find({"owner.id": req.user._id}, function(err, foundParcels){
                if(err){
                    console.log(err);
                    res.redirect('/users/' + req.user.id);
                } else {
                    // CYCLE THROUGH PARCELS
                    var parcelRef = {};
                    for(i=0;i<foundParcels.length;i++){
                        // CYCLE THROUGH LAYERS
                        for(j=0;j<foundParcels[i].layers.length;j++){
                            if(foundParcels[i].layers[j].equals(foundLayer._id)){
                                foundParcels[i].layers.remove(foundLayer);
                                console.log("Layer removed");
                                foundParcels[i].save();
                                parcelRef = foundParcels[i]._id;
                            }
                        }
                    }
                    // REMOVE LAYER FROM PARCEL HERE WHEN IT IS FOUND?!
                    res.redirect("/parcels/" + parcelRef);
                    // DELETE LAYER TEMP REMOVED
                    /*Layer.findByIdAndRemove(req.params.id, function(err){
                        if(err){
                            console.log(err);
                            res.redirect("/parcels");
                        } else {
                            res.redirect("/parcels");
                        }
                    });*/
                }
            });
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

// LAYER CURRENT SYSTEM LAYOUT
router.get("/layers/:id/layout", middleware.isLoggedIn, function(req, res){ // MAKE LAYER OWNERSHIP MIDDLEWARE
    Layer.findById(req.params.id).populate("systems.present").populate("assets").populate({path:'rows.sequence', populate:{path:'model.species'}}).exec(function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            System.findById(foundLayer.systems.present._id).populate("model.species").populate("animals").exec(function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    // FIND ALL SPECIES IN SYSTEM
                    var allSpecies = [];
                    foundSystem.model.forEach(function(species){
                        allSpecies.push(species.species.id);
                    });
                    //

                    // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                    var uniqueSpecies = unique(allSpecies);
                    // FIND SPECIES AND POPULATE FLOWS
                    Species.find({"_id": uniqueSpecies}).populate("flows").exec(function(err, foundSpecies){
                        if(err) {
                            console.log(err);
                        } else {
                            var polygon = JSON.parse(foundLayer.geometry);
                            // FIND SYSTEM ROWS
                            var dataset = [];
                            foundSystem.model.forEach(function(species){
                                var count = 0;
                                for(i=0;i<dataset.length;i++){
                                    if(dataset[i].row === species.position[0]){
                                        dataset[i].array.push(species);
                                        count = count + 1;
                                    }
                                }
                                if(count === 0){
                                    dataset.push({row: species.position[0], array: [species]});
                                }
                            });
                            // SORT FIRST ROW ITEMS
                            function compare1( a, b ) {
                                if ( a.position < b.position ){
                                    return -1;
                                }
                                if ( a.position > b.position ){
                                    return 1;
                                }
                                return 0;
                            }
                            /*for(i=0;i<dataset.length;i++){
                                dataset[i].array.sort(compare1);
                            }*/
                            // VIZ ROWS
                            var rowArray = [];
                            var placesArray = [];
                            for(i=0;i<foundLayer.rows.length;i++){
                                // ROW VIZ
                                var rowGeometry = JSON.parse(foundLayer.rows[i].geometry);
                                rowArray.push(rowGeometry);
                                // PLACES
                                var properties = {
                                    'description': foundLayer.rows[i].name
                                };
                                var place = turf.point(rowGeometry.geometry.coordinates[1], properties);
                                placesArray.push(place);
                            }
                            // ROW LABELS (BEFORE ROWS ARE PARSED)
                            var placesCollection = turf.featureCollection(placesArray);
                            var places = JSON.stringify(placesCollection);
                            // CREATE PLACES FEATURE
                            var featurecollection = turf.featureCollection(rowArray);
                            var collection = JSON.stringify(featurecollection);
                            // COUNT ASSETS IN ROW SYSTEMS - ONLY TAKE FIRST ROW?!
                            /*for(i=0;i<foundLayer.rows.length;i++){
                                for(j=0;j<foundLayer.rows[i].system.model.length;j++){
                                    foundLayer.rows[i].system.populate("model." + j + ".species");
                                }
                            }*/
                            var treeAssetsArray = [];
                            // SET COLLECTIVE TREE ARRAY
                            var treeMarkerArray = [];
                            var treeAssetArray = [];
                            // FIND SYSTEM ROWS
                            for(i=0;i<foundLayer.rows.length;i++){
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
                                    var rowLength = length(rowLine, {units: "meters"});
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
                                    treeMarkerArray.push(firstTreeMarker);
                                    var firstAsset = {
                                        marker: firstTreeMarker,
                                        species: datasetRows[(datasetRows.length - 1)].species
                                    };
                                    treeAssetsArray.push(firstAsset);
                                    // ROW MARKERS
                                    // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
                                    for (j = 0; j < systemModelCount; j++) {
                                        for (k = 0; k < datasetRows.length; k++) {
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
                                            treeMarkerArray.push(treeMarker);
                                            treeAssetsArray.push(asset);
                                        }
                                    }
                                    // ADD REST
                                    for (j = 0; j < datasetRows.length; j++) {
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
                                            treeMarkerArray.push(treeMarker2);
                                            treeAssetsArray.push(asset2);
                                        }
                                    }
                                }
                            }
                            // DO POINT COLLECTION
                            var treeCanopyArray = [];
                            var vegeCanopyArray = [];
                            if(treeAssetsArray.length < 3000){
                                for(i=0;i<treeAssetsArray.length;i++){
                                    // FIND TREE DIMENSIONS
                                    var diameter = 0.4;
                                    if(treeAssetsArray[i].species.form === "shrub"){
                                        diameter = 0.2;
                                    } else if (treeAssetsArray[i].species.form === "herb"){
                                        diameter = 0.1;
                                    }
                                    var circle1 = circle(treeAssetsArray[i].marker.geometry.coordinates, diameter, {units: "meters"});
                                    if(treeAssetsArray[i].species.height > 15){
                                        treeCanopyArray.push(circle1);
                                    } else {
                                        vegeCanopyArray.push(circle1);
                                    }

                                }
                            }
                            var treeMarkers = turf.featureCollection(treeCanopyArray);
                            var treeCollection = JSON.stringify(treeMarkers);
                            // INSERT SYSTEM CLASSIFICATION
                            var vegeMarkers = turf.featureCollection(vegeCanopyArray);
                            var vegeCollection = JSON.stringify(vegeMarkers);
                            // DO TREE NAMES COLLECTION
                            var treenames = [];
                            for(i=0;i<treeAssetsArray.length;i++){
                                var properties1 = {
                                    'description': treeAssetsArray[i].species.nameCommon.slice(0,3)
                                };
                                var treename = turf.point(treeAssetsArray[i].marker.geometry.coordinates, properties1);
                                treenames.push(treename);
                            }
                            var treenamemarks = turf.featureCollection(treenames);
                            var treeNameCollection = JSON.stringify(treenamemarks);
                            // COUNT ASSETS


                            // COMBINE ASSETS AND ROW BASED



                            res.render("layers/layout", {layer: foundLayer, presentsystem: foundSystem, species: foundSpecies, collection: collection, places: places, trees: treeCollection, treenames: treeNameCollection, vegetables: vegeCollection});
                        }
                    });
                }
            });
        }
    });
});

// ROW NEW ROUTE
router.get("/layers/:id/row/new", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            // FIND MY SYSTEMS
            Sequence.find({'owner.id': req.user._id}, function(err, foundSequences){
                if(err){
                    console.log(err);
                } else {
                    res.render("layers/row", {layer: foundLayer, sequences: foundSequences});
                }
            });
        }
    });
});

// ROW CREATE ROUTE
router.post("/layers/:id/row", middleware.isLoggedIn, function(req, res){
    // CREATE ROW HERE?
    var row = {
        geometry: req.body.geometry,
        name: req.body.row.name
    };
    if(!(req.body.systemid === "none") && req.body.systemid){
        row.system = req.body.systemid;
    }
    console.log(row);
    // FIND PROJECT
    Layer.findByIdAndUpdate(req.params.id, {$addToSet: {rows: row}}, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            // CREATE ROW
            console.log("Row has been added to layer");
            res.redirect("/layers/" + foundLayer.id + "/layout");
        }
    });
});

// EDIT ROW
router.get("/layers/:id/row/edit", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id).populate("rows.system").exec(function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            var row = foundLayer.rows[req.query.index];
            // FIND MY SYSTEMS
            Sequence.find({'owner.id': req.user._id}, function(err, foundSequences){
                if(err){
                    console.log(err);
                } else {
                    res.render("layers/editrow", {layer: foundLayer, row: row, sequences: foundSequences, index: req.query.index});
                }
            });
        }
    });
});

// UPDATE ROW
router.put("/layers/:id/row", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            // CHANGE PARAMS
            foundLayer.rows[req.query.index].name = req.body.row.name;
            foundLayer.rows[req.query.index].sequence = req.body.sequenceid;
            foundLayer.save();
            res.redirect("/layers/" + foundLayer._id + "/layout");
        }
    });
});

// DELETE ROW
router.delete("/layers/:id/row", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Layer.findById(req.params.id, function(err, updatedLayer){
        if(err){
            console.log(err);
        } else {
            // REMOVE ROW
            console.log("Length before " + updatedLayer.rows.length);
            if (req.query.index > -1) {
                updatedLayer.rows.splice(req.query.index, 1);
            }
            updatedLayer.save();
            console.log("Length after " + updatedLayer.rows.length);
            res.redirect("/layers/" + updatedLayer._id + "/layout");
        }
    });
});


module.exports = router;