var express = require("express");
var router = express.Router();
var unique = require("array-unique");
var Parcel = require("../models/parcel");
var Project = require("../models/project");
var Practice = require("../models/practice");
var Layer = require("../models/layer");
var System = require("../models/system");
var Budget = require("../models/budget");
var Activity = require("../models/activity");
var Species = require("../models/species");
var Asset = require("../models/asset");
var Posting = require("../models/posting");
var geodist = require("geodist"); // TO CALCULATE DISTANCE BETWEEN COORDINATES
var middleware = require("../middleware");
var bbox = require("@turf/bbox");
var bboxPolygon = require("@turf/bbox-polygon");
var turf = require("@turf/helpers");
var lineOffset = require("@turf/line-offset");
var lineIntersect = require("@turf/line-intersect");
var length = require("@turf/length");
var buffer = require("@turf/buffer");
var rhumbBearing = require("@turf/rhumb-bearing");
var transformScale = require("@turf/transform-scale");
var transformRotate = require("@turf/transform-rotate");
var lineSplit = require("@turf/line-split");
var along = require("@turf/along");
var circle = require("@turf/circle");
var area = require("@turf/area");
var polygonToLine = require("@turf/polygon-to-line");

// NODE GEOCODER CODE
var NodeGeocoder = require("node-geocoder");

var options = {
    provier: "google",
    httpAdapter: "https",
    apiKey: process.env.GEOCODER_API_KEY,
    formatter: null
};

var geocoder = NodeGeocoder(options);

// PROJECTS INDEX ROUTE
router.get("/projects", middleware.isLoggedIn, function(req, res){
    // GET ALL USERS PROJECTS IN DB
    Project.find({'owner.id': req.user._id}, function(err, allProjects){
        if(err) {
            console.log(err);
        } else {
            res.render("projects/index", {projects: allProjects});
        }
    });
});

// SERVICES NEW ROUTE
router.get("/projects/new", middleware.isLoggedIn, function(req, res){
    var place = undefined;
    res.render("projects/new", {place: place});
});

// SERVICES CREATE ROUTE
router.post("/projects", middleware.isLoggedIn, function(req, res){
    // Create a new project
    Project.create(req.body.project, function(err, service){
        if(err){
            console.log(err);
        } else {
            // CONVERT ADDRESS TO COORDINATES USING GEOCODER
            geocoder.geocode(req.body.service.location, function(err, data) {
                if (err || !data.length) {
                    console.log(err);
                    return res.redirect("back");
                }
                service.lat = data[0].latitude;
                service.lng = data[0].longitude;
                service.location = data[0].formattedAddress;
                // Add username and ID to experience
                service.owner.id = req.user._id;
                service.owner.username = req.user.username;
                // Save the service - Not need if created after this step
                service.save();
                // Redirect to projects INDEX page
                // req.flash("success", "Successfully added service");
                res.redirect("/projects");
            });
        }
    });
});

// PROJECT SHOW ROUTE
router.get("/projects/:id", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id).populate("layer").populate("assets").populate("budgets.establishment").populate("budgets.management").populate("system").populate("edgesystem").populate("activities").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // TEST WITH BLANK
            var estPostings = [];
            if(foundProject.budgets.establishment){
                estPostings = foundProject.budgets.establishment.postings
            }
            Posting.find({"_id": estPostings}, function(err, establishementPostings){
                if(err){
                    console.log(err);
                } else {
                    console.log("Establishment postings: " + establishementPostings.length);
                    // TEST WITH BLANK
                    var manPostings = [];
                    if(foundProject.budgets.management){
                        manPostings = foundProject.budgets.management.postings
                    }
                    Posting.find({"_id": manPostings}, function(err, managementPostings){
                        if(err){
                            console.log(err);
                        } else {
                            console.log("Management postings: " + managementPostings.length);
                            var irr = 0;
                            // SET YEARS VARIABLE FOR BOTH GRAPH AND BUDGET
                            var years = 0;
                            if(foundProject.budgets.establishment || foundProject.budgets.management){
                                var totalEstablishment = 0;
                                if(establishementPostings.length > 0){
                                    for(i=0;i<establishementPostings.length;i++){
                                        if(establishementPostings[i].postType === "labor" || establishementPostings[i].postType === "material"){
                                            totalEstablishment = totalEstablishment - (establishementPostings[i].value * establishementPostings[i].amount);
                                        } else if(establishementPostings[i].postType === "product" || establishementPostings[i].postType === "service"){
                                            totalEstablishment = totalEstablishment + (establishementPostings[i].value * establishementPostings[i].amount);
                                        }
                                        if(establishementPostings[i].year){
                                            if(establishementPostings[i].year > years){
                                                years = establishementPostings[i].year;
                                            }
                                        }
                                    }

                                }
                                var totalManagement = 0;
                                if(managementPostings.length > 0){
                                    for(i=0;i<managementPostings.length;i++){
                                        if(managementPostings[i].postType === "labor" || managementPostings[i].postType === "material"){
                                            totalManagement = totalManagement - (managementPostings[i].value * managementPostings[i].amount);
                                        } else if(managementPostings[i].postType === "product" || managementPostings[i].postType === "service"){
                                            totalManagement = totalManagement + (managementPostings[i].value * managementPostings[i].amount);
                                        }
                                        if(managementPostings[i].year){
                                            if(managementPostings[i].year > years){
                                                years = managementPostings[i].year;
                                            }
                                        }
                                    }
                                }
                                for(i=0;i<foundProject.financial.period;i++){
                                    irr = irr + (totalManagement)/(1+foundProject.financial.discountRate)^i;
                                }
                                irr = irr - totalEstablishment;
                            }
                            console.log(irr);
                            console.log("Years: " + years);
                            //
                            var labels = [];
                            for(i=1;i<years+1;i++){
                                var label = i;
                                labels.push(label);
                            }
                            // GENERATE DATA FOR GRAPH
/*
                            var labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', "15"];
*/
                            // CALCULATE DATASET

                            var parsedLabels = JSON.stringify(labels);
                            var dataset = [-2, -1.2, 0.2, 0.5, 1, 1.2, 1.6, 2, 2.5, 2.9, 3.3, 4, 4.5, 5, 6];
                            var parseddataset = JSON.stringify(dataset);
                            // CHECK LENGTH IS IDENTICAL
                            res.render("projects/show", {project: foundProject, irr: irr, labels: parsedLabels, dataset: parseddataset});
                        }
                    });
                }
            });
        }
    });
});

// PROJECT EDIT ROUTE
router.get("/projects/:id/edit", middleware.isLoggedIn, function(req, res){ // MAKE SERVICE OWNERSHIP MIDDLEWARE
    // Find specific project in database
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            res.render("projects/edit", {project: foundProject});
        }
    });
});

