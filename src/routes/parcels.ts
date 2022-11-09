import express from "express";
var router = express.Router();
import User from "../models/user";
import Parcel from "../models/parcel";
import Practice from "../models/practice";
import Layer from "../models/layer";
import middleware from "../middleware"; // Will automatically require the middleware "index" file as the standard
import request from "request"; // Making REST requests

import {centroid, helpers as turf, length as turfLength, circle, along} from "@turf/turf"

// NODE GEOCODER CODE
import NodeGeocoder from "node-geocoder";

var options: NodeGeocoder.Options = {
    provider: "google",
    apiKey: process.env.GEOCODER_API_KEY,
    formatter: null
};

var geocoder = NodeGeocoder(options);

// PARCEL INDEX ROUTE
router.get("/parcels", middleware.isLoggedIn, function(req:any, res){
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
router.post("/parcels", middleware.isLoggedIn, function(req:any, res){
    // Create variable with new place posted from place form
    var name = req.body.parcel.name;
    var climate = {
        annualaverageprec: req.body.parcel.climate.annualaverageprec,
        hardiness: {
            low: -1,
            high: 16
        }
        };
    var soilType = req.body.parcel.soilType;
    var agType = req.body.parcel.agType;
    var size = req.body.parcel.size;
    var description = req.body.parcel.description;
    var practices = req.body.practiceids;
    var measurement = req.body.parcel.measurement;
    var owner = {
        id: req.user._id,
        username: req.user.username
    };
    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
    geocoder.geocode(req.body.parcel.location, async function(err, data){
        if(err || !data.length){
            console.log(err);
            console.log(data);
            return res.redirect("back");
        }
        var lat = data[0].latitude;
        var lng = data[0].longitude;
        var location = data[0].formattedAddress;
        // HARDCODE COLD HARDINESS FOR CERTAIN REGIONS
        if(data[0].country === "Brazil"){
            climate.hardiness.low = 1;
            climate.hardiness.high = 10;
        }
        if(data[0].country === "Sweden"){
            climate.hardiness.low = -18;
            climate.hardiness.high = -12;
        }
        if(data[0].country === "Canada"){
            climate.hardiness.low = -34;
            climate.hardiness.high = -29;
        }
        if(data[0].country === "Denmark"){
            climate.hardiness.low = -12;
            climate.hardiness.high = -9;
        }
        if(data[0].country === "Vietnam"){
            climate.hardiness.low = 9;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "India"){
            climate.hardiness.low = 9;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "Guatemala"){
            climate.hardiness.low = 4;
            climate.hardiness.high = 10;
        }
        if(data[0].country === "Nicaragua"){
            climate.hardiness.low = 10;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "Colombia"){
            climate.hardiness.low = 4;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "Costa Rica"){
            climate.hardiness.low = 8;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "Philippines"){
            climate.hardiness.low = 10;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "Greece"){
            climate.hardiness.low = -7;
            climate.hardiness.high = -1;
        }
        if(data[0].country === "Uganda"){
            climate.hardiness.low = 6;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "Guinea-Bissau"){
            climate.hardiness.low = 10;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "Sri Lanka"){
            climate.hardiness.low = 10;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "United Kingdom"){
            climate.hardiness.low = -12;
            climate.hardiness.high = -7;
        }
        if(data[0].country === "Spain"){
            climate.hardiness.low = -7;
            climate.hardiness.high = -1;
        }
        if(data[0].country === "Portugal"){
            climate.hardiness.low = -7;
            climate.hardiness.high = -1;
        }
        if(data[0].country === "Saudi Arabia"){
            climate.hardiness.low = 7;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "Myanmar"){
            climate.hardiness.low = 10;
            climate.hardiness.high = 16;
        }
        if(data[0].country === "United States"){
            climate.hardiness.low = -34;
            climate.hardiness.high = -23;
        }
        if(data[0].country === "Germany"){
            climate.hardiness.low = -12;
            climate.hardiness.high = -9;
        }
        if(data[0].country === "Netherlands"){
            climate.hardiness.low = -12;
            climate.hardiness.high = -9;
        }
        if(data[0].country === "Belgium"){
            climate.hardiness.low = -12;
            climate.hardiness.high = -9;
        }
        // Create new parcel
        var newParcel = {name: name, soilType: soilType, agType: agType, size: size, description: description, location: location, lat: lat, lng: lng, practices: practices, owner: owner, climate: climate, measurement: measurement};
        // Create a new parcel and save it to the database
        try {
            let newlyCreated = await Parcel.create(newParcel);

            console.log(newlyCreated + " added");
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
                    // ADD PRECIPITATION?HARDINESS?
                    // req.flash("success", "You have successfully created a new parcel");
                    res.redirect("/parcels/" + newlyCreated._id + "/layers/new");
                }
            });
        
        }
        catch (err){
            // req.flash("error", "Something went wrong");
            console.log(err);
        }
    });
});

