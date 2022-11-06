var express = require("express");
var router = express.Router();
var unique = require("array-unique");
import Budget from "../models/budget";
import Project from "../models/project";
import System from "../models/system";
import Posting from "../models/posting";
import Parcel from "../models/parcel";
var middleware = require("../middleware");
var gisObj = require("../middleware/gis");

import {area} from "@turf/turf"


// BUDGET INDEX ROUTE

// BUDGET NEW ROUTE

// BUDGET CREATE ROUTE

// BUDGET SHOW ROUTE
router.get("/budgets/:id", middleware.isLoggedIn, function(req, res){ // CHECK OWNERSHIP ASAP
    Budget.findById(req.params.id).populate("postings").exec(function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            // FIND BUDGET LENGTH
            var years = 0;
            // CREATE ARRAY TO STORE ANNUAL TOTALS AND POSTINGS
            var postingsArray: any[] = [];
            // SET YEARS
            for(let i=0;i<foundBudget.postings.length;i++){
                // IF YEAR IS LARGER, ADD TO YEARS
                if(foundBudget.postings[i].year > years){
                    years = foundBudget.postings[i].year;
                }
            }
            // SET ARRAY LENGTH
            for(let i=0;i<years;i++){
                var year = {
                    year: i + 1,
                    postings: Array,
                    total: 0
                };
                postingsArray.push(year);
            }
            // CHECK IF COST OR INCOME
            for(let i=0;i<foundBudget.postings.length;i++){
                for(let j=0;j<postingsArray.length;j++){
                    // CHECK IF SAME YEAR
                    if(foundBudget.postings[i].year === postingsArray[j].year){
                        // CHECK IF COST OR INCOME
                        if(foundBudget.postings[i].postType === "labor" || foundBudget.postings[i].postType === "material"){
                            postingsArray[j].total = postingsArray[j].total - (foundBudget.postings[i].value * foundBudget.postings[i].amount);
                        } else if(foundBudget.postings[i].postType === "product" || foundBudget.postings[i].postType === "service"){
                            postingsArray[j].total = postingsArray[j].total + (foundBudget.postings[i].value * foundBudget.postings[i].amount);
                        }
                    }
                }
            }
            res.render("budgets/show", {budget: foundBudget, total: postingsArray, years: years});
        }
    });
});

// BUDGET EDIT ROUTE
router.get("/budgets/:id/edit", middleware.isLoggedIn, function(req, res){
    Budget.findById(req.params.id, function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            res.render("budgets/edit", {budget: foundBudget});
        }
    });
});

// BUDGET UPDATE ROUTE
router.post("/budgets/:id", middleware.isLoggedIn, function(req, res){
    Budget.findByIdAndUpdate(req.params.id, req.body.budget, function(err, updatedBudget){
        if(err){
            console.log(err);
        } else {
            res.redirect("/budgets/" + updatedBudget._id);
        }
    });
});

// BUDGET DELETE ROUTE

// PARCEL BUDGET SHOW ROUTE
router.get("/parcels/:id/accounts", middleware.isLoggedIn, function(req, res){
    Parcel.findById(req.params.id).populate({path:'layers', populate:{path: 'accounts', populate:{path: 'postings'}}}).exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            res.render("accounts", {parcel: foundParcel});
        }
    });
});

// PARCEL BUDGET

// PROJECT BUDGET NEW ROUTE
router.get("/projects/:id/budgets/new", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id).populate("system").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    // FIND ALL SPECIES IN SYSTEM
                    var allSpecies: any[] = [];
                    foundSystem.model.forEach(function(species){
                        allSpecies.push(species.species);
                    });
                    // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                    var uniqueSpecies = unique(allSpecies);
                    res.render("budgets/new", {project: foundProject, species: uniqueSpecies});
                }
            });
        }
    });
});

// PROJECT BUDGET CREATE ROUTE
router.post("/projects/:id/budgets", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            Budget.create(req.body.budget, function(err, createdBudget){
                if(err){
                    console.log(err);
                } else {
                    // BUDGET OWNER
                    createdBudget.owner.id = req.user._id;
                    createdBudget.owner.username = req.user.username;
                    createdBudget.save();
                    // SAVE BUDGET TO PROJECT
                    foundProject.budget = createdBudget;
                    foundProject.save();
                    res.redirect("/projects/" + foundProject._id);
                }
            });
        }
    });
});

// GENERATE NEW PROJECT ESTABLISHMENT BUDGET
router.get("/projects/:id/generateestablishment", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id).populate("system").populate({path:'rows', populate:{path:'sequence', populate:{path:'model.species'}}}).exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    // FIND ALL SPECIES IN SYSTEM OR ROWS
                    var allSpecies: any[] = [];
                    if(foundProject.rows && foundProject.rows.length > 0){
                        for(let i=0;i<foundProject.rows.length;i++){
                            if(foundProject.rows[i].sequence){
                                for(let j=0;j<foundProject.rows[i].sequence.model.length;j++){
                                    allSpecies.push(foundProject.rows[i].sequence.model[j].species);
                                }
                            }
                        }
                    } else {
                        foundSystem.model.forEach(function(species){
                            if(species.species.form === "grass" || species.species.form === "herb") {
                                // DO NOTHING XD
                            } else {
                                allSpecies.push(species.species);
                            }
                        });
                    }
                    console.log("All species length: " + allSpecies.length);
                    // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                    var uniqueSpecies = unique(allSpecies);
                    // SEND ARRAY OF SUBTYPES
                    var subtypes = ["bed", "plant", "method"];
                    res.render("budgets/establishnew", {project: foundProject, species: uniqueSpecies, subtypes: subtypes});
                }
            });
        }
    });
});