// PROJECT LAYOUT EDIT ROUTE
router.get("/projects/:id/layout", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id).populate("system").populate("edgesystem").populate("layer").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                // EDGE SYSTEM FIND, IF ONE
                var edgesystem = "5e6639bc8add4f22f0820200";
                if(foundProject.edgesystem){
                    edgesystem = foundProject.edgesystem;
                }
                System.findById(edgesystem).populate("model.species").exec(function(err, foundEdgeSystem){
                    if(err){
                        console.log(err);
                    } else {
                        // FIX TURF BUG
                        var merc = 1/Math.cos(54*Math.PI/180);
                        console.log(merc);
                        // GET GEOMETRY
                        var polygon = JSON.parse(foundProject.layer.geometry);
                        // CALIBRATE OFFSET
                        var boxCalibrate = bboxPolygon(bbox(polygon));
                        // TAKE TOP SIDE OF BOUNDING BOX
                        var lineCalibrate = turf.lineString([boxCalibrate.geometry.coordinates[0][2],boxCalibrate.geometry.coordinates[0][3]],{name: 'line-35'});
                        var lineOffsetCalibrate = buffer(lineCalibrate, 10, {units: "meters"});
                        var rotatedCalibrateLine = transformRotate(lineCalibrate, 90);
                        var splitCalibrateLine = lineSplit(rotatedCalibrateLine, lineCalibrate);
                        var distanceCalibrateLine = lineSplit(splitCalibrateLine.features[1], lineOffsetCalibrate);
                        var calibrateDistance = 10/(length(distanceCalibrateLine.features[0], {units: "meters"}));
                        console.log("Distance check " + calibrateDistance);
                        // CREATE HEADLAND + PERIMETER SYSTEM WIDTH
                        var headland = foundProject.headland;
                        var edgeRowDataset = [];
                        if(foundProject.edgesystem){
                            // CALCULATE WIDTH - REFACTOR INTO MIDDLEWARE. USED TWICE IN THIS ROUTE
                            foundEdgeSystem.model.forEach(function(species){
                                var count = 0;
                                for(i=0;i<edgeRowDataset.length;i++){
                                    if(edgeRowDataset[i].row === species.position[0]){
                                        edgeRowDataset[i].array.push(species);
                                        count = count + 1;
                                    }
                                }
                                if(count === 0){
                                    edgeRowDataset.push({row: species.position[0], array: [species]});
                                }
                            });
                            // ADD ALL ROWS TO WIDTH
                            var edgeRowWidth = 0;
                            for(i=0;i<edgeRowDataset.length;i++){
                                edgeRowWidth = edgeRowWidth + edgeRowDataset[i].array[0].width;
                            }
                            // ADD EDGE SYSTEM WIDTH TO HEADLAND
                            headland = headland + edgeRowWidth;
                        }
                        console.log("headland plus perimeter system: " + headland);
                        var offsetPolygon = buffer(polygon, - headland*calibrateDistance, {units: "meters"});
                        // CREATE PERIMETER ROWS CENTER
                        var edgeRowWidthArray = [];
                        for(i=0;i<edgeRowDataset.length;i++){
                            var edgeRowArrayWidth = 0;
                            if(i === 0){
                                edgeRowArrayWidth = edgeRowDataset[i].array[0].width/2;
                            } else {
                                edgeRowArrayWidth = edgeRowDataset[i].array[0].width/2 + edgeRowDataset[i-1].array[0].width/2
                            }
                            edgeRowWidthArray.push(edgeRowArrayWidth);
                        }
                        // CREATE EDGE ROW LINES
                        var edgeRowArray = [];
                        var edgeRowDistance = 0;
                        for(i=0;i<edgeRowWidthArray.length;i++){
                            edgeRowDistance = edgeRowDistance + edgeRowWidthArray[i];
                            var offsetEdgeRowPolygon = buffer(polygon, - edgeRowDistance*calibrateDistance, {units: "meters"});
                            var offsetEdgeRow = polygonToLine(offsetEdgeRowPolygon);
                            edgeRowArray.push(offsetEdgeRow);
                        }
                        // CREATE EDGE ROW MARKERS AND TREE COUNTS
                        var edgeTreeMarkerArray = [];
                        var edgeTreeArray = []; // MIGHT NOT USE BEFORE I NEED THE ASSETS. MIGHT NEED FOR TREE COUNTS THOUGH
                        // CREATE TREES FOR EACH EDGE ROW
                        for(i=0;i<edgeRowArray.length;i++){
                            // COUNT EDGE SYSTEM MODEL ITERATIONS IN ROW
                            var edgeRowLength = length(edgeRowArray[i], {units: "meters"});
                            // SET LENGTH AS LAST IN ROW SPECIES Y COORDINATE
                            var edgeSystemModelLength = 0;
                            edgeSystemModelLength = edgeRowDataset[0].array[(edgeRowDataset[0].array.length - 1)].position[1];
                            var edgeSystemModelCount = Math.floor(edgeRowLength/edgeSystemModelLength);
                            var edgeSystemModelRowRest = ((edgeRowLength/edgeSystemModelLength) - Math.floor(edgeRowLength/edgeSystemModelLength))*edgeSystemModelLength;
                            // ITERATE FOR EACH MODEL COUNT
                            for(j=0;j<edgeSystemModelCount;j++){
                                // CREATE TREE FOR EACH SPECIES IN MODEL
                                for(k=0;k<edgeRowDataset[i].array.length;k++) {
                                    // ADD TREE SPECIES TO COUNT ARRAY
                                    edgeTreeArray.push(edgeRowDataset[i].array[k].species);
                                    // CREATE TREE POINTS FOR MARKERS
                                    var edgeTreeMarker = along(edgeRowArray[i], ((j * edgeSystemModelLength) + edgeRowDataset[i].array[k].position[1]), {units: "meters"});
                                    edgeTreeMarkerArray.push(edgeTreeMarker);
                                }
                            }
                            // ADD REST
                        }
                        console.log("Edge tree markers: " + edgeTreeMarkerArray.length);
                        console.log("Edge trees: " + edgeTreeArray.length);
                        // DO POINT COLLECTION
                        var edgeTreeCanopyArray = [];
                        // SET MAX LIMIT FOR AMOUNT OF TREES
                        if(edgeTreeMarkerArray.length < 1500){
                            for(i=0;i<edgeTreeMarkerArray.length;i++){
                                var circle5 = circle(edgeTreeMarkerArray[i].geometry.coordinates, 0.5, {units: "meters"});
                                edgeTreeCanopyArray.push(circle5);
                            }
                        }
                        var edgeTreeMarkers = turf.featureCollection(edgeTreeCanopyArray);
                        var edgeTreeCollection = JSON.stringify(edgeTreeMarkers);
                        // COPY ALL EDGE ROW SPECIES
                        var allEdgeSpeciesCopy = [];
                        for(i=0;edgeTreeArray.length > i;i++){
                            allEdgeSpeciesCopy.push(edgeTreeArray[i]);
                        }
                        // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                        var uniqueEdgeSpecies = unique(allEdgeSpeciesCopy);
                        // UNIQUE ITEM COUNTS
                        var uniqueEdgeSpeciesCount = [];
                        for(i=0;uniqueEdgeSpecies.length > i;i++){
                            var edgecount = 0;
                            for(j = 0; j < edgeTreeArray.length; j++){
                                if(edgeTreeArray[j].nameCommon === uniqueEdgeSpecies[i].nameCommon){
                                    edgecount = edgecount + 1;
                                }
                            }
                            var speciesCount = {
                                id: uniqueEdgeSpecies[i].nameCommon,
                                uniqueCount: edgecount
                            }
                            uniqueEdgeSpeciesCount.push(speciesCount);
                        }
                        console.log("Unique Species in edge: " + uniqueEdgeSpeciesCount.length);
                        // FIND SYSTEM ROWS
                        var allSpecies = [];
                        var dataset = [];
                        foundSystem.model.forEach(function(species){
                            allSpecies.push(species.species.nameCommon);
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
                        // HAVE ARRAY INSTEAD AND ONLY SELECT ROWS WITH TREES?!
                        var rowWidth = 0;
                        for(i=0;i<dataset.length;i++){
                            rowWidth = rowWidth + dataset[i].array[0].width;
                        }
                        var rowWidthArray = [];
                        var rowWidthArrayCount = 0;
                        var treeRowWidthArray = [];
                        for(i=0;i<dataset.length+1;i++){
                            // SET ROW LENGTHS
                            // IF FIRST ROW
                            if(i === 0){
                                if(dataset[i].array[0].species.form === "grass" || dataset[i].array[0].species.form === "herb"){
                                    rowWidthArrayCount = rowWidthArrayCount + dataset[i].array[0].width;
                                } else {
                                    rowWidthArrayCount = rowWidthArrayCount + dataset[i].array[0].width/2;
                                    rowWidthArray.push(rowWidthArrayCount);
                                    rowWidthArrayCount = 0;
                                    treeRowWidthArray.push(dataset[i].array[0].width);
                                }
                                // IF LAST ROW
                            } else if (i === dataset.length) {
                                rowWidthArrayCount = rowWidthArrayCount + dataset[i-1].array[0].width/2;
                                rowWidthArray.push(rowWidthArrayCount);
                                // FOR ALL OTHER ROWS
                            } else {
                                // CHECK IF ROW BEFORE WAS GRASS
                                if((dataset[i-1].array[0].species.form === "grass" || dataset[i].array[0].species.form === "herb") && i === 1){
                                    rowWidthArrayCount = rowWidthArrayCount + dataset[i].array[0].width/2;
                                } else {
                                    rowWidthArrayCount = rowWidthArrayCount + dataset[i].array[0].width/2 + dataset[i-1].array[0].width/2;
                                }
                                // SET COUNTER TO 0 IF CURRENT ROW IS NOT GRASS
                                if(!(dataset[i].array[0].species.form === "grass" || dataset[i].array[0].species.form === "herb")) {
                                    rowWidthArray.push(rowWidthArrayCount);
                                    rowWidthArrayCount = 0;
                                    treeRowWidthArray.push(dataset[i].array[0].width);
                                }
                            }
                        }
                        /*
                                        console.log(rowWidthArray);
                        */
                        /*// CREATE LINES FROM GEOMETRY
                        var boundaryLines = [];
                        console.log(polygon.geometry.coordinates[0].length);
                        for(i=0;i<polygon.geometry.coordinates[0].length;i++){
                            var point1;
                            var point2;
                            if(i === polygon.geometry.coordinates[0].length - 1){
                                point1 = turf.point(polygon.geometry.coordinates[0][i]);
                                point2 = turf.point(polygon.geometry.coordinates[0][0]);
                            } else {
                                point1 = turf.point(polygon.geometry.coordinates[0][i]);
                                point2 = turf.point(polygon.geometry.coordinates[0][i+1]);
                            }
                            console.log(point1);
                            console.log(point2);
                            var bearing1 = bearing(point1.geometry.coordinates, point2.geometry.coordinates);
                            console.log(bearing1);
                            // MAYBE NEGATE THESE
                        }*/
                        // DEFINE ALL VARIABLES I NEED FOR THE ROWS HERE, THEN MAKE IF STATEMENTS ON ALIGNMENT
                        var lengthLine;
                        var line;
                        var rowCount = 0;
                        var rowRest = 0;
                        if(foundProject.alignment === "bearing"){
                            // -------- ANGLED ROWS ---------
                            // IF HEADLAND IS 0, JUST USE REGULAR POLYGON, NOT BUFFER
                            var lengthLineBearing = {};
                            if(foundProject.headland === 0){
                                lengthLineBearing = turf.lineString([polygon.geometry.coordinates[0][foundProject.bearing],polygon.geometry.coordinates[0][foundProject.bearing + 1]],{name: 'bearingline'});
                            } else {
                                lengthLineBearing = turf.lineString([offsetPolygon.geometry.coordinates[0][foundProject.bearing],offsetPolygon.geometry.coordinates[0][foundProject.bearing + 1]],{name: 'bearingline'});
                            }
                            // SCALE LINE
                            line = transformScale(lengthLineBearing, 6);
                            // ALTERNATIVE BOUNDING BOX LENTH LINE
                            var lineBearing = rhumbBearing(lengthLineBearing.geometry.coordinates[0],lengthLineBearing.geometry.coordinates[1]);
                            console.log(lineBearing);
                            var rotatedpolygon = transformRotate(offsetPolygon, 90-lineBearing);
                            var bboxOffsetPolygon = bboxPolygon(bbox(rotatedpolygon));
                            console.log(bboxOffsetPolygon.geometry.coordinates[0][1]);
                            console.log(bboxOffsetPolygon.geometry.coordinates[0][2]);
                            var lengthLineOffsetRotatedPolygon = turf.lineString([bboxOffsetPolygon.geometry.coordinates[0][1],bboxOffsetPolygon.geometry.coordinates[0][2]],{name: 'line-10'});
                            console.log(length(lengthLineOffsetRotatedPolygon, {units: "meters"}) + " meter length");
                            /*// CREATE ANGLED LENGTH LINE
                            var rotatedLine = transformRotate(line, 90);
                            var splitLines = lineSplit(rotatedLine, line);
                            // SET LENGTH LINE
                            var lengthLineSplit = lineSplit(splitLines.features[0], offsetPolygon);
                            lengthLine = lengthLineSplit.features[1];
                            console.log(splitLines.features[0]);
                            console.log(Math.floor((length(lengthLine, {units: "meters"}))));*/
                            rowCount = Math.floor((length(lengthLineOffsetRotatedPolygon, {units: "meters"}))/rowWidth);
                            rowRest = (((length(lengthLineOffsetRotatedPolygon, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
                            console.log(rowCount);
                            console.log("rest " + rowRest);
                            // -------- ANGLED ROWS ---------
                        } else if(foundProject.alignment === "north"){
                            // -------- NORTH/SOURTH ROWS ---------
                            // CREATE BOUNDING BOX (IF ANGLE IS 0)
                            var box = bboxPolygon(bbox(offsetPolygon));
                            // TAKE TOP SIDE OF BOUNDING BOX
                            lengthLine = turf.lineString([box.geometry.coordinates[0][2],box.geometry.coordinates[0][3]],{name: 'line-0'});
                            // ESTIMATE AMOUNT OF ROWS
                            console.log((length(lengthLine, {units: "meters"})));
                            rowCount = Math.floor((length(lengthLine, {units: "meters"}))/rowWidth);
                            rowRest = (((length(lengthLine, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
                            console.log("rest " + rowRest);
                            console.log(rowCount);
                            // CREATE ROW LINE
                            line = turf.lineString([box.geometry.coordinates[0][3],box.geometry.coordinates[0][4]],{name: 'line-1'});
                            // -------- NORTH/SOURTH ROWS ---------
                        } else {
                            // -------- WEST/EAST ROWS ---------
                            // CREATE BOUNDING BOX
                            var box = bboxPolygon(bbox(offsetPolygon));
                            // TAKE TOP SIDE OF BOUNDING BOX
                            lengthLine = turf.lineString([box.geometry.coordinates[0][1],box.geometry.coordinates[0][2]],{name: 'line-0'});
                            // ESTIMATE AMOUNT OF ROWS
                            console.log((length(lengthLine, {units: "meters"})));
                            rowCount = Math.floor((length(lengthLine, {units: "meters"}))/rowWidth);
                            rowRest = (((length(lengthLine, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
                            console.log("rest " + rowRest);
                            console.log(rowCount);
                            // CREATE ROW LINE
                            line = turf.lineString([box.geometry.coordinates[0][2],box.geometry.coordinates[0][3]],{name: 'line-1'});
                            // -------- WEST/EAST ROWS ---------
                        }
                        // CREATE ROW ARRAY
                        var rowArray = [];
                        var distance = 0;
                        var distanceArray = rowWidthArray;
                        // OFFSET AND CREATE NEW LINE FOR EACH ROW - NB. WORKS BECAUSE -1 CANCELS < rowCount BY 1.
                        for(i=0;i<rowCount;i++){
                            // DO IF FIRST COUNT?
                            for(j=0;j<distanceArray.length;j++){
                                // DO IF FIRST ROW, DON'T ADD DISTANCE
                                if(j === distanceArray.length - 1){
                                    distance = distance + distanceArray[j];
                                } else if (i === 0 && j === 0) {
                                    // START FIRST ROW AT 0
                                    distance = 0.01;
                                    var bufferLine1 = buffer(line, (distance*calibrateDistance), {units: "meters"});
                                    var rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
                                    if((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0)){
                                        var row1 = turf.lineString([[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]],[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]]],{name: "line-0" + i });
                                    } else {
                                        var row1 = turf.lineString([[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]],[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]]],{name: "line-0" + i });
                                    }
                                    rowArray.push(row1);
                                } else {
                                    distance = distance + distanceArray[j];
                                    var bufferLine1 = buffer(line, (distance*calibrateDistance), {units: "meters"});
                                    var rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
                                    if((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0 || rowPoints1.features[0].geometry.coordinates[1] > rowPoints1.features[1].geometry.coordinates[1])){
                                        var row1 = turf.lineString([[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]],[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]]],{name: "line-0" + i });
                                    } else {
                                        var row1 = turf.lineString([[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]],[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]]],{name: "line-0" + i });
                                    }
                                    rowArray.push(row1);
                                }
                            }
                        }
                        // ADD LAST ROWS IF THERE IS SOME MISSING
                        var countWidth = 0;
                        for(i=0;i<distanceArray.length;i++){
                            countWidth = countWidth + distanceArray[i];
                            if(countWidth < rowRest){
                                var bufferLine2 = buffer(line, ((distance+countWidth)*calibrateDistance), {units: "meters"});
                                var rowPoints2 = lineIntersect(bufferLine2, offsetPolygon);
                                // CHECK IF ROWS CROSS MEDIAN LINE (GOES FROM NEGATIVE TO POSITIVE)
                                if((rowPoints2.features[0].geometry.coordinates[0] < 0 && rowPoints2.features[1].geometry.coordinates[0] > 0) || (rowPoints2.features[0].geometry.coordinates[0] > 0 && rowPoints2.features[1].geometry.coordinates[0] < 0) || rowPoints2.features[0].geometry.coordinates[1] > rowPoints2.features[1].geometry.coordinates[1]){
                                    var row2 = turf.lineString([[rowPoints2.features[1].geometry.coordinates[0],rowPoints2.features[1].geometry.coordinates[1]],[rowPoints2.features[0].geometry.coordinates[0],rowPoints2.features[0].geometry.coordinates[1]]],{name: "line-1" + i });
                                } else {
                                    var row2 = turf.lineString([[rowPoints2.features[0].geometry.coordinates[0],rowPoints2.features[0].geometry.coordinates[1]],[rowPoints2.features[1].geometry.coordinates[0],rowPoints2.features[1].geometry.coordinates[1]]],{name: "line-1" + i });
                                }
                                rowArray.push(row2);
                            }
                        }
                        // SET ROWLENGTH ARRAY
                        var rowLengthArray = [];
                        for (i=0;i<rowArray.length;i++){
                            var rowLength1 = length(rowArray[i], {units: "meters"});
                            rowLengthArray.push(rowLength1);
                            /*
                                                console.log(rowArray[i].geometry.coordinates);
                            */
                        }
                        // PUSH TO ROW ARRAY
                        /*                rowArray.push(scaledLengthLineBearing);
                                        rowArray.push(finalLengthLineBearing.features[1]);*/
                        // DO DISTANCE CHECK FOR ROW ARRAY OFFSET
                        /* var rotatedCheckLine = transformRotate(rowArray[0], 90);
                         var splitCheckLine = lineSplit(rotatedCheckLine, rowArray[0]);
                         var distanceCheckLine = lineSplit(splitCheckLine.features[1], rowArray[1]);
                         var checkDistance = length(distanceCheckLine.features[0], {units: "meters"});
                         console.log("Distance check " + checkDistance);*/
                        // CREATE FEATURECOLLECTION FOR ROWS
                        var featurecollection = turf.featureCollection(rowArray);
                        var collection = JSON.stringify(featurecollection);
                        // CREATE FEATURE COLLECTION FOR EDGEROWS
                        var edgeRowFeatureCollection = turf.featureCollection(edgeRowArray);
                        var edgeRowCollection = JSON.stringify(edgeRowFeatureCollection);
                        // OFFSET LINE
                        /*               var offsetline = lineOffset(line, -(3),{units: "meters"});
                                       var rowPoints = lineIntersect(offsetline, offsetPolygon);
                                       var row = turf.lineString([[rowPoints.features[0].geometry.coordinates[0],rowPoints.features[0].geometry.coordinates[1]],[rowPoints.features[1].geometry.coordinates[0],rowPoints.features[1].geometry.coordinates[1]]],{name: "line-2"});
                                       var stringline = JSON.stringify(row);
                                       var stringbox = JSON.stringify(box);*/
                        // CLEAN DATASET FROM ANNUALS - ONLY WORKS IF ANNUALS IN FIRST POSITION
                        var treeRows = [];
                        for(i=0;i<dataset.length;i++){
                            if(!(dataset[i].array[0].species.form === "grass")){
                                treeRows.push(dataset[i]);
                            }
                        }
                        // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
                        var treeRowCount = 0;
                        var treeCountArray = [];
                        var treeMarkerArray = [];
                        var treeArray = [];
                        var treeRowArea = 0;
                        for(i=0;i<rowArray.length;i++){
                            // COUNT SYSTEM MODEL ITERATIONS IN ROW
                            var rowLength = length(rowArray[i], {units: "meters"});
                            // IF POSITION y IS 1, USE NEXT ROW TO FIND SYSTEM MODEL LENGTH?! THIS IS ONLY TEMP SOLUTION
                            var systemModelLength = 0;
                            if(dataset[0].array[(dataset[0].array.length - 1)].position[1] <= 1){
                                systemModelLength = dataset[1].array[(dataset[1].array.length - 1)].position[1];
                            } else {
                                systemModelLength = dataset[0].array[(dataset[0].array.length - 1)].position[1];
                            }
                            var systemModelCount = Math.floor(rowLength/systemModelLength);
                            var systemModelRowRest = ((rowLength/systemModelLength) - Math.floor(rowLength/systemModelLength))*systemModelLength;
                            // CALCULATE AREA
                            treeRowArea = treeRowArea + rowLength * treeRows[treeRowCount].array[0].width;
                            // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
                            treeArray.push(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species);
                            var firstTreeMarker = turf.point(rowArray[i].geometry.coordinates[0]);
                            treeMarkerArray.push(firstTreeMarker);
                            // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
                            for(j=0;j<systemModelCount;j++){
                                for(k=0;k<treeRows[treeRowCount].array.length;k++){
                                    // ADD TREE SPECIES TO COUNT ARRAY
                                    treeArray.push(treeRows[treeRowCount].array[k].species);
                                    // CREATE TREE POINTS FOR MARKERS
                                    var treeMarker = along(rowArray[i], (j*systemModelLength + treeRows[treeRowCount].array[k].position[1]), {units: "meters"});
                                    treeMarkerArray.push(treeMarker);
                                }
                            }
                            // ADD REST
                            for(j=0;j<treeRows[treeRowCount].array.length;j++){
                                if(treeRows[treeRowCount].array[j].position[1] < systemModelRowRest){
                                    treeArray.push(treeRows[treeRowCount].array[j].species);
                                    // ADD POINT MARKER FOR REMAINING TREES
                                    var treeMarker2 = along(rowArray[i], (systemModelCount*systemModelLength + treeRows[treeRowCount].array[j].position[1]), {units: "meters"});
                                    treeMarkerArray.push(treeMarker2);
                                }
                            }
                            // ALIGN ROW ARRAY WITH SYSTEM ROWS (I.E. START NEW ROW MODEL COUNT.) AND REST LAST ROW
                            if(treeRowCount >= treeRows.length - 1){
                                treeRowCount = 0;
                            } else {
                                treeRowCount = treeRowCount + 1;
                            }
                        }
                        console.log(treeArray.length);
                        console.log(treeMarkerArray.length);
                        // DO POINT COLLECTION
                        var treeCanopyArray = [];
                        if(treeMarkerArray.length < 3000){
                            for(i=0;i<treeMarkerArray.length;i++){
                                var circle1 = circle(treeMarkerArray[i].geometry.coordinates, 1, {units: "meters"});
                                treeCanopyArray.push(circle1);
                            }
                        }
                        var treeMarkers = turf.featureCollection(treeCanopyArray);
                        var treeCollection = JSON.stringify(treeMarkers);
                        // CALCULATE TREE COUNT
                        var areaSize = foundProject.layer.size;
                        // GRID SIZE
                        var areaGrid = rowWidth * dataset[0].array[(dataset[0].array.length - 1)].position[1]; // CHECK THAT THIS IS WORKING
                        var gridCount = areaSize / areaGrid;
                        // COPY ALL SPECIES
                        var allSpeciesCopy = [];
                        for(i=0;allSpecies.length > i;i++){
                            allSpeciesCopy.push(allSpecies[i]);
                        }
                        // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                        var uniqueSpecies = unique(allSpeciesCopy);
                        // UNIQUE ITEM COUNTS
                        var uniqueSpeciesCount = [];
                        for(i=0;uniqueSpecies.length > i;i++){
                            var count = 0;
                            for(j = 0; j < treeArray.length; j++){
                                if(treeArray[j].nameCommon === uniqueSpecies[i])
                                    count = count + 1;
                            }
                            speciesCount = {
                                id: uniqueSpecies[i],
                                uniqueCount: count
                            };
                            uniqueSpeciesCount.push(speciesCount);
                        }
                        // CALCULATE MARGIN AREA
                        var marginArea = area(polygon) - area(offsetPolygon);
                        res.render("projects/layout", {project: foundProject, system: foundSystem, collection: collection, edgecollection: edgeRowCollection, trees: treeCollection, edgetrees: edgeTreeCollection, species: uniqueSpeciesCount, edgespecies: uniqueEdgeSpeciesCount, rowWidth: rowWidth, treeArea: treeRowArea, marginArea: marginArea, rowLengthArray: rowLengthArray});
                    }
                });
            });
        }
    });
});

