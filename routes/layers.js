var express = require("express");
var router = express.Router();
var Layer = require("../models/layer");
var Parcel = require("../models/parcel");
var System = require("../models/system");
var Species = require("../models/species");
var Animal = require("../models/animal");
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
            res.redirect("/parcels");
        } else {
            // REMOVE LAYER FROM PARCEL
            Parcel.find({"layers": { $eq: foundLayer }}, function(err, foundParcel){
                if(err){
                    console.log(err);
                    res.redirect("/parcels");
                } else {
                    console.log(foundParcel.layers.length);
                    // REMOVE LAYER FROM PARCEL HERE WHEN IT IS FOUND?!
                    foundParcel.layers.remove(foundLayer);
                    foundParcel.save();
                    res.redirect("/parcels");
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
    Layer.findById(req.params.id).populate("systems.present").exec(function(err, foundLayer){
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
                            }
                            // SAVE DATASET
                            foundSystem.sortedrows = dataset;
                            // SET ROW WIDTH - ACTUALLY START BY SETTING TO SYSTEM WIDTH
                            var rowWidth = 0;
                            for(i=0;i<dataset.length;i++){
                                rowWidth = rowWidth + dataset[i].array[0].width;
                                console.log(dataset[i].array[0].width);
                            }
                            // CREATE BOUNDING BOX
                            var box = bboxPolygon(bbox(polygon));
                            // TAKE TOP SIDE OF BOUNDING BOX
                            var lengthLine = turf.lineString([box.geometry.coordinates[0][2],box.geometry.coordinates[0][3]],{name: 'line-0'});
                            // ESTIMATE AMOUNT OF ROWS
                            console.log((length(lengthLine, {units: "meters"})));
                            var rowCount = Math.floor((length(lengthLine, {units: "meters"}))/rowWidth);
                            console.log(rowCount);
                            // CREATE ROW LINE
                            var line = turf.lineString([box.geometry.coordinates[0][3],box.geometry.coordinates[0][4]],{name: 'line-1'});
                            // CREATE ROW ARRAY
                            var rowArray = [];
                            var distance = rowWidth;
                            // OFFSET AND CREATE NEW LINE FOR EACH ROW - NB. WORKS BECAUSE -1 CANCELS < rowCount BY 1.
                            for(i=0;i<rowCount;i++){
                                var bufferLine1 = buffer(line, (distance), {units: "meters"});
                                var rowPoints1 = lineIntersect(bufferLine1, polygon);
                                var row1 = turf.lineString([[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]],[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]]],{name: "line-0" + i });
                                rowArray.push(row1);
                                distance = distance + rowWidth;
                            }
                            // CREATE FEATURECOLLECTION
                            var featurecollection = turf.featureCollection(rowArray);
                            var line = turf.lineString([box.geometry.coordinates[0][3],box.geometry.coordinates[0][4]],{name: 'line-1'});
                            var offsetline = lineOffset(line, -(rowWidth),{units: "meters"});
                            var rowPoints = lineIntersect(offsetline, polygon);
                            console.log(rowPoints.features[0].geometry.coordinates[1]);
                            var row = turf.lineString([[rowPoints.features[0].geometry.coordinates[0],rowPoints.features[0].geometry.coordinates[1]],[rowPoints.features[1].geometry.coordinates[0],rowPoints.features[1].geometry.coordinates[1]]],{name: "line-2"});
                            console.log(row);
                            var stringline = JSON.stringify(row);
                            var stringbox = JSON.stringify(box);
                            var collection = JSON.stringify(featurecollection);
                            res.render("layers/layout", {layer: foundLayer, presentsystem: foundSystem, species: foundSpecies, stringbox: stringbox, stringline: stringline, collection: collection});
                        }
                    });
                }
            });
        }
    });
});

module.exports = router;