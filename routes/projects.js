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
    Project.findById(req.params.id).populate("layer").populate("budgets.establishment").populate("budgets.management").populate("system").populate("activities").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            totalEstablishment = 0;
            for(i=0;i<foundProject.budgets.establishment.postings.length;i++){
                if(foundProject.budgets.establishment.postings[i].postType === "labor" || foundProject.budgets.establishment.postings[i].postType === "material"){
                    totalEstablishment = totalEstablishment - (foundProject.budgets.establishment.postings[i].value * foundProject.budgets.establishment.postings[i].amount);
                } else if(foundProject.budgets.establishment.postings[i].postType === "product" || foundProject.budgets.establishment.postings[i].postType === "service"){
                    totalEstablishment = totalEstablishment + (foundProject.budgets.establishment.postings[i].value * foundProject.budgets.establishment.postings[i].amount);
                }
            }
            totalManagement = 0;
            if(foundProject.budgets.management){
                for(i=0;i<foundProject.budgets.management.postings.length;i++){
                    if(foundProject.budgets.management.postings[i].postType === "labor" || foundProject.budgets.management.postings[i].postType === "material"){
                        totalManagement = totalManagement - (foundProject.budgets.management.postings[i].value * foundProject.budgets.management.postings[i].amount);
                    } else if(foundProject.budgets.management.postings[i].postType === "product" || foundProject.budgets.management.postings[i].postType === "service"){
                        totalManagement = totalManagement + (foundProject.budgets.management.postings[i].value * foundProject.budgets.management.postings[i].amount);
                    }
                }
            }
            irr = 0;
            for(i=0;i<foundProject.financial.period;i++){
                irr = irr + (totalManagement)/(1+foundProject.financial.discountRate)^i;
            }
            irr = irr - totalEstablishment;
            res.render("projects/show", {project: foundProject, irr: irr});
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
    Project.findById(req.params.id).populate("system").populate("layer").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
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
                        }
                    }
                }
                console.log(rowWidthArray);
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
                    var lengthLineBearing = turf.lineString([offsetPolygon.geometry.coordinates[0][4],offsetPolygon.geometry.coordinates[0][5]],{name: 'bearingline'});
                    // SCALE LINE
                    line = transformScale(lengthLineBearing, 6);
                    // CREATE ANGLED LENGTH LINE
                    var rotatedLine = transformRotate(line, 90);
                    var splitLines = lineSplit(rotatedLine, line);
                    // SET LENGTH LINE
                    var lengthLineSplit = lineSplit(splitLines.features[0], offsetPolygon);
                    lengthLine = lengthLineSplit.features[1];
                    console.log(splitLines.features[0]);
                    rowCount = Math.floor((length(lengthLine, {units: "meters"}))/rowWidth);
                    rowRest = (((length(lengthLine, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
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
                            distance = 0.001;
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
                            if((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0)){
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
                        if((rowPoints2.features[0].geometry.coordinates[0] < 0 && rowPoints2.features[1].geometry.coordinates[0] > 0) || (rowPoints2.features[0].geometry.coordinates[0] > 0 && rowPoints2.features[1].geometry.coordinates[0] < 0)){
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
/*
                console.log(treeRows);
*/
                // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
                var treeRowCount = 0;
                var treeCountArray = [];
                var treeMarkerArray = [];
                var treeArray = [];
                for(i=0;i<rowArray.length;i++){
                    // COUNT SYSTEM MODEL ITERATIONS IN ROW
                    var rowLength = length(rowArray[i], {units: "meters"});
                    var systemModelLength = dataset[0].array[(dataset[0].array.length - 1)].position[1];
                    var systemModelCount = Math.floor(rowLength/systemModelLength);
                    var systemModelRowRest = ((rowLength/systemModelLength) - Math.floor(rowLength/systemModelLength))*systemModelLength;
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
                    if(treeRowCount >= treeRows.length - 1 || i === rowArray.length - 2){
                        treeRowCount = 0;
                    } else {
                        treeRowCount = treeRowCount + 1;
                    }
                }
                console.log(treeArray.length);
                console.log(treeMarkerArray.length);
                // DO POINT COLLECTION
                var treeCanopyArray = [];
                for(i=0;i<treeMarkerArray.length;i++){
                    var circle1 = circle(treeMarkerArray[i].geometry.coordinates, 2, {units: "meters"});
                    treeCanopyArray.push(circle1);
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
                res.render("projects/layout", {project: foundProject, system: foundSystem, collection: collection, trees: treeCollection, species: uniqueSpeciesCount, rowWidth: rowWidth});
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

// PROJECT STATUS CHANGE ROUTE


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
                            var budgetEstablishment = {
                                currency: "usd",
                                name: "Establishment budget"
                            };
                            Budget.create(budgetEstablishment, function(err, createdBudget){
                                if(err){
                                    console.log(err);
                                } else {
                                    // BUDGET OWNER
                                    createdBudget.owner.id = req.user._id;
                                    createdBudget.owner.username = req.user.username;
                                    createdBudget.save();
                                    // ADD PROJECT STUFF
                                    createdProject.owner.id = req.user._id;
                                    createdProject.owner.username = req.user.username;
                                    createdProject.system = foundSystem;
                                    createdProject.layer = foundLayer;
                                    createdProject.financial = {
                                        discountRate: 0.05,
                                        period: 20
                                    };
                                    createdProject.headland = 0;
                                    createdProject.budgets.establishment = createdBudget;
                                    createdProject.status = "planning";
                                    // Save the service
                                    createdProject.save();
                                    // Connect new service to place
                                    foundLayer.projects.push(createdProject);
                                    foundLayer.save();
                                    // CREATE POSTINGS
                                    // FIND ALL SPECIES IN PROJECT SYSTEM
                                    var allSpecies = [];
                                    foundSystem.model.forEach(function(species){
                                        allSpecies.push(species.species.id);
                                    });
                                    // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                                    var uniqueSpecies = unique(allSpecies);
                                    Species.find({"_id": uniqueSpecies}, function(err, foundSpecies){
                                        if(err) {
                                            console.log(err);
                                        } else {
                                            var activities = [];
                                            var postings = [];
                                            for(i=0;foundSpecies.length > i;i++){
                                                for(j=0;foundSpecies[i].activities.length > j;j++){
                                                    // CHECK IF ESTABLISHMENT - DIFFERENTIATE ACTIVITIES
                                                    if(foundSpecies[i].activities[j].activityType === "establish"){
                                                        var activity = {
                                                            name: foundSpecies[i].activities[j].name + " " + foundSpecies[i].nameCommon,
                                                            automated: true,
                                                            status: true
                                                        };
                                                        activities.push(activity);
                                                    }
                                                }
                                                var posting = {
                                                    name: foundSpecies[i].nameCommon + " plants",
                                                    postType: "material",
                                                    amount: 1,
                                                    value: 1
                                                };
                                                if(foundSpecies[i].price > 0){
                                                    posting.value = foundSpecies[i].price;
                                                }
                                                postings.push(posting);
                                            }
                                            /*// CREATE ACTIVITIES
                                            activities.forEach(function(activity){
                                                Activity.create(activity, function(err, createdActivity){
                                                    if(err){
                                                        console.log(err);
                                                    } else {
                                                        createdActivity.owner.id = req.user._id;
                                                        createdActivity.owner.username = req.user.username;
                                                        createdActivity.save();
                                                        // PUSH TO PROJECT
                                                        createdProject.activities.push(createdActivity);
                                                        createdProject.save();
                                                    }
                                                });
                                            });*/
                                            // SAVE POSTINGS
                                            Budget.findByIdAndUpdate(createdBudget._id, {$addToSet: {postings: { $each: postings }}}, function(err, updatedBudget){
                                                if(err){
                                                    console.log(err);
                                                } else {
                                                    var budgetManagement = {
                                                        currency: "usd",
                                                        name: "Management budget"
                                                    };
                                                    Budget.create(budgetManagement, function(err, createdManagementBudget){
                                                        if(err){
                                                            console.log(err);
                                                        } else {
                                                            // BUDGET OWNER
                                                            createdManagementBudget.owner.id = req.user._id;
                                                            createdManagementBudget.owner.username = req.user.username;
                                                            createdManagementBudget.save();
                                                            // SET AS PROJECT BUDGET
                                                            createdProject.budgets.management = createdManagementBudget;
                                                            createdProject.save();
                                                            // req.flash("success", "Successfully added comment");
                                                            res.redirect("/projects/" + createdProject._id);
                                                        }
                                                    })
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
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

module.exports = router;