// PROJECT UPDATE ROUTE
router.put("/projects/:id", middleware.isLoggedIn, function(req, res){
    Project.findByIdAndUpdate(req.params.id, req.body.project, function(err, updatedProject){
        if(err){
            console.log(err);
        } else {
            // req.flash("success", "Successfully added service");
            res.redirect("/projects/" + req.params.id);
        }
    });
});

// PROJECT UPDATE ROUTE
router.put("/projects/:id/layout", middleware.isLoggedIn, function(req, res){
    Project.findByIdAndUpdate(req.params.id, req.body.project, function(err, updatedProject){
        if(err){
            console.log(err);
        } else {
            // req.flash("success", "Successfully added service");
            res.redirect("/projects/" + req.params.id + "/layout");
        }
    });
});

// PROJECT STATUS CHANGE ROUTE - IMPLEMENT
router.put("/projects/:id/implement", middleware.isLoggedIn, function(req, res){
    Project.findByIdAndUpdate(req.params.id, { $set: { status: "Implementation"} }, function(err, plannedProject){
        if(err){
            console.log(err);
        } else {
            res.redirect("/projects/" + req.params.id);
        }
    });
});

// PROJECT STATUS CHANGE ROUTE - RETIRED
router.put("/projects/:id/retire", middleware.isLoggedIn, function(req, res){
    Project.findByIdAndUpdate(req.params.id, { $set: { status: "Retired"} }, function(err, retiredProject){
        if(err){
            console.log(err);
        } else {
            res.redirect("/projects/" + req.params.id);
        }
    });
});