// GENERATE ESTABLISHMENT BUDGET CREATE ROUTE
router.post("/projects/:id/generateestablishment", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id).populate("layer").populate({path:'system', populate:{path:'model.species'}}).populate({path:'rows', populate:{path:'sequence', populate:{path:'model.species'}}}).populate({path:'areas', populate:{path:'rotation', populate:{path:'model.speciesmix.species'}}}).exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // CREATE BUDGET AND PLACE IN PROJECT
            var budget = req.body.budget;
            Budget.create(budget, function(err, createdBudget){
                if(err){
                    console.log(err);
                } else {
                    foundProject.budgets.establishment = createdBudget;
                    foundProject.save();
                    // PARSE QUERY
                    var speciesPostings = req.body.speciespostings;
                    var speciesPostingsArray: any[] = [];
                    for(let i=0;i<speciesPostings.length;i++){
                        // REMOVE NONE ONES
                        if(!(speciesPostings[i] === "none")){
                            var splitPostings = speciesPostings[i].split(" ");
                            speciesPostingsArray.push(splitPostings);
                        }
                    }
                    console.log(speciesPostingsArray);
                    // FIND SYSTEM
                    System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                        if(err){
                            console.log(err);
                        } else {
                            /*// UNIQUE SPECIES
                            var allSpecies = [];
                            foundSystem.model.forEach(function(species){
                                allSpecies.push(species.species);
                            });
                            var uniqueSpecies = unique(allSpecies);
                            // SOMEWHERE CALCULATE TREE COUNT
                            //////////////////////
                            //////////////////////
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
                            var calibrateDistance = 10/(turfLength(distanceCalibrateLine.features[0], {units: "meters"}));
                            console.log("Distance check " + calibrateDistance);
                            // CREATE HEADLAND + PERIMETER SYSTEM WIDTH
                            var headland = foundProject.headland;
                            var offsetPolygon = buffer(polygon, - headland*calibrateDistance, {units: "meters"});
                            // FIND SYSTEM ROWS
                            var allSpeciesv = [];
                            var dataset = [];
                            foundSystem.model.forEach(function(species){
                                allSpeciesv.push(species.species.nameCommon);
                                var count = 0;
                                for(let i=0;i<dataset.length;i++){
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
                            for(let i=0;i<dataset.length;i++){
                                dataset[i].array.sort(compare1);
                            }
                            // SAVE DATASET
                            foundSystem.sortedrows = dataset;
                            // SET ROW WIDTH - ACTUALLY START BY SETTING TO SYSTEM WIDTH
                            // HAVE ARRAY INSTEAD AND ONLY SELECT ROWS WITH TREES?!
                            var rowWidth = 0;
                            for(let i=0;i<dataset.length;i++){
                                rowWidth = rowWidth + dataset[i].array[0].width;
                            }
                            var rowWidthArray: any[] = [];
                            var rowWidthArrayCount = 0;
                            var treeRowWidthArray: any[] = [];
                            for(let i=0;i<dataset.length+1;i++){
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
                                console.log(turfLength(lengthLineOffsetRotatedPolygon, {units: "meters"}) + " meter length");
                                /!*!// CREATE ANGLED LENGTH LINE
                                var rotatedLine = transformRotate(line, 90);
                                var splitLines = lineSplit(rotatedLine, line);
                                // SET LENGTH LINE
                                var lengthLineSplit = lineSplit(splitLines.features[0], offsetPolygon);
                                lengthLine = lengthLineSplit.features[1];
                                console.log(splitLines.features[0]);
                                console.log(Math.floor((turfLength(lengthLine, {units: "meters"}))));*!/
                                rowCount = Math.floor((turfLength(lengthLineOffsetRotatedPolygon, {units: "meters"}))/rowWidth);
                                rowRest = (((turfLength(lengthLineOffsetRotatedPolygon, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
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
                                console.log((turfLength(lengthLine, {units: "meters"})));
                                rowCount = Math.floor((turfLength(lengthLine, {units: "meters"}))/rowWidth);
                                rowRest = (((turfLength(lengthLine, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
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
                                console.log((turfLength(lengthLine, {units: "meters"})));
                                rowCount = Math.floor((turfLength(lengthLine, {units: "meters"}))/rowWidth);
                                rowRest = (((turfLength(lengthLine, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
                                console.log("rest " + rowRest);
                                console.log(rowCount);
                                // CREATE ROW LINE
                                line = turf.lineString([box.geometry.coordinates[0][2],box.geometry.coordinates[0][3]],{name: 'line-1'});
                                // -------- WEST/EAST ROWS ---------
                            }
                            // CREATE ROW ARRAY
                            var rowArray: any[] = [];
                            var distance = 0;
                            var distanceArray = rowWidthArray;
                            // OFFSET AND CREATE NEW LINE FOR EACH ROW - NB. WORKS BECAUSE -1 CANCELS < rowCount BY 1.
                            for(let i=0;i<rowCount;i++){
                                // DO IF FIRST COUNT?
                                for(let j=0;j<distanceArray.length;j++){
                                    // DO IF FIRST ROW, DON'T ADD DISTANCE
                                    if(j === distanceArray.length - 1){
                                        distance = distance + distanceArray[j];
                                    } else if (i === 0 && j === 0) {
                                        // START FIRST ROW AT 0
                                        distance = 0.01;
                                        var bufferLine1 = buffer(line, (distance*calibrateDistance), {units: "meters"});
                                        var rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
                                        console.log("Row point count: " + rowPoints1.features.length);
                                        // DO IF HERE TO CHECK SEPARATE ROWS

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
                                        console.log("Row point count: " + rowPoints1.features.length);
                                        // DO IF HERE TO CHECK SEPARATE ROWS
                                        for(let k=0;k<rowPoints1.features.length;k+=2){
                                            if((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0 || rowPoints1.features[0].geometry.coordinates[1] > rowPoints1.features[1].geometry.coordinates[1])){
                                                var row1 = turf.lineString([[rowPoints1.features[k+1].geometry.coordinates[0],rowPoints1.features[k+1].geometry.coordinates[1]],[rowPoints1.features[k].geometry.coordinates[0],rowPoints1.features[k].geometry.coordinates[1]]],{name: "line-0" + i });
                                            } else {
                                                var row1 = turf.lineString([[rowPoints1.features[k].geometry.coordinates[0],rowPoints1.features[k].geometry.coordinates[1]],[rowPoints1.features[k+1].geometry.coordinates[0],rowPoints1.features[k+1].geometry.coordinates[1]]],{name: "line-0" + i });
                                            }
                                            rowArray.push(row1);
                                        }
                                    }
                                }
                            }
                            // ADD LAST ROWS IF THERE IS SOME MISSING
                            var countWidth = 0;
                            for(let i=0;i<distanceArray.length;i++){
                                countWidth = countWidth + distanceArray[i];
                                if(countWidth < rowRest){
                                    var bufferLine2 = buffer(line, ((distance+countWidth)*calibrateDistance), {units: "meters"});
                                    var rowPoints2 = lineIntersect(bufferLine2, offsetPolygon);
                                    console.log("Row point count: " + rowPoints2.features.length);
                                    // DO IF HERE TO CHECK SEPARATE ROWS
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
                            var rowLengthArray: any[] = [];
                            for (i=0;i<rowArray.length;i++){
                                var rowLength1 = turfLength(rowArray[i], {units: "meters"});
                                rowLengthArray.push(rowLength1);
                                /!*
                                                    console.log(rowArray[i].geometry.coordinates);
                                *!/
                            }
                            var treeRows = [];
                            for(let i=0;i<dataset.length;i++){
                                if(!(dataset[i].array[0].species.form === "grass")){
                                    treeRows.push(dataset[i]);
                                }
                            }
                            // CYCLE THROUGH ALL ROWS TO FIND SYSTEM LENGTH
                            var systemModelLength = 0;
                            for(let i=0;i<dataset.length;i++){
                                if(dataset[i].array[(dataset[i].array.length - 1)].position[1] > systemModelLength){
                                    systemModelLength = dataset[i].array[(dataset[i].array.length - 1)].position[1]
                                }
                            }
                            // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
                            var treeRowCount = 0;
                            var treeCountArray: any[] = [];
                            var treeMarkerArray: any[] = [];
                            var treeArray: any[] = [];
                            var treeRowArea = 0;
                            for(let i=0;i<rowArray.length;i++){
                                // COUNT SYSTEM MODEL ITERATIONS IN ROW
                                var rowLength = turfLength(rowArray[i], {units: "meters"});
                                // IF POSITION y IS 1, USE NEXT ROW TO FIND SYSTEM MODEL LENGTH?! THIS IS ONLY TEMP SOLUTION
                                /!*var systemModelLength = 0;
                                if(dataset[0].array[(dataset[0].array.length - 1)].position[1] <= 1){
                                    systemModelLength = dataset[1].array[(dataset[1].array.length - 1)].position[1];
                                } else {
                                    systemModelLength = dataset[0].array[(dataset[0].array.length - 1)].position[1];
                                }*!/
                                var systemModelCount = Math.floor(rowLength/systemModelLength);
                                var systemModelRowRest = ((rowLength/systemModelLength) - Math.floor(rowLength/systemModelLength))*systemModelLength;
                                // CALCULATE AREA
                                treeRowArea = treeRowArea + rowLength * treeRows[treeRowCount].array[0].width;
                                // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
                                treeArray.push(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species);
                                var firstTreeMarker = turf.point(rowArray[i].geometry.coordinates[0]);
                                treeMarkerArray.push(firstTreeMarker);
                                // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
                                for(let j=0;j<systemModelCount;j++){
                                    for(let k=0;k<treeRows[treeRowCount].array.length;k++){
                                        // ADD TREE SPECIES TO COUNT ARRAY
                                        treeArray.push(treeRows[treeRowCount].array[k].species);
                                        // CREATE TREE POINTS FOR MARKERS
                                        var treeMarker = along(rowArray[i], (j*systemModelLength + treeRows[treeRowCount].array[k].position[1]), {units: "meters"});
                                        treeMarkerArray.push(treeMarker);
                                    }
                                }
                                // ADD REST
                                for(let j=0;j<treeRows[treeRowCount].array.length;j++){
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
                            }*/
                            // SET VARIABLES HERE
                            var layout: any = {};
                            // IF ROWS, DO XXX
                            if(foundProject.rows && foundProject.rows.length > 0){
                                // DO ROW LAYOUT
                                layout = gisObj.rowBasedLayout(foundProject);
                            } else {
                                // DO PARAMETRIC LAYOUT
                                layout = gisObj.systemBasedLayout(foundProject);
                            }
                            /*// SPECIES
                            var allSpeciesCopy = [];
                            for(let i=0;allSpecies.length > i;i++){
                                allSpeciesCopy.push(allSpeciesv[i]);
                            }
                            // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                            var uniqueSpeciesv = unique(allSpeciesCopy);
                            // UNIQUE ITEM COUNTS
                            var uniqueSpeciesCount = [];
                            for(let i=0;uniqueSpeciesv.length > i;i++){
                                var count = 0;
                                for(j = 0; j < treeArray.length; j++){
                                    if(treeArray[j].nameCommon === uniqueSpeciesv[i])
                                        count = count + 1;
                                }
                                speciesCount = {
                                    id: uniqueSpeciesv[i],
                                    uniqueCount: count
                                };
                                uniqueSpeciesCount.push(speciesCount);
                            }
                            console.log(uniqueSpeciesCount[0]);*/
                            var uniqueSpeciesCount: any[] = [];
                            var uniqueSpecies: any[] = [];
                            if(layout.uniqueSpeciesCount) {
                                uniqueSpeciesCount = layout.uniqueSpeciesCount;
                                uniqueSpecies = layout.uniqueSpecies;
                            }
                            /////////////////////
                            /////////////////////
                            // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
                            var postings: any[] = [];
                            // RUN THROUGH ALL POSTINGS
                            for(let i=0;i<speciesPostingsArray.length;i++){
                                for(let j=0;j<uniqueSpecies.length;j++){
                                    // RUN THROUGH ALL ACTIVITIES
                                    if(speciesPostingsArray[i][0] === uniqueSpecies[j].id){
                                        // CREATE THE POSTING HERE AND PUSH
                                        var posting: any = {
                                            name:  uniqueSpecies[j].nameCommon + " " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype + ": " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].name,
                                            postType: "material",
                                            amount: 1,
                                            value: uniqueSpecies[j].activities[speciesPostingsArray[i][1]].price,
                                            year: 1
                                        };
                                        // SET POSTTYPE DEPENDING ON POSTINGS TYPE
                                        if(uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "bed" || uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "method"){
                                            posting.postType = "labor";
                                        }
                                        for(let k=0;k<uniqueSpeciesCount.length;k++){
                                            if(uniqueSpecies[j].nameCommon === uniqueSpeciesCount[k].id){
                                                posting.amount = uniqueSpeciesCount[k].uniqueCount;
                                            }
                                        }
                                        postings.push(posting);
                                    }
                                }
                            }
                            console.log(postings);
                            // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?!

                            // CREATE POSTINGS
                            Posting.insertMany(postings, function(err, createdPostings){
                                if(err){
                                    console.log(err);
                                } else {
                                    // ADD POSTINGS TO BUDGET
                                    Budget.findByIdAndUpdate(createdBudget._id, { $push: { postings: { $each: createdPostings } } }, function(err, updatedBudget){
                                        if(err){
                                            console.log(err);
                                        } else {
                                            console.log("Postings added to budget");
                                            res.redirect("/projects/" + foundProject._id);
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


// GENERATE NEW PROJECT CASH-FLOW BUDGET
router.get("/projects/:id/generatemanagement", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id).populate({path:'rows', populate:{path:'sequence', populate:{path:'model.species'}}}).populate({path:'areas', populate:{path:'rotation', populate:{path:'model.speciesmix.species'}}}).exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // FIND SYSTEM
            System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
                if(err){
                    console.log(err);
                } else {
                    // FIND ALL SPECIES IN SYSTEM OR ROWS
                    var allSpecies: any[] = [];
                    if(foundProject.rows && foundProject.rows.length > 0){
                        for(let i=0;i<foundProject.rows.length;i++){
                            if(foundProject.rows[i].sequence){
                                for(let j=0;j<foundProject.rows[i].sequence.model.length;j++){
                                    allSpecies.push(foundProject.rows[i].sequence.model[j].species);
                                }
                            }
                        }
                        if(foundProject.areas && foundProject.areas.length > 0){
                            for(let i=0;i<foundProject.areas.length;i++){
                                if(foundProject.areas[i].rotation){
                                    for(let j=0;j<foundProject.areas[i].rotation.model.length;j++){
                                        for(let k=0;k<foundProject.areas[i].rotation.model[j].speciesmix.length;k++){
                                            allSpecies.push(foundProject.areas[i].rotation.model[j].speciesmix[k].species);
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        foundSystem.model.forEach(function(species){
                            allSpecies.push(species.species);
                        });
                    }
                    console.log("All species length: " + allSpecies.length);
                    // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                    var uniqueSpecies = unique(allSpecies);
                    // SEND ARRAY OF SUBTYPES
                    var subtypes = ["compost", "pruning", "weedcontrol", "harvest"];
                    res.render("budgets/managementnew", {project: foundProject, species: uniqueSpecies, subtypes: subtypes});
                }
            });
        }
    });
});

// GENERATE CASH-FLOW BUDGET CREATE ROUTE
router.post("/projects/:id/generatemanagement", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id).populate("layer").populate({path:'system', populate:{path:'model.species', populate:{path:'flows'}}}).populate({path:'rows', populate:{path:'sequence', populate:{path:'model.species', populate:{path:'flows'}}}}).populate({path:'areas', populate:{path:'rotation', populate:{path:'model.speciesmix.species', populate:{path:'flows'}}}}).exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            // CREATE BUDGET AND PLACE IN PROJECT
            var budget = req.body.budget;
            Budget.create(budget, function(err, createdBudget){
                if(err){
                    console.log(err);
                } else {
                    foundProject.budgets.management = createdBudget;
                    foundProject.save();
                    // PARSE QUERY
                    var speciesPostings = req.body.speciespostings;
                    var speciesPostingsArray: any[] = [];
                    for(let i=0;i<speciesPostings.length;i++){
                        // REMOVE NONE ONES
                        if(!(speciesPostings[i] === "none")){
                            var splitPostings = speciesPostings[i].split(" ");
                            speciesPostingsArray.push(splitPostings);
                        }
                    }
                    console.log(speciesPostingsArray);
                    // FIND SYSTEM
                    System.findById(foundProject.system).populate({path:'model.species',populate:{path:'flows'}}).exec(function(err, foundSystem){
                        if(err){
                            console.log(err);
                        } else {
                            // UNIQUE SPECIES
                            /*var allSpecies = [];
                            foundSystem.model.forEach(function(species){
                                allSpecies.push(species.species);
                            });
                            var uniqueSpecies = unique(allSpecies);
                            // SOMEWHERE CALCULATE TREE COUNT
                            //////////////////////
                            //////////////////////
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
                            var calibrateDistance = 10/(turfLength(distanceCalibrateLine.features[0], {units: "meters"}));
                            console.log("Distance check " + calibrateDistance);
                            // CREATE HEADLAND + PERIMETER SYSTEM WIDTH
                            var headland = foundProject.headland;
                            var offsetPolygon = buffer(polygon, - headland*calibrateDistance, {units: "meters"});
                            // FIND SYSTEM ROWS
                            var allSpeciesv = [];
                            var dataset = [];
                            foundSystem.model.forEach(function(species){
                                allSpeciesv.push(species.species.nameCommon);
                                var count = 0;
                                for(let i=0;i<dataset.length;i++){
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
                            for(let i=0;i<dataset.length;i++){
                                dataset[i].array.sort(compare1);
                            }
                            // SAVE DATASET
                            foundSystem.sortedrows = dataset;
                            // SET ROW WIDTH - ACTUALLY START BY SETTING TO SYSTEM WIDTH
                            // HAVE ARRAY INSTEAD AND ONLY SELECT ROWS WITH TREES?!
                            var rowWidth = 0;
                            for(let i=0;i<dataset.length;i++){
                                rowWidth = rowWidth + dataset[i].array[0].width;
                            }
                            var rowWidthArray: any[] = [];
                            var rowWidthArrayCount = 0;
                            var treeRowWidthArray: any[] = [];
                            for(let i=0;i<dataset.length+1;i++){
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
                                console.log(turfLength(lengthLineOffsetRotatedPolygon, {units: "meters"}) + " meter length");
                                /!*!// CREATE ANGLED LENGTH LINE
                                var rotatedLine = transformRotate(line, 90);
                                var splitLines = lineSplit(rotatedLine, line);
                                // SET LENGTH LINE
                                var lengthLineSplit = lineSplit(splitLines.features[0], offsetPolygon);
                                lengthLine = lengthLineSplit.features[1];
                                console.log(splitLines.features[0]);
                                console.log(Math.floor((turfLength(lengthLine, {units: "meters"}))));*!/
                                rowCount = Math.floor((turfLength(lengthLineOffsetRotatedPolygon, {units: "meters"}))/rowWidth);
                                rowRest = (((turfLength(lengthLineOffsetRotatedPolygon, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
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
                                console.log((turfLength(lengthLine, {units: "meters"})));
                                rowCount = Math.floor((turfLength(lengthLine, {units: "meters"}))/rowWidth);
                                rowRest = (((turfLength(lengthLine, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
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
                                console.log((turfLength(lengthLine, {units: "meters"})));
                                rowCount = Math.floor((turfLength(lengthLine, {units: "meters"}))/rowWidth);
                                rowRest = (((turfLength(lengthLine, {units: "meters"}))/rowWidth) - rowCount)*rowWidth;
                                console.log("rest " + rowRest);
                                console.log(rowCount);
                                // CREATE ROW LINE
                                line = turf.lineString([box.geometry.coordinates[0][2],box.geometry.coordinates[0][3]],{name: 'line-1'});
                                // -------- WEST/EAST ROWS ---------
                            }
                            // CREATE ROW ARRAY
                            var rowArray: any[] = [];
                            var distance = 0;
                            var distanceArray = rowWidthArray;
                            // OFFSET AND CREATE NEW LINE FOR EACH ROW - NB. WORKS BECAUSE -1 CANCELS < rowCount BY 1.
                            for(let i=0;i<rowCount;i++){
                                // DO IF FIRST COUNT?
                                for(let j=0;j<distanceArray.length;j++){
                                    // DO IF FIRST ROW, DON'T ADD DISTANCE
                                    if(j === distanceArray.length - 1){
                                        distance = distance + distanceArray[j];
                                    } else if (i === 0 && j === 0) {
                                        // START FIRST ROW AT 0
                                        distance = 0.01;
                                        var bufferLine1 = buffer(line, (distance*calibrateDistance), {units: "meters"});
                                        var rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
                                        console.log("Row point count: " + rowPoints1.features.length);
                                        // DO IF HERE TO CHECK SEPARATE ROWS

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
                                        console.log("Row point count: " + rowPoints1.features.length);
                                        // DO IF HERE TO CHECK SEPARATE ROWS
                                        for(let k=0;k<rowPoints1.features.length;k+=2){
                                            if((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0 || rowPoints1.features[0].geometry.coordinates[1] > rowPoints1.features[1].geometry.coordinates[1])){
                                                var row1 = turf.lineString([[rowPoints1.features[k+1].geometry.coordinates[0],rowPoints1.features[k+1].geometry.coordinates[1]],[rowPoints1.features[k].geometry.coordinates[0],rowPoints1.features[k].geometry.coordinates[1]]],{name: "line-0" + i });
                                            } else {
                                                var row1 = turf.lineString([[rowPoints1.features[k].geometry.coordinates[0],rowPoints1.features[k].geometry.coordinates[1]],[rowPoints1.features[k+1].geometry.coordinates[0],rowPoints1.features[k+1].geometry.coordinates[1]]],{name: "line-0" + i });
                                            }
                                            rowArray.push(row1);
                                        }
                                    }
                                }
                            }
                            // ADD LAST ROWS IF THERE IS SOME MISSING
                            var countWidth = 0;
                            for(let i=0;i<distanceArray.length;i++){
                                countWidth = countWidth + distanceArray[i];
                                if(countWidth < rowRest){
                                    var bufferLine2 = buffer(line, ((distance+countWidth)*calibrateDistance), {units: "meters"});
                                    var rowPoints2 = lineIntersect(bufferLine2, offsetPolygon);
                                    console.log("Row point count: " + rowPoints2.features.length);
                                    // DO IF HERE TO CHECK SEPARATE ROWS
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
                            var rowLengthArray: any[] = [];
                            for (i=0;i<rowArray.length;i++){
                                var rowLength1 = turfLength(rowArray[i], {units: "meters"});
                                rowLengthArray.push(rowLength1);
                                /!*
                                                    console.log(rowArray[i].geometry.coordinates);
                                *!/
                            }
                            var treeRows = [];
                            for(let i=0;i<dataset.length;i++){
                                if(!(dataset[i].array[0].species.form === "grass")){
                                    treeRows.push(dataset[i]);
                                }
                            }
                            // CYCLE THROUGH ALL ROWS TO FIND SYSTEM LENGTH
                            var systemModelLength = 0;
                            for(let i=0;i<dataset.length;i++){
                                if(dataset[i].array[(dataset[i].array.length - 1)].position[1] > systemModelLength){
                                    systemModelLength = dataset[i].array[(dataset[i].array.length - 1)].position[1]
                                }
                            }
                            // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
                            var treeRowCount = 0;
                            var treeCountArray: any[] = [];
                            var treeMarkerArray: any[] = [];
                            var treeArray: any[] = [];
                            var treeRowArea = 0;
                            for(let i=0;i<rowArray.length;i++){
                                // COUNT SYSTEM MODEL ITERATIONS IN ROW
                                var rowLength = turfLength(rowArray[i], {units: "meters"});
                                // IF POSITION y IS 1, USE NEXT ROW TO FIND SYSTEM MODEL LENGTH?! THIS IS ONLY TEMP SOLUTION
                                /!*var systemModelLength = 0;
                                if(dataset[0].array[(dataset[0].array.length - 1)].position[1] <= 1){
                                    systemModelLength = dataset[1].array[(dataset[1].array.length - 1)].position[1];
                                } else {
                                    systemModelLength = dataset[0].array[(dataset[0].array.length - 1)].position[1];
                                }*!/
                                var systemModelCount = Math.floor(rowLength/systemModelLength);
                                var systemModelRowRest = ((rowLength/systemModelLength) - Math.floor(rowLength/systemModelLength))*systemModelLength;
                                // CALCULATE AREA
                                treeRowArea = treeRowArea + rowLength * treeRows[treeRowCount].array[0].width;
                                // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
                                treeArray.push(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species);
                                var firstTreeMarker = turf.point(rowArray[i].geometry.coordinates[0]);
                                treeMarkerArray.push(firstTreeMarker);
                                // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
                                for(let j=0;j<systemModelCount;j++){
                                    for(let k=0;k<treeRows[treeRowCount].array.length;k++){
                                        // ADD TREE SPECIES TO COUNT ARRAY
                                        treeArray.push(treeRows[treeRowCount].array[k].species);
                                        // CREATE TREE POINTS FOR MARKERS
                                        var treeMarker = along(rowArray[i], (j*systemModelLength + treeRows[treeRowCount].array[k].position[1]), {units: "meters"});
                                        treeMarkerArray.push(treeMarker);
                                    }
                                }
                                // ADD REST
                                for(let j=0;j<treeRows[treeRowCount].array.length;j++){
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
                            var allSpeciesCopy = [];
                            for(let i=0;allSpecies.length > i;i++){
                                allSpeciesCopy.push(allSpeciesv[i]);
                            }
                            // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                            var uniqueSpeciesv = unique(allSpeciesCopy);
                            // UNIQUE ITEM COUNTS
                            var uniqueSpeciesCount = [];
                            for(let i=0;uniqueSpeciesv.length > i;i++){
                                var count = 0;
                                for(j = 0; j < treeArray.length; j++){
                                    if(treeArray[j].nameCommon === uniqueSpeciesv[i])
                                        count = count + 1;
                                }
                                speciesCount = {
                                    id: uniqueSpeciesv[i],
                                    uniqueCount: count
                                };
                                uniqueSpeciesCount.push(speciesCount);
                            }
                            console.log(uniqueSpeciesCount[0]);*/
                            var layout: any = {};
                            // IF ROWS, DO XXX
                            if(foundProject.rows && foundProject.rows.length > 0){
                                // DO ROW LAYOUT
                                layout = gisObj.rowBasedLayout(foundProject);
                            } else {
                                // DO PARAMETRIC LAYOUT
                                layout = gisObj.systemBasedLayout(foundProject);
                            }
                            var uniqueSpeciesCount: any[] = [];
                            var uniqueSpecies: any[] = [];
                            if(layout.uniqueSpeciesCount) {
                                uniqueSpeciesCount = layout.uniqueSpeciesCount;
                                uniqueSpecies = layout.uniqueSpecies;
                            }
                            /////////////////////
                            /////////////////////
                            // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
                            var postings: any[] = [];
                            var period = req.body.period;
                            // FIND UNIQUE AREA SPECIES
                            var uniqueAreaSpecies: any[] = [];
                            // AREA SIZES IN PERIOD BASED ON AREAS AND SPECIES IN ROTATIONS
                            var areaArray = layout.alleyPolygonArray;
                            var areaSpeciesRotation = layout.alleySpeciesArray;
                            var speciesPeriodAreaArray: any[] = [];
                            for(let i=0;i<period;i++){
                                var countArray: any[] = [];
                                for(let j=0;areaArray.length > j;j++){
                                    for(let k = 0; k < areaSpeciesRotation[j].length; k++){
                                        console.log("rotation length: " + areaSpeciesRotation[j].length);
                                        console.log("rotation check" + ((i+1) % (k+1)));
                                        // CHECK IF YEAR IS IN ROTATION
                                        if((i+areaSpeciesRotation[j].length) % (areaSpeciesRotation[j].length) === k){
                                            uniqueAreaSpecies.push(areaSpeciesRotation[j][k]);
                                            var count = 0;
                                            for(let l=0;l<countArray.length;l++){
                                                if(areaSpeciesRotation[j][k] === countArray[l].id){
                                                    countArray[l].count = countArray[l].count + area(areaArray[j]);
                                                    count = count + 1;
                                                }
                                            }
                                            if(count < 1){
                                                let speciesArea = {
                                                    id: areaSpeciesRotation[j][k],
                                                    count: area(areaArray[j])
                                                };
                                                countArray.push(speciesArea);
                                            }
                                        }
                                    }
                                }
                                speciesPeriodAreaArray.push(countArray);
                            }
                            console.log("Species area count " + speciesPeriodAreaArray[1][0].count);
                            console.log("Species area species " + speciesPeriodAreaArray[1][0].id);
                            console.log("Species area first year length " + speciesPeriodAreaArray[1].length);
                            // UNIQUE AREA SPECIES
                            var uniqueAreaSpeciesSorted = unique(uniqueAreaSpecies);
                            console.log("Unique area species " + uniqueAreaSpeciesSorted.length);
                            // RUN THROUGH ALL POSTINGS
                            for(let i=0;i<speciesPostingsArray.length;i++){
                                for(let j=0;j<uniqueSpecies.length;j++){
                                    // RUN THROUGH ALL ACTIVITIES
                                    if(speciesPostingsArray[i][0] === uniqueSpecies[j].id){
                                        // ITERATE FOR EACH YEAR
                                        for(let k=0;k<period;k++){
                                            // CREATE THE POSTING HERE AND PUSH
                                            var posting: any = {
                                                name:  uniqueSpecies[j].nameCommon + " " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype + ": " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].name,
                                                postType: "material",
                                                amount: 1,
                                                value: uniqueSpecies[j].activities[speciesPostingsArray[i][1]].price,
                                                year: k + 1
                                            };
                                            // SET POSTTYPE DEPENDING ON POSTINGS TYPE
                                            if(uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "pruning" || uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "harvest"){
                                                posting.postType = "labor";
                                            }
                                            for(let l=0;l<uniqueSpeciesCount.length;l++){
                                                if(uniqueSpecies[j].nameCommon === uniqueSpeciesCount[l].id){
                                                    posting.amount = uniqueSpeciesCount[l].uniqueCount;
                                                }
                                            }
                                            // CHECK ROTATION HERE FOR SPECIES AREA SIZES -
                                            // JUST CHECK EACH AREA
                                            // ADD TO COUNTER
                                            // THEN SET AMOUNT TO COUNTER

                                            postings.push(posting);
                                        }
                                    }
                                }
                            }
                            console.log(postings.length + " postings excluding yields");
                            // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?! CHECK FOR EACH YEAR?!

                            // CREATE POSTINGS FOR YIELDS ;)
                            for(let i=0;i<uniqueSpecies.length;i++){
                                // CYCLE THROUGH ALL YEARS
                                for(let j=0;j<period;j++) {
                                    // CREATE YIELD POSTING
                                    var posting: any = {
                                        name: uniqueSpecies[i].nameCommon + " yields",
                                        postType: "product",
                                        amount: 0,
                                        value: 1,
                                        year: j + 1
                                    };
                                    if(uniqueSpecies[i].flows && uniqueSpecies[i].flows.length > 0 && uniqueSpecies[i].flows[0].unit === "food" && (uniqueSpecies[i].flows[0].data.length >= (j+1))){
                                        for(let k=0;k<uniqueSpeciesCount.length;k++){
                                            if(uniqueSpecies[i].nameCommon === uniqueSpeciesCount[k].id){
                                                posting.amount = uniqueSpeciesCount[k].uniqueCount * uniqueSpecies[i].flows[0].data[j];
                                            }
                                        }
                                        /*for(let k=0;k<speciesPeriodAreaArray[j].length;k++){
                                            if(uniqueSpecies[i].nameCommon === speciesPeriodAreaArray[j][k].id){
                                                posting.amount = speciesPeriodAreaArray[j][k].count * uniqueSpecies[i].flows[0].data[j];
                                            }
                                        }*/
                                    }
                                    // DO IF AREA SIZE HERE TO CHECK WITH ROTATION. OK TO HAVE IT HERE SINCE IT OVERWRITE ABOVE FLOWS?

                                    // ADD TO POSTINGS
                                    postings.push(posting);
                                }
                            }
                            // AREA YIELDS
                            for(let i=0;i<uniqueAreaSpeciesSorted.length;i++){
                                // CYCLE THROUGH ALL YEARS
                                for(let j=0;j<period;j++) {
                                    // CREATE YIELD POSTING
                                    var posting:any = {
                                        name: uniqueAreaSpeciesSorted[i].nameCommon + " yields",
                                        postType: "product",
                                        amount: 0,
                                        value: 1,
                                        year: j + 1
                                    };
                                    if(uniqueAreaSpeciesSorted[i].flows && uniqueAreaSpeciesSorted[i].flows.length > 0 && uniqueAreaSpeciesSorted[i].flows[0].unit === "food"){
                                        for(let k=0;k<speciesPeriodAreaArray[j].length;k++){
                                            if(uniqueAreaSpeciesSorted[i].nameCommon === speciesPeriodAreaArray[j][k].id.nameCommon){
                                                posting.amount = Math.round(speciesPeriodAreaArray[j][k].count * uniqueAreaSpeciesSorted[i].flows[0].data[0]);
                                            }
                                        }
                                    }
                                    // ADD TO POSTINGS
                                    postings.push(posting);
                                }
                            }
                            console.log(postings.length + " postings including yields");
                            // POSTINGS FOR AREAS SIZES?

                            // CREATE POSTINGS
                            Posting.insertMany(postings, function(err, createdPostings){
                                if(err){
                                    console.log(err);
                                } else {
                                    // ADD POSTINGS TO BUDGET
                                    Budget.findByIdAndUpdate(createdBudget._id, { $push: { postings: { $each: createdPostings } } }, function(err, updatedBudget){
                                        if(err){
                                            console.log(err);
                                        } else {
                                            console.log("Postings added to budget");
                                            res.redirect("/projects/" + foundProject._id);
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

// NOTES FOR BOTH ACTIVITIES AND BUDGETS
// var budgetEstablishment = {
//     currency: "usd",
//     name: "Establishment budget"
// };
// Budget.create(budgetEstablishment, function(err, createdBudget){
//     if(err){
//         console.log(err);
//     } else {
//         // BUDGET OWNER
//         createdBudget.owner.id = req.user._id;
//         createdBudget.owner.username = req.user.username;
//         createdBudget.save();
//         // CREATE POSTINGS
//         // FIND ALL SPECIES IN PROJECT SYSTEM
//         var allSpecies = [];
//         foundSystem.model.forEach(function(species){
//             allSpecies.push(species.species.id);
//         });
//         // FIND UNIQUE SPECIES / REMOVE DUPLICATES
//         var uniqueSpecies = unique(allSpecies);
//         Species.find({"_id": uniqueSpecies}, function(err, foundSpecies){
//             if(err) {
//                 console.log(err);
//             } else {
//                 var activities = [];
//                 var postings = [];
//                 for(let i=0;foundSpecies.length > i;i++){
//                     for(let j=0;foundSpecies[i].activities.length > j;j++){
//                         // CHECK IF ESTABLISHMENT - DIFFERENTIATE ACTIVITIES
//                         if(foundSpecies[i].activities[j].activityType === "establish"){
//                             var activity = {
//                                 name: foundSpecies[i].activities[j].name + " " + foundSpecies[i].nameCommon,
//                                 automated: true,
//                                 status: true
//                             };
//                             activities.push(activity);
//                         }
//                     }
//                      var posting: any = {
//                          name: foundSpecies[i].nameCommon + " plants",
//                          postType: "material",
//                          amount: 1,
//                          value: 1
//                      };
//                      if(foundSpecies[i].price > 0){
//                          posting.value = foundSpecies[i].price;
//                      }
//                      postings.push(posting);
//                 }
//                 // CREATE ACTIVITIES
//                 activities.forEach(function(activity){
//                     Activity.create(activity, function(err, createdActivity){
//                         if(err){
//                             console.log(err);
//                         } else {
//                             createdActivity.owner.id = req.user._id;
//                             createdActivity.owner.username = req.user.username;
//                             createdActivity.save();
//                             // PUSH TO PROJECT
//                             createdProject.activities.push(createdActivity);
//                             createdProject.save();
//                         }
//                     });
//                 });
//                 // SAVE POSTINGS
//                 Budget.findByIdAndUpdate(createdBudget._id, {$addToSet: {postings: { $each: postings }}}, function(err, updatedBudget){
//                     if(err){
//                         console.log(err);
//                     } else {
//                         var budgetManagement = {
//                             currency: "usd",
//                             name: "Management budget"
//                         };
//                         Budget.create(budgetManagement, function(err, createdManagementBudget){
//                             if(err){
//                                 console.log(err);
//                             } else {
//                                 // BUDGET OWNER
//                                 createdManagementBudget.owner.id = req.user._id;
//                                 createdManagementBudget.owner.username = req.user.username;
//                                 createdManagementBudget.save();
//                                 // SET AS PROJECT BUDGET
//                                 createdProject.budgets.management = createdManagementBudget;
//                                 createdProject.save();
//                                 // req.flash("success", "Successfully added comment");
//                                 res.redirect("/projects/" + createdProject._id);
//                             }
//                         })
//                     }
//                 });
//             }
//         });
//     }
// });
//

// MOVED TO POSTINGS ROUTE
/*// BUDGET POSTING NEW
router.get("/budgets/:id/postings/new", middleware.isLoggedIn, function(req, res){
    Budget.findById(req.params.id, function(err, foundBudget){
        if(err){
            console.log(err);
        } else {
            res.render("budgets/postings", {budget: foundBudget});
        }
    });
});

// BUDGET POSTING CREATE
router.put("/budgets/:id/postings", middleware.isLoggedIn, function(req, res){
    Budget.findByIdAndUpdate(req.params.id, {$addToSet: {postings: req.body.posting}}, function(err, updatedBudget){
        if(err){
            console.log(err);
        } else {
            res.redirect("/budgets/" + updatedBudget._id);
        }
    });
});*/

module.exports = router;