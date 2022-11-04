var express = require("express");
var router = express.Router();
var Parcel = require("../models/parcel");
var Layer = require("../models/layer");
var Soiltest = require("../models/soiltest");
var middleware = require("../middleware");
var turf = require("@turf/helpers");
var centroid = require("@turf/centroid");


// PARCEL LAYER SOIL TEST NEW
router.get("/parcels/:id/layers/:pid/soiltests/new", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate("layers").exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            // FIND LAYER
            Layer.findById(req.params.pid, function(err, foundLayer){
                if(err){
                    console.log(err);
                } else {
                    // RENDER ACTIVITIES
                    res.render("soiltests/new", {parcel: foundParcel, layer: foundLayer});
                }
            });
        }
    });
});

// PARCEL LAYER SOIL TEST CREATE
router.post("/parcels/:id/layers/:pid/soiltests", middleware.isLoggedIn, function(req, res){
    // PARSE COORDINATES
    /*var soilTest = req.body.soiltest;
    var parsedCoordinates = req.body.coordinates.split(", ");
    console.log(parsedCoordinates);
    soiltest.lat = parsedCoordinates[0];
    soiltest.lat = parsedCoordinates[1];
    res.redirect("/parcels/" + req.params.id + "/status");*/
    // CREATE SOIL TEST
    Soiltest.create(req.body.soiltest, function(err, createdSoiltest){
        if(err){
            console.log(err);
        } else {
            Layer.findByIdAndUpdate(req.params.pid, { $push: { soiltests: createdSoiltest } }, function(err, updatedLayer){
                if(err){
                    console.log(err);
                } else {
                    // RENDER PARCEL LAYER SOIL TEST PAGE
                    res.redirect("/parcels/" + req.params.id + "/status");
                }
            });
        }
    });
});

// PARCEL
router.get("/parcels/:id/soiltests/viz", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate({path:'layers', populate:{path: 'soiltests'}}).exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            var geometry = turf.polygon([[[0,0],[0,1],[1,0],[0,0]]]);
            var geometryArray1: any[] = [];
            var geometryArray2: any[] = [];
            var geometryArray3: any[] = [];
            var geometryArray4: any[] = [];
            var geometryArray5: any[] = [];
            var placesArray: any[] = [];
            geometryArray1.push(geometry);
            geometryArray2.push(geometry);
            geometryArray3.push(geometry);
            geometryArray4.push(geometry);
            geometryArray5.push(geometry);
            if(foundParcel.layers.length > 0){
                for(let i=0;foundParcel.layers.length > i;i++){
                    // GET GEOMETRY
                    var polygon = JSON.parse(foundParcel.layers[i].geometry);
                    // PUSH TO ARRAY
                    var properties = {
                        'description': foundParcel.layers[i].name
                    };
                    var feature = turf.feature(polygon.geometry, properties);
                    if(foundParcel.layers[i].soiltests.length && foundParcel.layers[i].soiltests.length > 0){
                        if(foundParcel.layers[i].soiltests[0].fertility.SOM > 4){
                            geometryArray1.push(feature);
                        } else if(foundParcel.layers[i].soiltests[0].fertility.SOM > 3){
                            geometryArray2.push(feature);

                        } else if(foundParcel.layers[i].soiltests[0].fertility.SOM > 2){
                            geometryArray3.push(feature);

                        } else if(foundParcel.layers[i].soiltests[0].fertility.SOM > 1){
                            geometryArray4.push(feature);

                        } else if(foundParcel.layers[i].soiltests[0].fertility.SOM > 0){
                            geometryArray5.push(feature);
                        }
                    }
                    // CREATE PLACE
                    var centroidPoint = centroid(polygon.geometry);
                    var place = turf.point(centroidPoint.geometry.coordinates, properties);
                    placesArray.push(place);
                }
            }
            // CREATE LABEL COLLECTION
            var placesCollection = turf.featureCollection(placesArray);
            var places = JSON.stringify(placesCollection);
            // CREATE FEATURECOLLECTION
            var featurecollection1 = turf.featureCollection(geometryArray1);
            var collection1 = JSON.stringify(featurecollection1);
            var featurecollection2 = turf.featureCollection(geometryArray2);
            var collection2 = JSON.stringify(featurecollection2);
            var featurecollection3 = turf.featureCollection(geometryArray3);
            var collection3 = JSON.stringify(featurecollection3);
            var featurecollection4 = turf.featureCollection(geometryArray4);
            var collection4 = JSON.stringify(featurecollection4);
            var featurecollection5 = turf.featureCollection(geometryArray5);
            var collection5 = JSON.stringify(featurecollection5);
            res.render("soiltests/viz", {parcel: foundParcel, collection1: collection1, collection2: collection2, collection3: collection3, collection4: collection4, collection5: collection5, places: places});

            /*Layer.findById(req.params.pid, function(err, foundLayer){
                if(err){
                    console.log(err);
                } else {
                    // RENDER ACTIVITIES
                }
            });*/
        }
    });
});

module.exports = router;