// PROJECT STATUS CHANGE ROUTE - COMPLETE
router.put("/projects/:id/complete", middleware.isLoggedIn, function(req, res){
    Project.findByIdAndUpdate(req.params.id, { $set: { status: "Completed"} }, function(err, completedProject){
        if(err){
            console.log(err);
        } else {
            // FIND AREA, UPDATE PRESENT SYSTEM AND PUSH OLD PRESENT SYSTEM TO PAST SYSTEMS
            Layer.findById(completedProject.layer, function(err, projectArea){
                if(err){
                    console.log(err);
                } else {
                    projectArea.systems.past.push(projectArea.systems.present);
                    projectArea.systems.present = completedProject.system;
                    projectArea.save();
                    // CLEAR FUTURE DRAFTS?
                    // REDIRECT
                    res.redirect("/projects/" + req.params.id);
                }
            });
        }
    });
});

// ADD PROJECT EDGE SYSTEM NEW
router.get("/projects/:id/addedgesystem", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            System.find({'owner.id': req.user._id}, function(err, foundSystems){
                if(err){
                    console.log(err);
                } else {
                    // SORT OUT MONOCULTURE SYSTEMS
                    var realSystems = [];
                    for(i=0;i<foundSystems.length;i++){
                        var systemNameSplit = foundSystems[i].name.split(" ");
                        if(!(systemNameSplit[systemNameSplit.length - 1] === "monoculture")){
                            realSystems.push(foundSystems[i]);
                        }
                    }
                    res.render("projects/addedgesystem", {project: foundProject, systems: realSystems});
                }
            });
        }
    });
});

