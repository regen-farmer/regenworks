var unique = require("array-unique");
var bbox = require("@turf/bbox");
var bboxPolygon = require("@turf/bbox-polygon");
var turf = require("@turf/helpers");
var lineIntersect = require("@turf/line-intersect");
var length = require("@turf/length");
var buffer = require("@turf/buffer");
var midpoint = require("@turf/midpoint");
var rhumbBearing = require("@turf/rhumb-bearing");
var rhumbDistance = require("@turf/rhumb-distance");
var transformScale = require("@turf/transform-scale");
var transformRotate = require("@turf/transform-rotate");
var transformTranslate = require("@turf/transform-translate");
var lineSplit = require("@turf/line-split");
var along = require("@turf/along");
var circle = require("@turf/circle");
var area = require("@turf/area");
var polygonToLine = require("@turf/polygon-to-line");
var pointToLineDistance = require("@turf/point-to-line-distance");
var booleanPointOnLine = require("@turf/boolean-point-on-line");

// DEFINE GIS OBJECT
var gisObj = {};

// SYSTEM BASED LAYOUT
gisObj.systemBasedLayout = function(project){
    //
    var layout = {};
    // SET TEMP VARIABLES
    var polygon = JSON.parse(project.layer.geometry);
    var headland = project.headland;
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
    var edgeRowDataset = [];
    if(project.edgesystem){
        // CALCULATE WIDTH - REFACTOR INTO MIDDLEWARE. USED TWICE IN THIS ROUTE
        project.edgesystem.model.forEach(function(species){
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
    /*var edgeTreeMarkers = turf.featureCollection(edgeTreeCanopyArray);
    var edgeTreeCollection = JSON.stringify(edgeTreeMarkers);*/
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
    project.system.model.forEach(function(species){
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
    // SAVE DATASET - ONLY REASON FOR THIS IS TO USE IT IN VIEW?!
    layout.sortedrows = dataset;
    // SET ROW WIDTH - ACTUALLY START BY SETTING TO SYSTEM WIDTH
    // HAVE ARRAY INSTEAD AND ONLY SELECT ROWS WITH TREES?!
    var rowWidth = 0;
    for(i=0;i<dataset.length;i++){
        rowWidth = rowWidth + dataset[i].array[0].width;
    }
    layout.rowWidth = rowWidth;
    // ROW PARAMETERS
    var rowWidthArray = [];
    var rowWidthArrayCount = 0;
    var treeRowWidthArray = [];
    var stripWidths = [];
    // ALLEY PARAMETERS
    var alleyWidthArray = [];
    var alleyWidthArrayCount = 0;
    var alleyWidths = [];
    for(i=0;i<dataset.length+1;i++){
        // SET ROW LENGTHS
        // IF FIRST ROW
        if(i === 0){
            if(dataset[i].array[0].species.form === "grass" || dataset[i].array[0].species.form === "herb"){
                rowWidthArrayCount = rowWidthArrayCount + dataset[i].array[0].width;
                // SET ALLEY COUNT
                alleyWidthArrayCount = alleyWidthArrayCount + dataset[i].array[0].width/2;
                alleyWidthArray.push(alleyWidthArrayCount);
                alleyWidthArrayCount = 0;
                alleyWidths.push(dataset[i].array[0].width);
            } else {
                rowWidthArrayCount = rowWidthArrayCount + dataset[i].array[0].width/2;
                rowWidthArray.push(rowWidthArrayCount);
                rowWidthArrayCount = 0;
                treeRowWidthArray.push(dataset[i].array[0].width);
                // SET ALLEY COUNT
                alleyWidthArrayCount = alleyWidthArrayCount + dataset[i].array[0].width;
            }
        // IF LAST ROW - OR IS THIS OFF?!
        } else if (i === dataset.length) {
            rowWidthArrayCount = rowWidthArrayCount + dataset[i-1].array[0].width/2;
            rowWidthArray.push(rowWidthArrayCount);
            // ALLEYS
            alleyWidthArrayCount = alleyWidthArrayCount + dataset[i-1].array[0].width/2;
            alleyWidthArray.push(alleyWidthArrayCount);
        // FOR ALL OTHER ROWS
        } else {
            // CHECK IF ROW BEFORE WAS GRASS
            if((dataset[i-1].array[0].species.form === "grass" || dataset[i-1].array[0].species.form === "herb") && i === 1){
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
            // ALLEYS
            if(dataset[i].array[0].species.form === "grass" || dataset[i].array[0].species.form === "herb") {
                if((dataset[i-1].array[0].species.form === "grass" || dataset[i-1].array[0].species.form === "herb") && i === 1){
                    alleyWidthArrayCount = alleyWidthArrayCount + dataset[i-1].array[0].width/2;
                }
                alleyWidthArrayCount = alleyWidthArrayCount + dataset[i].array[0].width/2;
                // DO IF TO CHECK IF FIRST INDEX WAS ALLEY
                alleyWidthArray.push(alleyWidthArrayCount);
                alleyWidthArrayCount = 0;
                alleyWidths.push(dataset[i].array[0].width);
                if(i < dataset.length - 1){
                    alleyWidthArrayCount = alleyWidthArrayCount + dataset[i].array[0].width/2;
                }
            } else {
                if((dataset[i-1].array[0].species.form === "grass" || dataset[i-1].array[0].species.form === "herb") && i === 1){
                    alleyWidthArrayCount = alleyWidthArrayCount + dataset[i-1].array[0].width/2 + dataset[i].array[0].width;
                } else {
                    alleyWidthArrayCount = alleyWidthArrayCount + dataset[i].array[0].width;
                }
            }
        }
    }
    console.log("Widths: " + alleyWidths);
    console.log("Alleys: " + alleyWidthArray);
    // DEFINE ALL VARIABLES I NEED FOR THE ROWS HERE, THEN MAKE IF STATEMENTS ON ALIGNMENT
    var tempOffsetArray = [];
    var lengthLine;
    var line;
    var rowCount = 0;
    var rowRest = 0;
    if(project.alignment === "bearing"){
        // -------- ANGLED ROWS ---------
        // IF HEADLAND IS 0, JUST USE REGULAR POLYGON, NOT BUFFER
        var lengthLineBearing = {};
        if(project.bearingline){
            lengthLineBearing = project.bearingline;
        } else if(project.headland === 0){
            lengthLineBearing = turf.lineString([polygon.geometry.coordinates[0][project.bearing],polygon.geometry.coordinates[0][project.bearing + 1]],{name: 'bearingline'});
        } else {
            lengthLineBearing = turf.lineString([offsetPolygon.geometry.coordinates[0][project.bearing],offsetPolygon.geometry.coordinates[0][project.bearing + 1]],{name: 'bearingline'});
        }
        // SCALE LINE
/*
        line = transformScale(lengthLineBearing, 6);
*/
        // ALTERNATIVE BOUNDING BOX LENGTH LINE
        var lineBearing = rhumbBearing(lengthLineBearing.geometry.coordinates[0],lengthLineBearing.geometry.coordinates[1]);
        console.log(lineBearing);
        var rotatedPolygon = transformRotate(offsetPolygon, 90-lineBearing);
        var bboxOffsetPolygon = bboxPolygon(bbox(rotatedPolygon));
        console.log(bboxOffsetPolygon.geometry.coordinates[0][1]);
        console.log(bboxOffsetPolygon.geometry.coordinates[0][2]);
        var lengthLineOffsetRotatedPolygon = turf.lineString([bboxOffsetPolygon.geometry.coordinates[0][1],bboxOffsetPolygon.geometry.coordinates[0][2]],{name: 'line-10'});
        console.log(length(lengthLineOffsetRotatedPolygon, {units: "meters"}) + " meter length");
        // CREATE NEW POLYGON
        var alignPolygon = transformRotate(offsetPolygon, 180-lineBearing);
        // CHECK POINTS ON ROTATED POLYGON
        var offsetPolygonWesternPoint = {};
        var westernPointCount = 0;
        var westernPointIndex = 0;
        for(i=0;i<alignPolygon.geometry.coordinates[0].length-1;i++){
            console.log("Coordinate: " + alignPolygon.geometry.coordinates[0][i]);
            if(westernPointCount > alignPolygon.geometry.coordinates[0][i][0]){
                westernPointIndex = i;
                westernPointCount = alignPolygon.geometry.coordinates[0][i][0];
            }
        }
        console.log("Index: " + westernPointIndex);
        console.log("Lengthline: " + lengthLineBearing);
        console.log("Westernpoint: " + offsetPolygon.geometry.coordinates[0][westernPointIndex]);
        // MOVE SPECS
        var lineMidpoint = midpoint(lengthLineBearing.geometry.coordinates[0],lengthLineBearing.geometry.coordinates[1]);
        var moveLengthLine = turf.lineString([lineMidpoint.geometry.coordinates, offsetPolygon.geometry.coordinates[0][westernPointIndex]], {name: 'moveline'});
        var moveBearing = rhumbBearing(lineMidpoint, offsetPolygon.geometry.coordinates[0][westernPointIndex]);
        var moveDistance = length(moveLengthLine, {units: 'meters'});
        // SEE OFFSET
        var moveLine = transformTranslate(lengthLineBearing, moveDistance, moveBearing, {units: 'meters'});
        line = transformScale(moveLine, 6);
        tempOffsetArray.push(alignPolygon);
        tempOffsetArray.push(line);
        tempOffsetArray.push(moveLine);
        console.log("movedLine: " + moveLine.geometry.coordinates);
        tempOffsetArray.push(lengthLineOffsetRotatedPolygon);
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
    } else if(project.alignment === "north"){
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
    // CREATE ALLEY ARRAY
    var bedArray = [];
    var alleyArray = [];
    var bedDistance = 0;
    // OFFSET AND CREATE NEW LINE FOR EACH ROW - NB. WORKS BECAUSE -1 CANCELS < rowCount BY 1.
    for(i=0;i<rowCount;i++){
        // DO IF FIRST COUNT?
        for(j=0;j<distanceArray.length;j++){
            // DO IF FIRST ROW, DON'T ADD DISTANCE
            if(j === distanceArray.length - 1){
                distance = distance + distanceArray[j];
            } else if (i === 0 && j === 0) {
                // START FIRST ROW AT 0 - JUST SET TO DISTANCE!
                distance = distance + distanceArray[j];
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
                // CREATE FIRST TREE STRIP
                if(alleyWidthArray[0] < distanceArray[0]){
                    // IF ALLEY IS FIRST, CREATE TREE STRIP NORMALLY
                    var alleyBufferLine1 = buffer(line, ((distance-(treeRowWidthArray[j]/2))*calibrateDistance), {units: "meters"});
                    var alleyPoints1 = lineIntersect(alleyBufferLine1, offsetPolygon);
                    var alleyBufferLine2 = buffer(line, ((distance+(treeRowWidthArray[j]/2))*calibrateDistance), {units: "meters"});
                    var alleyPoints2 = lineIntersect(alleyBufferLine2, offsetPolygon);
                    var alleyPolygon = turf.polygon([[alleyPoints1.features[0].geometry.coordinates, alleyPoints1.features[1].geometry.coordinates, alleyPoints2.features[1].geometry.coordinates, alleyPoints2.features[0].geometry.coordinates, alleyPoints1.features[0].geometry.coordinates]], {name: "alleypoly" + i});
                    bedArray.push(alleyPolygon);
                } else {
                    // IF ROW AND STRIP IS FIRST, CREATE TREE STRIP WITH CUT
                    /*var lineA = {};
                var lineB = {};
                var polyLine = polygonToLine(offsetPolygon);
                for(k=0;k<offsetPolygon.geometry.coordinates[0].length - 1;k++){
                    var matchPoint1 = turf.point(row1.geometry.coordinates[0]);
                    var matchPoint2 = turf.point(row1.geometry.coordinates[1]);
                    var matchLine = turf.lineString([polyLine.geometry.coordinates[k], polyLine.geometry.coordinates[k+1]],{name: "matchLine-0" + k })
                    var match = pointToLineDistance(matchPoint1, matchLine);
                    var match2 = pointToLineDistance(matchPoint2, matchLine);
                    console.log("Any matches: " + match + match2);
                }*/
                }
            } else {
                distance = distance + distanceArray[j];
                var bufferLine1 = buffer(line, (distance*calibrateDistance), {units: "meters"});
                var rowPoints1 = lineIntersect(bufferLine1, offsetPolygon);
                console.log("Row point count: " + rowPoints1.features.length);
                // DO IF HERE TO CHECK SEPARATE ROWS
                for(k=0;k<rowPoints1.features.length;k+=2){
                    if((rowPoints1.features[0].geometry.coordinates[0] < 0 && rowPoints1.features[1].geometry.coordinates[0] > 0) || (rowPoints1.features[0].geometry.coordinates[0] > 0 && rowPoints1.features[1].geometry.coordinates[0] < 0 || rowPoints1.features[0].geometry.coordinates[1] > rowPoints1.features[1].geometry.coordinates[1])){
                        var row1 = turf.lineString([[rowPoints1.features[k+1].geometry.coordinates[0],rowPoints1.features[k+1].geometry.coordinates[1]],[rowPoints1.features[k].geometry.coordinates[0],rowPoints1.features[k].geometry.coordinates[1]]],{name: "line-0" + i });
                    } else {
                        var row1 = turf.lineString([[rowPoints1.features[k].geometry.coordinates[0],rowPoints1.features[k].geometry.coordinates[1]],[rowPoints1.features[k+1].geometry.coordinates[0],rowPoints1.features[k+1].geometry.coordinates[1]]],{name: "line-0" + i });
                    }
                    rowArray.push(row1);
                }
                // CREATE TREE STRIPS
                var alleyBufferLine1 = buffer(line, ((distance-(treeRowWidthArray[j]/2))*calibrateDistance), {units: "meters"});
                var alleyPoints1 = lineIntersect(alleyBufferLine1, offsetPolygon);
                var alleyBufferLine2 = buffer(line, ((distance+(treeRowWidthArray[j]/2))*calibrateDistance), {units: "meters"});
                var alleyPoints2 = lineIntersect(alleyBufferLine2, offsetPolygon);
                var alleyPolygon = turf.polygon([[alleyPoints1.features[0].geometry.coordinates, alleyPoints1.features[1].geometry.coordinates, alleyPoints2.features[1].geometry.coordinates, alleyPoints2.features[0].geometry.coordinates, alleyPoints1.features[0].geometry.coordinates]], {name: "alleypoly" + i});
                // CUT OFFSET PERIMETER AS WELL FOR BEST ACCURACY
                bedArray.push(alleyPolygon);
            }
        }
        // ONLY DO THIS IF ALLEYS ARE THERE - ABOVE 1 MEANS THAT THERE IS AN ALLEY :P
        if(alleyWidthArray && alleyWidthArray.length > 1){
            for(j=0;j<alleyWidthArray.length;j++){
                if(i === 0 && j === 0){
                    // FIRST ALLEY ON AREA
                    bedDistance = bedDistance + alleyWidthArray[j];
                    if(alleyWidthArray[0] < distanceArray[0]){
                        // IF ALLEY IS FIRST, CREATE ALLEY WITH CUT

                    } else {
                        // IF ALLEY IS FIRST, CREATE ALLEY NORMALLY
                        var alleyBufferLine3 = buffer(line, ((bedDistance-(alleyWidths[j]/2))*calibrateDistance), {units: "meters"});
                        var alleyPoints3 = lineIntersect(alleyBufferLine3, offsetPolygon);
                        var alleyBufferLine4 = buffer(line, ((bedDistance+(alleyWidths[j]/2))*calibrateDistance), {units: "meters"});
                        var alleyPoints4 = lineIntersect(alleyBufferLine4, offsetPolygon);
                        var alleyPolygon1 = turf.polygon([[alleyPoints3.features[0].geometry.coordinates, alleyPoints3.features[1].geometry.coordinates, alleyPoints4.features[1].geometry.coordinates, alleyPoints4.features[0].geometry.coordinates, alleyPoints3.features[0].geometry.coordinates]], {name: "alleypoly" + i});
                        // PUSH TO ARRAY
                        alleyArray.push(alleyPolygon1);
                    }
                } else {
                    // REMAINING ALLEYS ON AREA
                    if(j === alleyWidthArray.length - 1){
                        bedDistance = bedDistance + alleyWidthArray[j];
                    } else {
                        // CREATE ALLEYS
                        bedDistance = bedDistance + alleyWidthArray[j];
                        var alleyBufferLine3 = buffer(line, ((bedDistance-(alleyWidths[j]/2))*calibrateDistance), {units: "meters"});
                        var alleyPoints3 = lineIntersect(alleyBufferLine3, offsetPolygon);
                        var alleyBufferLine4 = buffer(line, ((bedDistance+(alleyWidths[j]/2))*calibrateDistance), {units: "meters"});
                        var alleyPoints4 = lineIntersect(alleyBufferLine4, offsetPolygon);
                        var alleyPolygon1 = turf.polygon([[alleyPoints3.features[0].geometry.coordinates, alleyPoints3.features[1].geometry.coordinates, alleyPoints4.features[1].geometry.coordinates, alleyPoints4.features[0].geometry.coordinates, alleyPoints3.features[0].geometry.coordinates]], {name: "alleypoly" + i});
                        // PUSH TO ARRAY
                        alleyArray.push(alleyPolygon1);
                    }
                }
            }
        }
    }
    // FIND LAST IF LAST IS ROW OR ALLEY
    var tempWidthAlley = 0;
    var tempWidthAlleyCount = 0;
    for(i=0;i<alleyWidthArray.length;i++){
        tempWidthAlleyCount = tempWidthAlleyCount + alleyWidthArray[i];
        if(tempWidthAlleyCount < rowRest){
            tempWidthAlley = tempWidthAlleyCount;
        }
    }
    var tempWidthTree = 0;
    var tempWidthTreeCount = 0;
    for(i=0;i<rowWidthArray.length;i++){
        tempWidthTreeCount = tempWidthTreeCount + rowWidthArray[i];
        if(tempWidthTreeCount < rowRest){
            tempWidthTree = tempWidthTreeCount;
        }
    }
    console.log("Tree sequence: " + tempWidthTree);
    console.log("Alley sequence: " + tempWidthAlley);
    // ADD LAST ROWS IF THERE IS SOME MISSING
    var countWidth = 0;
    for(i=0;i<distanceArray.length;i++){
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
            // DO GRASS STRIPS. CHECK IF IT'S THE LAST ROW. ALSO CHECK ALLEY
            /*if((countWidth + distanceArray[i+1] > rowRest) && tempWidthTree < tempWidthAlley){
                // LAST ROW

            } else {
                // NOT LAST ROW
                // CREATE TREE STRIPS
                var alleyBufferLine1 = buffer(line, ((distance+countWidth-(treeRowWidthArray[i]/2))*calibrateDistance), {units: "meters"});
                var alleyPoints1 = lineIntersect(alleyBufferLine1, offsetPolygon);
                var alleyBufferLine2 = buffer(line, ((distance+countWidth+(treeRowWidthArray[i]/2))*calibrateDistance), {units: "meters"});
                var alleyPoints2 = lineIntersect(alleyBufferLine2, offsetPolygon);
                var alleyPolygon = turf.polygon([[alleyPoints1.features[0].geometry.coordinates, alleyPoints1.features[1].geometry.coordinates, alleyPoints2.features[1].geometry.coordinates, alleyPoints2.features[0].geometry.coordinates, alleyPoints1.features[0].geometry.coordinates]], {name: "alleypoly" + i});
                // CUT OFFSET PERIMETER AS WELL FOR BEST ACCURACY
                bedArray.push(alleyPolygon);
            }*/
        }
    }
    // ADD LAST ALLEYS IF THERE IS SOME MISSING
    /*var alleyCountWidth = 0;
    for(i=0;i<alleyWidthArray.length;i++){
        alleyCountWidth = alleyCountWidth + alleyWidthArray[i];
        // NEED TO CHECK FOR MINUS WIDTH AS WELL? YES
        if(alleyCountWidth < rowRest){
            if((alleyCountWidth + alleyWidthArray[i+1] > rowRest) && tempWidthTree > tempWidthAlley){

            } else {
                var alleyBufferLine3 = buffer(line, ((bedDistance+alleyCountWidth-(alleyWidths[i]/2))*calibrateDistance), {units: "meters"});
                var alleyPoints3 = lineIntersect(alleyBufferLine3, offsetPolygon);
                var alleyBufferLine4 = buffer(line, ((bedDistance+alleyCountWidth+(alleyWidths[i]/2))*calibrateDistance), {units: "meters"});
                var alleyPoints4 = lineIntersect(alleyBufferLine4, offsetPolygon);
                var alleyPolygon1 = turf.polygon([[alleyPoints3.features[0].geometry.coordinates, alleyPoints3.features[1].geometry.coordinates, alleyPoints4.features[1].geometry.coordinates, alleyPoints4.features[0].geometry.coordinates, alleyPoints3.features[0].geometry.coordinates]], {name: "alleypoly" + i});
                // PUSH TO ARRAY
                alleyArray.push(alleyPolygon1);
            }
        }
    }*/
    layout.offsetArray = tempOffsetArray;
    // CALCULATE TREE ROW AREA HERE
    layout.treeRowArea = 0;
    layout.bedPolygonArray = bedArray;
    layout.bedPolygonCollection = turf.featureCollection(bedArray);
    layout.alleyPolygonArray = alleyArray;
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
    layout.rowLineArray = rowArray;
    for(i=0;i<edgeRowArray.length;i++){
        // ADD EDGEROWS
        layout.rowLineArray.push(edgeRowArray[i]);
    }
    layout.rowLineCollection = turf.featureCollection(rowArray);
    // CREATE FEATURE COLLECTION FOR EDGEROWS
/*    var edgeRowFeatureCollection = turf.featureCollection(edgeRowArray);
    var edgeRowCollection = JSON.stringify(edgeRowFeatureCollection);*/
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
    // CYCLE THROUGH ALL ROWS TO FIND SYSTEM LENGTH
    var systemModelLength = 0;
    for(i=0;i<dataset.length;i++){
        if(dataset[i].array[(dataset[i].array.length - 1)].position[1] > systemModelLength){
            systemModelLength = dataset[i].array[(dataset[i].array.length - 1)].position[1]
        }
    }
    // CALCULATE TREE COUNT REAL BASED ON ROW LENGTH AND SPECIES IN ROWS
    var treeRowCount = 0;
    var treeCountArray = [];
    var treeMarkerArray = [];
    var treeAssetArray = [];
    var treeAssetRowRef = [];
    var treeArray = [];
    var treeRowArea = 0;
    for(i=0;i<rowArray.length;i++){
        // COUNT SYSTEM MODEL ITERATIONS IN ROW
        var rowLength = length(rowArray[i], {units: "meters"});
        // IF POSITION y IS 1, USE NEXT ROW TO FIND SYSTEM MODEL LENGTH?! THIS IS ONLY TEMP SOLUTION
        /*var systemModelLength = 0;
        if(dataset[0].array[(dataset[0].array.length - 1)].position[1] <= 1){
            systemModelLength = dataset[1].array[(dataset[1].array.length - 1)].position[1];
        } else {
            systemModelLength = dataset[0].array[(dataset[0].array.length - 1)].position[1];
        }*/
        var systemModelCount = Math.floor(rowLength/systemModelLength);
        var systemModelRowRest = ((rowLength/systemModelLength) - Math.floor(rowLength/systemModelLength))*systemModelLength;
        // CALCULATE AREA
        treeRowArea = treeRowArea + rowLength * treeRows[treeRowCount].array[0].width;
        // ADD FIRST TREE IN EACH ROW - ADD LAST SPECIES IN ARRAY - DO IF TO CHECK DISTANCE
        console.log("Position: " + treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].position[1]);
        if(!(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].position[1] < systemModelLength)){
            treeArray.push(treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species);
            var firstTreeMarker = turf.point(rowArray[i].geometry.coordinates[0]);
            treeMarkerArray.push(firstTreeMarker);
            // ASSET ARRAY
            var asset = {
                species: treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species.id,
                lat: firstTreeMarker.geometry.coordinates[0],
                lng: firstTreeMarker.geometry.coordinates[1],
                name: treeRows[treeRowCount].array[(treeRows[treeRowCount].array.length)-1].species.nameCommon
            };
            treeAssetArray.push(asset);
            treeAssetRowRef.push(i);
        }
        // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
        for(j=0;j<systemModelCount;j++){
            for(k=0;k<treeRows[treeRowCount].array.length;k++){
                // ADD TREE SPECIES TO COUNT ARRAY
                treeArray.push(treeRows[treeRowCount].array[k].species);
                // CREATE TREE POINTS FOR MARKERS
                var treeMarker = along(rowArray[i], (j*systemModelLength + treeRows[treeRowCount].array[k].position[1]), {units: "meters"});
                treeMarkerArray.push(treeMarker);
                // ASSET ARRAY
                var asset = {
                    species: treeRows[treeRowCount].array[k].species.id,
                    lat: treeMarker.geometry.coordinates[0],
                    lng: treeMarker.geometry.coordinates[1],
                    name: treeRows[treeRowCount].array[k].species.nameCommon
                };
                treeAssetArray.push(asset);
                treeAssetRowRef.push(i);
            }
        }
        // ADD REST
        for(j=0;j<treeRows[treeRowCount].array.length;j++){
            if(treeRows[treeRowCount].array[j].position[1] < systemModelRowRest){
                treeArray.push(treeRows[treeRowCount].array[j].species);
                // ADD POINT MARKER FOR REMAINING TREES
                var treeMarker2 = along(rowArray[i], (systemModelCount*systemModelLength + treeRows[treeRowCount].array[j].position[1]), {units: "meters"});
                treeMarkerArray.push(treeMarker2);
                // ASSET ARRAY
                var asset = {
                    species: treeRows[treeRowCount].array[j].species.id,
                    lat: treeMarker2.geometry.coordinates[0],
                    lng: treeMarker2.geometry.coordinates[1],
                    name: treeRows[treeRowCount].array[j].species.nameCommon
                };
                treeAssetArray.push(asset);
                treeAssetRowRef.push(i);
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
    layout.treeAssetRowRef = treeAssetRowRef;
    layout.treeArray = treeArray;
    layout.treeMarkerArray = treeCanopyArray;
    layout.treeAssetArray = treeAssetArray;
    layout.offsetArrayCollection = []; // CAN DELETE THIS AT SOME POINT. JUST USED IT TO ENSURE VIZ OF LINES IN LAYOUT ANGLED WAS WORKING
    // ADD EDGE TREE MARKERS
    for(i=0;i<edgeTreeCanopyArray.length;i++){
        layout.treeMarkerArray.push(edgeTreeCanopyArray[i]);
    }
    layout.treeMarkerCollection = turf.featureCollection(treeCanopyArray);
    // CALCULATE TREE COUNT
    var areaSize = project.layer.size;
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
    layout.uniqueSpeciesCount = uniqueSpeciesCount;
    var uniqueTreeSpecies = unique(treeArray);
    layout.uniqueSpecies = uniqueTreeSpecies;
    // UNIQUE AREA COUNT

    /*// CHECK LENGTH OF LINE BEFORE CUTTING
    var checkLine = turf.lineString([polygon.geometry.coordinates[0][1],polygon.geometry.coordinates[0][2]],{name: "checkLine"});
    var checkLength = length(checkLine, {units: "meters"});
    console.log(checkLength + " meters long");*/
    // CALCULATE MARGIN AREA
    var marginArea = area(polygon) - area(offsetPolygon);
    return (layout);
};

// ROW AND AREA BASED LAYOUT
gisObj.rowBasedLayout = function(project){
    //
    var layout = {};
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
    // VIZ ROWS
    var allSpecies = [];
    var rowArray = [];
    var placesArray = [];
    for(i=0;i<project.rows.length;i++){
        // ROW VIZ
        var rowGeometry = JSON.parse(project.rows[i].geometry);
        rowArray.push(rowGeometry);
        // PLACES
        var properties = {
            'description': project.rows[i].name
        };
        var place = turf.point(rowGeometry.geometry.coordinates[1], properties);
        placesArray.push(place);
    }
    // ROW LABELS (BEFORE ROWS ARE PARSED)
    var placesCollection = turf.featureCollection(placesArray);
    var places = JSON.stringify(placesCollection);
    // CREATE PLACES FEATURE
    layout.rowLineArray = rowArray;
    layout.rowLineCollection = turf.featureCollection(rowArray);
/*
    var collection = JSON.stringify(featurecollection);
*/
    // COUNT ASSETS IN ROW SYSTEMS - ONLY TAKE FIRST ROW?!
    /*for(i=0;i<foundLayer.rows.length;i++){
        for(j=0;j<foundLayer.rows[i].system.model.length;j++){
            foundLayer.rows[i].system.populate("model." + j + ".species");
        }
    }*/
    // MAYBE RENAME THIS ONE!?!
    var treeAssetsArray = [];
    // SET COLLECTIVE TREE ARRAY
    var treeMarkerArray = [];
    var treeAssetArray = [];
    var treeAssetRowRef = [];
    var treeArray = [];
    // FIND SYSTEM ROWS
    for(i=0;i<project.rows.length;i++){
        // SET ROW DATA
        if(project.rows[i].sequence) {
            var datasetRows = project.rows[i].sequence.model;
            project.rows[i].sequence.model.forEach(function (species) {
                allSpecies.push(species.species.nameCommon);
                /*var count = 0;
                for (j = 0; j < datasetRows.length; j++) {
                    if (datasetRows[j].row === species.position[0]) {
                        datasetRows[j].array.push(species);
                        count = count + 1;
                    }
                }
                if (count === 0) {
                    datasetRows.push({row: species.position[0], array: [species]});
                }*/
            });
            // SORT ROW ITEMS
            datasetRows.sort(compare1);
            // ROW LENGTH
            var rowLine = JSON.parse(project.rows[i].geometry);
            var rowLength = length(rowLine, {units: "meters"});
            console.log("Row length " + rowLength);
            // SYSTEM MODEL LENGTH
            var systemModelLength = project.rows[i].sequence.sequencelength;
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
            treeArray.push(datasetRows[(datasetRows.length - 1)].species);
            // ASSET ARRAY
            var firstTreeAsset = {
                species: datasetRows[(datasetRows.length - 1)].species.id,
                lat: firstTreeMarker.geometry.coordinates[0],
                lng: firstTreeMarker.geometry.coordinates[1],
                name: datasetRows[(datasetRows.length - 1)].species.nameCommon
            };
            treeAssetArray.push(firstTreeAsset);
            treeAssetRowRef.push(i);
            // ROW MARKERS
            // CALCULATE LENGTH ITERATIONS - EITHER ADD TO ARRAY COUNTER OR JUST SORT LATER
            for (j = 0; j < systemModelCount; j++) {
                for (k = 0; k < datasetRows.length; k++) {
                    // CREATE COORDINATES FOR THE TREE
                    var treeMarker = along(rowLine, (j * systemModelLength + datasetRows[k].position), {units: "meters"});
                    //
                    var asset = {
                        marker: treeMarker,
                        species: datasetRows[k].species
                    };
                    // ADD TREE OBJECT TO ARRAY
                    treeMarkerArray.push(treeMarker);
                    treeAssetsArray.push(asset);
                    treeArray.push(datasetRows[k].species);
                    // ASSET ARRAY
                    var treeAsset1 = {
                        species: datasetRows[k].species.id,
                        lat: treeMarker.geometry.coordinates[0],
                        lng: treeMarker.geometry.coordinates[1],
                        name: datasetRows[k].species.nameCommon
                    };
                    treeAssetArray.push(treeAsset1);
                    treeAssetRowRef.push(i);
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
                    treeArray.push(datasetRows[j].species);
                    // ASSET ARRAY
                    var treeAsset2 = {
                        species: datasetRows[j].species.id,
                        lat: treeMarker2.geometry.coordinates[0],
                        lng: treeMarker2.geometry.coordinates[1],
                        name: datasetRows[j].species.nameCommon
                    };
                    treeAssetArray.push(treeAsset2);
                    treeAssetRowRef.push(i);
                }
            }
        }
    }
    // DO POINT COLLECTION
    var treeCanopyArray = [];
    var vegeCanopyArray = [];
    if(treeAssetsArray.length < 5000){
        for(i=0;i<treeAssetsArray.length;i++){
            // FIND TREE DIMENSIONS
            var diameter = 1;
            /*if(treeAssetsArray[i].species.form === "shrub" || treeAssetsArray[i].species.form === "giantherb" ){
                diameter = 0.2;
            } else if (treeAssetsArray[i].species.form === "herb"){
                diameter = 0.1;
            }*/
            var circle1 = circle(treeAssetsArray[i].marker.geometry.coordinates, diameter, {units: "meters"});
            treeCanopyArray.push(circle1);
            // SYNTROPIC CLASS HERE
/*
            if(treeAssetsArray[i].species.height > 15){
                treeCanopyArray.push(circle1);
            } else {
                vegeCanopyArray.push(circle1);
            }*/

        }
    }
    layout.treeAssetRowRef = treeAssetRowRef;
    layout.treeArray = treeAssetsArray;
    layout.treeAssetArray = treeAssetArray;
    layout.treeMarkerArray = treeCanopyArray;
    layout.treeMarkerCollection = turf.featureCollection(treeCanopyArray);
/*
    var treeCollection = JSON.stringify(treeMarkers);
*/
    // INSERT SYSTEM CLASSIFICATION
    var vegeMarkers = turf.featureCollection(vegeCanopyArray);
/*
    var vegeCollection = JSON.stringify(vegeMarkers);
*/
    // DO TREE NAMES COLLECTION
    var treenames = [];
    for(i=0;i<treeAssetsArray.length;i++){
        var properties1 = {
            'description': treeAssetsArray[i].species.nameCommon.slice(0,3)
        };
        var treename = turf.point(treeAssetsArray[i].marker.geometry.coordinates, properties1);
        treenames.push(treename);
    }
    layout.treeNameLabelCollection = turf.featureCollection(treenames);
/*
    var treeNameCollection = JSON.stringify(treenamemarks);
*/
    // VIZ ROWS
    var alleyPolygonArray = [];
    var bedPolygonArray = [];
    for(i=0;i<project.areas.length;i++){
        // ROW VIZ
        var areaGeometry = JSON.parse(project.areas[i].geometry);
        if(project.areas[i].name.charAt(0) === "A"){
            alleyPolygonArray.push(areaGeometry);
        } else if(project.areas[i].name.charAt(0) === "T"){
            bedPolygonArray.push(areaGeometry);
        } else {
            alleyPolygonArray.push(areaGeometry);
        }
    }
    layout.treeRowArea = 0; // CHANGE THIS LATER ON WHEN AREAS ARE WORKING
    layout.bedPolygonArray = bedPolygonArray; // POPULATE THIS AS WELL WITH AREA
    layout.alleyPolygonArray = alleyPolygonArray;
    // COUNT ASSETS


    // COMBINE ASSETS AND ROW BASED

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
        for(j = 0; j < treeAssetsArray.length; j++){
            if(treeAssetsArray[j].species.nameCommon === uniqueSpecies[i])
                count = count + 1;
        }
        speciesCount = {
            id: uniqueSpecies[i],
            uniqueCount: count
        };
        uniqueSpeciesCount.push(speciesCount);
    }
    layout.uniqueSpeciesCount = uniqueSpeciesCount;
    var uniqueTreeSpecies = unique(treeArray);
    layout.uniqueSpecies = uniqueTreeSpecies;
    // JUST SEND BLANK
    layout.offsetArray = [];

    return (layout);
};

module.exports = gisObj;