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
    Project.findById(req.params.id).populate("layer").populate("budget").populate("system").populate("activities").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            res.render("projects/show", {project: foundProject});
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
            System.findById(foundProject.system).populate("rows.sequense").exec(function(err, foundSystem){
                // GET GEOMETRY
                var polygon = JSON.parse(foundProject.layer.geometry);
                // SET ROW WIDTH
                var rowWidth = foundSystem.rows[0].width;
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
                    var bufferLine1 = buffer(line, distance, {units: "meters"});
                    var rowPoints1 = lineIntersect(bufferLine1, polygon);
                    var row1 = turf.lineString([[rowPoints1.features[0].geometry.coordinates[0],rowPoints1.features[0].geometry.coordinates[1]],[rowPoints1.features[1].geometry.coordinates[0],rowPoints1.features[1].geometry.coordinates[1]]],{name: "line-0" + i });
                    rowArray.push(row1);
                    distance = distance + rowWidth;
                }
                // CREATE FEATURECOLLECTION
                var featurecollection = turf.featureCollection(rowArray);
                // OFFSET LINE
                var offsetline = lineOffset(line, -(3),{units: "meters"});
                var rowPoints = lineIntersect(offsetline, polygon);
                var row = turf.lineString([[rowPoints.features[0].geometry.coordinates[0],rowPoints.features[0].geometry.coordinates[1]],[rowPoints.features[1].geometry.coordinates[0],rowPoints.features[1].geometry.coordinates[1]]],{name: "line-2"});
                var stringline = JSON.stringify(row);
                var stringbox = JSON.stringify(box);
                var collection = JSON.stringify(featurecollection);
                // CALCULATE TREE COUNT
                var areaSize = foundProject.layer.size;
                // FIND ALL SPECIES IN PROJECT SYSTEM
                var allSpecies = [];
                var width = 0;
                foundSystem.rows.forEach(function(row){
                    row.sequense.forEach(function(species){
                        allSpecies.push(species.nameCommon);
                    });
                    width = width + row.width;
                });
                // GRID SIZE
                var areaGrid = width * width;
                var gridCount = areaSize / areaGrid;
                // COPY ALL SPECIES
                var allSpeciesCopy = [];
                for(i=0;allSpecies.length > i;i++){
                    allSpeciesCopy.push(allSpecies[i]);
                }
                // FIND UNIQUE SPECIES / REMOVE DUPLICATES
                var uniqueSpecies = unique(allSpeciesCopy);
                // UNIQUE ITEM COUNTS
                console.log(allSpecies);
                var uniqueSpeciesCount = [];
                for(i=0;uniqueSpecies.length > i;i++){
                    var count = 0;
                    for(j = 0; j < allSpecies.length; j++){
                        if(allSpecies[j] === uniqueSpecies[i])
                            count = count + 1;
                    }
                    console.log(count);
                    speciesCount = {
                        id: uniqueSpecies[i],
                        uniqueCount: Math.floor(count * gridCount)
                    };
                    uniqueSpeciesCount.push(speciesCount);
                }
                res.render("projects/layout", {project: foundProject, system: foundSystem, stringbox: stringbox, stringline: stringline, collection: collection, species: uniqueSpeciesCount});
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

// SERVICES DELETE ROUTE
router.delete("/projects/:id", middleware.isLoggedIn, function(req, res){ // MAKE PROJECT OWNERSHIP MIDDLEWARE
    Project.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/projects");
        } else {
            res.redirect("/projects");
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
                    System.findById(req.body.systemid).populate("rows.sequense").exec(function(err, foundSystem){
                        if(err){
                            console.log(err);
                        } else {
                            // CREATE CURRENCY
                            var budget = {
                                currency: "usd",
                                name: "Establishment budget"
                            };
                            Budget.create(budget, function(err, createdBudget){
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
                                    createdProject.budget = createdBudget;
                                    // Save the service
                                    createdProject.save();
                                    // Connect new service to place
                                    foundLayer.projects.push(createdProject);
                                    foundLayer.save();
                                    // CREATE POSTINGS
                                    // FIND ALL SPECIES IN PROJECT SYSTEM
                                    var allSpecies = [];
                                    foundSystem.rows.forEach(function(row){
                                        row.sequense.forEach(function(species){
                                            allSpecies.push(species.id);
                                        });
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
                                            // CREATE ACTIVITIES
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
                                            });
                                            // SAVE POSTINGS
                                            Budget.findByIdAndUpdate(createdBudget._id, {$addToSet: {postings: { $each: postings }}}, function(err, updatedBudget){
                                                if(err){
                                                    console.log(err);
                                                } else {
                                                    // req.flash("success", "Successfully added comment");
                                                    res.redirect("/projects/" + createdProject._id);
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