// ADD PROJECT EDGE SYSTEM UPDATE
router.post("/projects/:id/addedgesystem", middleware.isLoggedIn, function(req, res){
    // FIND SYSTEM
    System.findById(req.body.systemid, function(err, foundSystem){
        if(err){
            console.log(err);
        } else {
            // FIND PROJECT
            Project.findByIdAndUpdate(req.params.id, { $set: { edgesystem: foundSystem} }, function(err, foundProject){
                if(err){
                    console.log(err);
                } else {
                    res.redirect("/projects/" + foundProject._id);
                }
            });
        }
    });
});

// PROJECT ASSET CREATION
router.get("/projects/:id/generateassets", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id).populate("system").populate("layer").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // FIND SYSTEM
            System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    // GENERATE ASSET PARAMS //
                    // GET GEOMETRY
                    var polygon = JSON.parse(foundProject.layer.geometry);
                    // CALIBRATE OFFSET
                    var boxCalibrate = bboxPolygon(bbox(polygon));
                    // TAKE TOP SIDE OF BOUNDING BOX
                    var lineCalibrate = turf.lineString([boxCalibrate.geometry.coordinates[0][2],boxCalibrate.geometry.coordinates[0][3]],{name: 'line-35'});
                    var lineOffsetCalibrate = buffer(lineCalibrate, 10, {units: "meters"});
                    var rotatedCalibrateLine = transformRotate(lineCalibrate, 90);
                    var splitCalibrateLine = lineSplit(rotatedCalibrateLine, lineCalibrate);
                    var distanceCalibrateLine = lineSplit(splitCalibrateLine.features[1], lineOffsetCalibrate);
                    var calibrateDistance = 10/(length(distanceCalibrateLine.features[0], {units: "meters"}));
                    console.log("Distance check " + calibrateDistance);
                    var offsetPolygon = buffer(polygon, - foundProject.headland*calibrateDistance, {units: "meters"});
                    // FIND SYSTEM ROWS
                    var allSpecies = [];
                    var dataset = [];
                    foundSystem.model.forEach(function(species){
                        allSpecies.push(species.species.nameCommon);
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
                    // HAVE ARRAY INSTEAD AND ONLY SELECT ROWS WITH TREES?!
                    var rowWidth = 0;
                    for(i=0;i<dataset.length;i++){
                        rowWidth = rowWidth + dataset[i].array[0].width;
                    }
                    var rowWidthArray = [];
                    var rowWidthArrayCount = 0;
                    var treeRowWidthArray = [];
                    for(i=0;i<dataset.length+1;i++){
                        // SET ROW LENGTHS
                        // IF FIRST ROW
                        if(i === 0){
                            if(dataset[i].array[0].species.form === "grass"){
                                rowWidthArrayCount = rowWidthArrayCount + dataset[i].array[0].width;
                            } else {
                                rowWidthArrayCount = rowWidthArrayCount + dataset[i].array[0].width/2;
                                rowWidthArray.push(rowWidthArrayCount);
                                rowWidthArrayCount = 0;
                                treeRowWidthArray.push(dataset[i].array[0].width);
                            }
                            // IF LAST ROW
                        } else if (i === dataset.length) {
                            rowWidthArrayCount = rowWidthArrayCount + dataset[i-1].array[0].width/2;
                            rowWidthArray.push(rowWidthArrayCount);
                            // FOR ALL OTHER ROWS
                        } else {
                            rowWidthArrayCount = rowWidthArrayCount + dataset[i].array[0].width/2 + dataset[i-1].array[0].width/2;
                            if(!(dataset[i].array[0].species.form === "grass")) {
                                rowWidthArray.push(rowWidthArrayCount);
                                rowWidthArrayCount = 0;
                                treeRowWidthArray.push(dataset[i].array[0].width);
                            }
                        }
                    }
                    console.log(rowWidthArray);
                    // DEFINE ALL VARIABLES I NEED FOR THE ROWS HERE, THEN MAKE IF STATEMENTS ON ALIGNMENT
                    var lengthLine;
                    var line;
                    var rowCount = 0;
                    var rowRest = 0;
                    if(foundProject.alignment === "bearing"){
                        // -------- ANGLED ROWS ---------
                        var lengthLineBearing = turf.lineString([offsetPolygon.geometry.coordinates[0][foundProject.bearing],offsetPolygon.geometry.coordinates[0][foundProject.bearing + 1]],{name: 'bearingline'});
                        // SCALE LINE
                        line = transformScale(lengthLineBearing, 6);
                        // ALTERNATIVE BOUNDING BOX LENTH LINE
                        var lineBearing = rhumbBearing(lengthLineBearing.geometry.coordinates[0],lengthLineBearing.geometry.coordinates[1]);
                        console.log(lineBearing);
                        var rotatedpolygon = transformRotate(offsetPolygon, 90-lineBearing);
                        var bboxOffsetPolygon = bboxPolygon(bbox(rotatedpolygon));
                        console.log(bboxOffsetPolygon.geometry.coordinates[0][1]);
                        console.log(bboxOffsetPolygon.geometry.coordinates[0][2]);
                        var lengthLineOffsetRotatedPolygon = turf.lineString([bboxOffsetPolygon.geometry.coordinates[0][1],bboxOffsetPolygon.geometry.coordinates[0][2]],{name: 'line-10'});
                        console.log(length(lengthLineOffsetRotatedPolygon, {units: "meters"}) + " meter length");
                        /*// CREATE ANGLED LENGTH LINE
                        var rotatedLine = transformRotate(line, 90);
                        var splitLines = lineSplit(rotatedLine, line);
                        // SET LENGTH LINE
                        var lengthLineSplit = lineSplit(splitLines.features[0], offsetPolygon);
                        lengthLine = lengthLineSplit.features[1];
                        console.log(splitLines.features[0]);
                        console.log(Math.floor((length(lengthLine, {units: "meters"}))));*/
                        rowCount = Math.floor((length(lengthLineOffsetRotatedPolygon, {units: "meters"}))/rowWidth);
                        rowRest = (((length(lengthLineOffsetRotatedPolygon, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
                        console.log(rowCount);
                        console.log("rest " + rowRest);
                        // -------- ANGLED ROWS ---------
                    } else {
                        // -------- NORTH/SOURTH ROWS ---------
                        // CREATE BOUNDING BOX (IF ANGLE IS 0)
                        var box = bboxPolygon(bbox(offsetPolygon));
                        // TAKE TOP SIDE OF BOUNDING BOX
                        lengthLine = turf.lineString([box.geometry.coordinates[0][2],box.geometry.coordinates[0][3]],{name: 'line-0'});
                        // ESTIMATE AMOUNT OF ROWS
                        console.log((length(lengthLine, {units: "meters"})));
                        rowCount = Math.floor((length(lengthLine, {units: "meters"}))/rowWidth);
                        rowRest = (((length(lengthLine, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
                        console.log("rest " + rowRest);
                        console.log(rowCount);
                        // CREATE ROW LINE
                        line = turf.lineString([box.geometry.coordinates[0][3],box.geometry.coordinates[0][4]],{name: 'line-1'});
                        // -------- NORTH/SOURTH ROWS ---------
                    }
                    // CREATE ROW ARRAY
                    var rowArray = [];
                    var distance = 0;
                    var distanceArray = rowWidthArray;
                    // OFFSET AND CREATE NEW LINE FOR EACH ROW - NB. WORKS BECAUSE -1 CANCELS < rowCount BY 1.
                    for(i=0;i<rowCount;i++){
                        // DO IF FIRST COUNT?
                        for(j=0;j<distanceArray.length;j++){
                            // DO IF FIRST ROW, DON'T ADD DISTANCE
                            if(j === distanceArray.length - 1){
                                distance = distance + distanceArray[j];
                            } else if (i === 0 && j === 0) {
                                // START FIRST ROW AT 0
                                distance = 0.01;
                                var bufferLine1 = buffer(line, (distance*calibrateDistance), {units: "meters"});
                                var rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
                                if((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0)){
                                    var row1 = turf.lineString([[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]],[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]]],{name: "line-0" + i });
                                } else {
                                    var row1 = turf.lineString([[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]],[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]]],{name: "line-0" + i });
                                }
                                rowArray.push(row1);
                            } else {
                                distance = distance + distanceArray[j];
                                var bufferLine1 = buffer(line, (distance*calibrateDistance), {units: "meters"});
                                var rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
                                if((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0 || rowPoints1.features[0].geometry.coordinates[1] > rowPoints1.features[1].geometry.coordinates[1])){
                                    var row1 = turf.lineString([[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]],[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]]],{name: "line-0" + i });
                                } else {
                                    var row1 = turf.lineString([[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]],[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]]],{name: "line-0" + i });
                                }
                                rowArray.push(row1);
                            }
                        }
                    }
                    // ADD LAST ROWS IF THERE IS SOME MISSING
                    var countWidth = 0;
                    for(i=0;i<distanceArray.length;i++){
                        countWidth = countWidth + distanceArray[i];
                        if(countWidth < rowRest){
                            var bufferLine2 = buffer(line, ((distance+countWidth)*calibrateDistance), {units: "meters"});
                            var rowPoints2 = lineIntersect(bufferLine2, offsetPolygon);
                            // CHECK IF ROWS CROSS MEDIAN LINE (GOES FROM NEGATIVE TO POSITIVE)
                            if((rowPoints2.features[0].geometry.coordinates[0] < 0 && rowPoints2.features[1].geometry.coordinates[0] > 0) || (rowPoints2.features[0].geometry.coordinates[0] > 0 && rowPoints2.features[1].geometry.coordinates[0] < 0) || rowPoints2.features[0].geometry.coordinates[1] > rowPoints2.features[1].geometry.coordinates[1]){
                                var row2 = turf.lineString([[rowPoints2.features[1].geometry.coordinates[0],rowPoints2.features[1].geometry.coordinates[1]],[rowPoints2.features[0].geometry.coordinates[0],rowPoints2.features[0].geometry.coordinates[1]]],{name: "line-1" + i });
                            } else {
                                var row2 = turf.lineString([[rowPoints2.features[0].geometry.coordinates[0],rowPoints2.features[0].geometry.coordinates[1]],[rowPoints2.features[1].geometry.coordinates[0],rowPoints2.features[1].geometry.coordinates[1]]],{name: "line-1" + i });
                            }
                            rowArray.push(row2);
                        }
                    }
                    for (i=0;i<rowArray.length;i++){
                        console.log(rowArray[i].geometry.coordinates);
                    }
                    // PUSH TO ROW ARRAY
                    // CREATE FEATURECOLLECTION FOR ROWS
                    var featurecollection = turf.featureCollection(rowArray);
                    var collection = JSON.stringify(featurecollection);
                    // OFFSET LINE
                    // CLEAN DATASET FROM ANNUALS - ONLY WORKS IF ANNUALS IN FIRST POSITION
                    var treeRows = [];
                    for(i=0;i<dataset.length;i++){
                        if(!(dataset[i].array[0].species.form === "grass")){
                            treeRows.push(dataset[i]);
                        }
                    }
                    // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
                    var treeRowCount = 0;
                    var treeCountArray = [];
                    var treeMarkerArray = [];
                    var treeArray = [];
                    var treeRowArea = 0;
                    for(i=0;i<rowArray.length;i++){
                        // COUNT SYSTEM MODEL ITERATIONS IN ROW
                        var rowLength = length(rowArray[i], {units: "meters"});
                        // IF POSITION y IS 1, USE NEXT ROW TO FIND SYSTEM MODEL LENGTH?! THIS IS ONLY TEMP SOLUTION
                        var systemModelLength = 0;
                        if(dataset[0].array[(dataset[0].array.length - 1)].position[1] <= 1){
                            systemModelLength = dataset[1].array[(dataset[1].array.length - 1)].position[1];
                        } else {
                            systemModelLength = dataset[0].array[(dataset[0].array.length - 1)].position[1];
                        }                        var systemModelCount = Math.floor(rowLength/systemModelLength);
                        var systemModelRowRest = ((rowLength/systemModelLength) - Math.floor(rowLength/systemModelLength))*systemModelLength;
                        // CALCULATE AREA
                        treeRowArea = treeRowArea + rowLength * treeRows[treeRowCount].array[0].width;
                        // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
                        treeArray.push(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species);
                        var firstTreeMarker = turf.point(rowArray[i].geometry.coordinates[0]);
                        var firstAsset = {
                            species: treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species.id,
                            lat: firstTreeMarker.geometry.coordinates[0],
                            lng: firstTreeMarker.geometry.coordinates[1],
                            name: treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species.nameCommon
                        };
                        treeMarkerArray.push(firstAsset);
                        // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
                        for(j=0;j<systemModelCount;j++){
                            for(k=0;k<treeRows[treeRowCount].array.length;k++){
                                // CREATE COORDINATES FOR THE TREE
                                var treeMarker = along(rowArray[i], (j*systemModelLength + treeRows[treeRowCount].array[k].position[1]), {units: "meters"});
                                // CREATE ASSET OBJECT
                                var asset = {
                                    species: treeRows[treeRowCount].array[k].species.id,
                                    lat: treeMarker.geometry.coordinates[0],
                                    lng: treeMarker.geometry.coordinates[1],
                                    name: treeRows[treeRowCount].array[k].species.nameCommon
                                };
                                // ADD TREE OBJECT TO ARRAY
                                treeMarkerArray.push(asset);
                            }
                        }
                        // ADD REST
                        for(j=0;j<treeRows[treeRowCount].array.length;j++){
                            if(treeRows[treeRowCount].array[j].position[1] < systemModelRowRest){
                                treeArray.push(treeRows[treeRowCount].array[j].species);
                                // ADD POINT MARKER FOR REMAINING TREES
                                var treeMarker2 = along(rowArray[i], (systemModelCount*systemModelLength + treeRows[treeRowCount].array[j].position[1]), {units: "meters"});
                                var asset2 = {
                                    species: treeRows[treeRowCount].array[j].species.id,
                                    lat: treeMarker2.geometry.coordinates[0],
                                    lng: treeMarker2.geometry.coordinates[1],
                                    name: treeRows[treeRowCount].array[j].species.nameCommon
                                };
                                // ADD TREE OBJECT TO ARRAY
                                treeMarkerArray.push(asset2);
                            }
                        }
                        // ALIGN ROW ARRAY WITH SYSTEM ROWS (I.E. START NEW ROW MODEL COUNT.) AND REST LAST ROW
                        if(treeRowCount >= treeRows.length - 1 || i === rowArray.length - 2){
                            treeRowCount = 0;
                        } else {
                            treeRowCount = treeRowCount + 1;
                        }
                    }
                    console.log(treeArray.length);
                    console.log(treeMarkerArray.length);
                    // CREATE ASSETS
                    Asset.insertMany(treeMarkerArray, function(err, createdAssets){
                        if(err){
                            console.log(err);
                        } else {
                            console.log(createdAssets.length);
                            Project.findByIdAndUpdate(foundProject._id, { $push: { assets: { $each: createdAssets } } }, function(err, updatedProject){
                                if(err){
                                    console.log(err);
                                } else {
                                    console.log("Assets added to project");
                                    res.redirect("/projects/" + req.params.id);
                                }
                            });
                        }
                    });
                    /*for(i=1;i<5;i++){
                        // CREATE ASSET
                        console.log("1");
                        Asset.create(treeMarkerArray[i], function(err, createdAsset){
                            if(err){
                                console.log(err);
                            } else {
                                // SAVE TO PROJECT
                                foundProject.assets.push(createdAsset);
                                foundProject.save();
                            }
                        });
                    }*/
                }
            });
        }
    });
});