// PARCEL SHOW ROUTE
router.get("/parcels/:id", middleware.checkParcelOwnership, function(req, res){
    Parcel.findById(req.params.id).populate("practices").populate("layers").exec(function(err, foundParcel){
        if(err) {
            console.log(err);
        } else {
            var geometry = turf.polygon([[[0,0],[0,1],[1,0],[0,0]]]);
            var geometryArray: any[] = [];
            var placesArray:any[] = [];
            geometryArray.push(geometry);
            if(foundParcel.layers.length > 0){
                for(let i=0;foundParcel.layers.length > i;i++){
                    // GET GEOMETRY
                    var polygon = JSON.parse(foundParcel.layers[i].geometry);
                    // PUSH TO ARRAY
                    var properties = {
                        'description': foundParcel.layers[i].name
                    };
                    var feature = turf.feature(polygon.geometry, properties);
                    geometryArray.push(feature);
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
            var featurecollection = turf.featureCollection(geometryArray);
            var collection = JSON.stringify(featurecollection);
            res.render("parcels/show", {parcel: foundParcel, collection: collection, places: places});
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
            // RENDER EDIT PAGE FOR PARCEL
            res.render("parcels/edit", {parcel: foundParcel});
        }
    });
});

// PLACES UPDATE ROUTE
router.put("/parcels/:id", middleware.checkParcelOwnership, function(req, res){
    // UPDATE PARCEL
    var parcel = req.body.parcel;
    // CONVERT ADDRESS TO COORDINATES USING GEOCODER
    geocoder.geocode(req.body.parcel.location, function(err, data) {
        if (err || !data.length) {
            console.log(err);
            console.log(data);
            return res.redirect("back");
        }
        parcel.lat = data[0].latitude;
        parcel.lng = data[0].longitude;
        parcel.location = data[0].formattedAddress;
        // UPDATE PARCEL
        Parcel.findByIdAndUpdate(req.params.id, parcel, function (err, updatedParcel) {
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
router.delete("/parcels/:id", middleware.checkParcelOwnership,async function(req:any, res){
    try {
        await Parcel.findByIdAndRemove(req.params.id)
        res.redirect('/users/' + req.user.id);

    }catch (err){
        console.log(err);
        res.redirect('/users/' + req.user.id);
    } 
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
            var layerarray:any[] = [];
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

// BIGQUERY PARCEL LAT LNG TEST
router.get("/parcels/:id/climate", middleware.checkParcelOwnership, function(req, res){
    Parcel.findById(req.params.id, function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            geocoder.geocode(foundParcel.location, function(err, data){
                if(err || !data.length){
                    console.log(err);
                    console.log(data);
                    return res.redirect("back");
                }
                console.log(data[0].country);
                console.log(data[0].administrativeLevels?.level1long);
                console.log(data[0].city);
                request("https://restcountries.eu/rest/v2/name/" + data[0].country + "?fullText=true&fields=alpha3Code", function(error, response, body){
                    console.log('error:', error);
                    console.log('statusCode:', response && response.statusCode);
                    var alphacountry = JSON.parse(body);
                    console.log(alphacountry[0].alpha3Code);
                    request("http://climatedataapi.worldbank.org/climateweb/rest/v1/country/annualavg/pr/1980/1999/" + alphacountry[0].alpha3Code, function(error1, response1, body1){
                        console.log('error:', error1);
                        console.log('statusCode:', response1 && response1.statusCode);
                        var weather = JSON.parse(body1);
                        console.log(weather[0].annualData[0]);
                        res.render("parcels/climate");
                    });
                });
            });
        }
    });
});

// PARCEL
router.get("/parcels/:id/layout", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate({path:'layers', populate:{path: 'areas'}}).populate({path:'layers', populate:{path: 'rows', populate:{path:'sequence'}}}).exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            var geometry = turf.polygon([[[0,0],[0,1],[1,0],[0,0]]]);
            var geometryArray:any[] = [];
            var placesArray:any[] = [];
            geometryArray.push(geometry);
            if(foundParcel.layers.length > 0){
                for(let i=0;foundParcel.layers.length > i;i++){
                    // GET GEOMETRY
                    var polygon = JSON.parse(foundParcel.layers[i].geometry);
                    // PUSH TO ARRAY
                    var properties = {
                        'description': foundParcel.layers[i].name
                    };
                    var feature = turf.feature(polygon.geometry, properties);
                    geometryArray.push(feature);
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
            var featurecollection = turf.featureCollection(geometryArray);
            var collection = JSON.stringify(featurecollection);
            // GENERATE ROWS AND TREES
            var treeAssetsArray:any[] = [];
            var treeMarkerArray:any[] = [];
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
            // CYCLE THROUGH EACH LAYER
            for(let j=0;j<foundParcel.layers.length;j++) {
                // CYCLE THROUGH EACH ROW OF EACH LAYER
                for (let i = 0; i < foundParcel.layers[j].rows.length; i++) {
                    // SET ROW DATA
                    if (foundParcel.layers[j].rows[i].sequence) {
                        var datasetRows = foundParcel.layers[j].rows[i].sequence.model;
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
                        var rowLine = JSON.parse(foundParcel.layers[j].rows[i].geometry);
                        var rowLength = turfLength(rowLine, {units: "meters"});
                        console.log("Row length " + rowLength);
                        // SYSTEM MODEL LENGTH
                        var systemModelLength = foundParcel.layers[j].rows[i].sequence.sequencelength;
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
                        for (let l = 0; l < systemModelCount; l++) {
                            for (let k = 0; k < datasetRows.length; k++) {
                                // CREATE COORDINATES FOR THE TREE
                                var treeMarker = along(rowLine, (l * systemModelLength + datasetRows[k].position), {units: "meters"});
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
                        for (let l = 0; l < datasetRows.length; l++) {
                            if (datasetRows[l].position < systemModelRowRest) {
                                /*
                                                                        treeArray.push(treeRows[treeRowCount].array[j].species);
                                */
                                // ADD POINT MARKER FOR REMAINING TREES
                                var treeMarker2 = along(rowLine, (systemModelCount * systemModelLength + datasetRows[l].position), {units: "meters"});
                                var asset2 = {
                                    marker: treeMarker2,
                                    species: datasetRows[l].species
                                };
                                treeMarkerArray.push(treeMarker2);
                                treeAssetsArray.push(asset2);
                            }
                        }
                    }
                }
            }
            // DO POINT COLLECTION
            var treeCanopyArray: any[] = [];
            if(treeAssetsArray.length < 4000){
                for(let i=0;i<treeAssetsArray.length;i++){
                    // FIND TREE DIMENSIONS
                    var diameter = 1;
                    var circle1 = circle(treeAssetsArray[i].marker.geometry.coordinates, diameter, {units: "meters"});
                    treeCanopyArray.push(circle1);
                }
            }
            var treeMarkers = turf.featureCollection(treeCanopyArray);
            var treeCollection = JSON.stringify(treeMarkers);
            // GENERATE AREAS
            var alleyPolygonArray:any[] = [];
            var bedPolygonArray:any[] = [];
            for(let j=0;j<foundParcel.layers.length;j++){
                for(let i=0;i<foundParcel.layers[j].areas.length;i++){
                    // ROW VIZ
                    var areaGeometry = JSON.parse(foundParcel.layers[j].areas[i].geometry);
                    if(foundParcel.layers[j].areas[i].name.charAt(0) === "A"){
                        alleyPolygonArray.push(areaGeometry);
                    } else if(foundParcel.layers[j].areas[i].name.charAt(0) === "T"){
                        bedPolygonArray.push(areaGeometry);
                    } else {
                        alleyPolygonArray.push(areaGeometry);
                    }
                }
            }
            var bedArrayPolygons = turf.featureCollection(bedPolygonArray);
            var stripsCollection = JSON.stringify(bedArrayPolygons);
            var alleyArrayPolygons = turf.featureCollection(alleyPolygonArray);
            var alleysCollection = JSON.stringify(alleyArrayPolygons);
            res.render("parcels/layout", {parcel: foundParcel, collection: collection, places: places, trees: treeCollection, strips: stripsCollection, alleys: alleysCollection});
        }
    });
});

export default router;