// PROJECT ASSET SHOW PAGE
router.get("/projects/:id/assets", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id).populate("assets").populate("layer").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            var allTrees = [];
            var allTreesArray = [];
            // GENERATE ASSET CIRCLES
            var treeCanopyArray = [];
            for(i=0;foundProject.assets.length > i;i++){
                var point = turf.point([foundProject.assets[i].lat, foundProject.assets[i].lng]);
                var circle1 = circle(point.geometry.coordinates, 2, {units: "meters"});
                allTrees.push(foundProject.assets[i].name);
                allTreesArray.push(foundProject.assets[i].name);
                treeCanopyArray.push(circle1);
            }
            var treeMarkers = turf.featureCollection(treeCanopyArray);
            var treeCollection = JSON.stringify(treeMarkers);
            // UNIQUE TREE SPECIES
            var uniqueSpecies = unique(allTrees);
            // UNIQUE SPECIES COUNTS
            var uniqueSpeciesCount = [];
            for(i=0;uniqueSpecies.length > i;i++){
                var count = 0;
                for(j = 0; j < allTreesArray.length; j++){
                    if(allTreesArray[j] === uniqueSpecies[i]){
                        count = count + 1;
                    }
                }
                speciesCount = {
                    name: uniqueSpecies[i],
                    uniqueCount: count
                };
                uniqueSpeciesCount.push(speciesCount);
            }
            console.log(uniqueSpeciesCount);
            res.render("projects/assets", {project: foundProject, trees: treeCollection, treecounts: uniqueSpeciesCount});
        }
    });
});

// SERVICES DELETE ROUTE
router.delete("/projects/:id", middleware.isLoggedIn, function(req, res){ // MAKE PROJECT OWNERSHIP MIDDLEWARE
    // FIND PROJECT FIRST FOR REFERENCES
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // REMOVE PROJECT REFERENCE FROM LAYER
            Layer.findByIdAndUpdate(foundProject.layer, { $pull: {projects: foundProject._id}}, function(err, updatedLayer){
                if(err){
                    console.log(err);
                } else {
                    console.log("project removed from layer");
                    // DELETE BUDGET(S)
                    Budget.findByIdAndRemove(foundProject.budgets.establishment, function(err){
                        if(err){
                            console.log(err);
                        } else {
                            console.log("establishment budget deleted from project");
                            Budget.findByIdAndRemove(foundProject.budgets.management, function(err){
                                if(err){
                                    console.log(err);
                                } else {
                                    console.log("management budget deleted from project");
                                    // DELETE ACTIVITIES
                                    foundProject.activities.forEach(function(activity){
                                        Activity.findByIdAndRemove(activity, function(err){
                                            if(err){
                                                console.log(err);
                                            }
                                        });
                                    });
                                    // DELETE PROJECT
                                    Project.findByIdAndRemove(req.params.id, function(err){
                                        if(err){
                                            console.log(err);
                                            res.redirect("/projects");
                                        } else {
                                            console.log("project deleted");
                                            res.redirect("/projects");
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

// LAYER PROJECT NEW ROUTE WITH SYSTEM REF
router.get("/layers/:id/projects/new/:system", middleware.isLoggedIn, function(req, res){ // CHECK OWNERSHIP!!!
    // FIND LAYER ID
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err) {
            console.log(err);
            // res.flash(err);
        } else {
            System.findById(req.params.system, function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    res.render("projects/new", {layer: foundLayer, system: foundSystem});
                }
            });
        }
    });
});

// LAYER PROJECT CREATE ROUTE
router.post("/layers/:id/projects", middleware.isLoggedIn, function(req, res){
    // Lookup place using id
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err) {
            console.log(err);
            res.redirect("/layers/" + req.params.id);
        } else {
            Project.create(req.body.project, function(err, createdProject) {
                if (err) {
                    console.log(err);
                } else {
                    // FIND SYSTEM AND ADD TO PROJECT
                    System.findById(req.body.systemid).populate("model.species").exec(function(err, foundSystem){
                        if(err){
                            console.log(err);
                        } else {
                            // CREATE CURRENCY
                            // ADD PROJECT STUFF
                            createdProject.owner.id = req.user._id;
                            createdProject.owner.username = req.user.username;
                            createdProject.system = foundSystem;
                            createdProject.layer = foundLayer;
                            createdProject.financial = {
                                discountRate: 0.05,
                                period: 20
                            };
                            createdProject.status = "planning";
                            // Save the service
                            createdProject.save();
                            // Connect new service to place
                            foundLayer.projects.push(createdProject);
                            foundLayer.save();
                            res.redirect("/projects/" + createdProject._id);
                        }
                    });
                }
            });
        }
    });
});

// PROJECT ASSETS DELETE ROUTE
router.delete("/projects/:id/allassets", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // FIND ASSETS AND DELETE
            for(i=0;foundProject.assets.length > i;i++){
                foundProject.assets.remove(foundProject.assets[i]);
                // SAVE PROJECT
                foundProject.save();
                // DELETE ASSET
                Asset.findByIdAndRemove(foundProject.assets[i], function(err){
                    if(err){
                        console.log(err);
                    } else {
                        console.log("Deleted asset");
                    }
                });
            }
            res.redirect("/projects/" + foundProject.id);
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

module.exports = router;