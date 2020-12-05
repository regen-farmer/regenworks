var express = require("express");
var router = express.Router();
var Parcel = require("../models/parcel");
var Activity = require("../models/activity");
var Layer = require("../models/layer");
var Project = require("../models/project");
var geodist = require("geodist"); // TO CALCULATE DISTANCE BETWEEN COORDINATES
var middleware = require("../middleware");

// NODE GEOCODER CODE
var NodeGeocoder = require("node-geocoder");

var options = {
    provier: "google",
    httpAdapter: "https",
    apiKey: process.env.GEOCODER_API_KEY,
    formatter: null
};

var geocoder = NodeGeocoder(options);

// ACTIVITY INDEX ROUTE
router.get("/activities", middleware.isLoggedIn, function(req, res){
    // Get all activities from DB
    Activity.find({'owner.id': req.user._id}, function(err, allActivities){
        if(err) {
            console.log(err);
        } else {
            allActivities.sort(function(a, b){
                return Date.parse(a.start.date) - Date.parse(b.start.date);
            });
            allActivities.slice(0,4);
            res.render("activities/index", {activities: allActivities});
        }
    });
});

// ACTIVITY NEW ROUTE
router.get("/activities/new", middleware.isLoggedIn, function(req, res){
    var parcel = undefined;
    console.log(req.body.picked);
    Layer.find({'owner.id': req.user._id}, function(err, foundLayers){
        if(err){
            console.log(err);
        } else {
            // console.log("Reached this far");
            // foundLayers.forEach(function(layer){
            //     console.log(layer.id);
            // });
            res.render("activities/new", {parcel: parcel, layers: foundLayers});
        }
    });
});

// ACTIVITY CREATE ROUTE
router.post("/activities", middleware.isLoggedIn, function(req, res){
    // Create a new experience
    Activity.create(req.body.activity, function(err, createdActivity){
        if(err){
            console.log(err);
        } else {
            // Add username and ID to experience
            createdActivity.owner.id = req.user._id;
            createdActivity.owner.username = req.user.username;
            createdActivity.status = true;
            // Save the service - Not need if created after this step
            createdActivity.save();
            res.redirect("/activities");
            console.log(createdActivity);
        }
    });
});

// ACTIVITY SHOW ROUTES
router.get("/activities/:id", middleware.isLoggedIn, function(req, res){
    Activity.findById(req.params.id).populate("layer").exec(function(err, foundActivity){
        if(err){
            console.log(err);
        } else {
            var dateParts = foundActivity.start.date.split("-");
            const monthNames = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ];
            var monthNumber = parseInt(dateParts[1], 10) - 1;
            var month = monthNames[monthNumber];
            var day = parseInt(dateParts[2], 10);
            res.render("activities/show", {activity: foundActivity, month: month, day: day});
        }
    });
});

// ACTIVITY EDIT ROUTE
router.get("/activities/:id/edit", middleware.isLoggedIn, function(req, res){ // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
    // Find specific activity in database
    Activity.findById(req.params.id, function(err, foundActivity){
        if(err){
            console.log(err);
        } else {
            Layer.find({'owner.id': req.user._id}, function(err, foundLayers){
                if(err){
                    console.log(err);
                } else {
                    console.log("Reached this far");
                    foundLayers.forEach(function(layer){
                        console.log(layer.id);
                    });
                    res.render("activities/edit", {activity: foundActivity, layers: foundLayers});
                }
            });
        }
    });
});

// ACTIVITY UPDATE ROUTE
router.put("/activities/:id", middleware.isLoggedIn, function(req, res){
    Activity.findByIdAndUpdate(req.params.id, req.body.activity, function(err, updatedActivity){
        if(err) {
            console.log(err);
        } else {
            console.log(updatedActivity);
            res.redirect("/activities/" + req.params.id);
        }
    });
});

// ACTIVITY STATUS CHANGE ROUTE


// ACTIVITY DELETE ROUTE
router.delete("/activities/:id", middleware.isLoggedIn, function(req, res){ // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
    Activity.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/activities");
        } else {
            res.redirect("/activities");
        }
    });
});


// --------------- NESTED ROUTES ---------------- //

// PLACE ACTIVITY NEW ROUTE
router.get("/parcels/:id/activities/new", middleware.isLoggedIn, function(req, res){
    // FIND PLACE ID
    Parcel.findById(req.params.id, function(err, foundparcel){
        if(err) {
            console.log(err);
            // res.flash(err
        } else {
            Layer.find({"type": "patch"}, function(err, foundLayers){
                if(err){
                    console.log(err);
                } else {
                    console.log("Reached this far");
                    foundLayers.forEach(function(layer){
                        console.log(layer.id);
                    });
                    res.render("activities/new", {parcel: foundparcel, layers: foundLayers});
                }
            });
        }
    });
});

// PLACE EXPERIENCES CREATE ROUTE
router.post("/parcels/:id/activities", middleware.isLoggedIn, function(req, res){
    // Lookup place using id
    Parcel.findById(req.params.id, function(err, foundParcel){
        if(err) {
            console.log(err);
            res.redirect("/parcels/" + req.params.id);
        } else {
            Activity.create(req.body.activity, function (err, activity) {
                if (err) {
                    console.log(err);
                } else {
                    console.log(activity);
                    // Add username and ID to task.
                    activity.owner.id = req.user._id;
                    activity.owner.username = req.user.username;
                    // Save the task
                    activity.save();
                    // Connect new task to parcel
                    foundParcel.activities.push(activity);
                    foundParcel.save();
                    // Redirect to parcels SHOW page
                    // req.flash("success", "Successfully added comment");
                    res.redirect("/parcels/" + foundParcel._id);
                }
            });
        }
    });
});

// PROJECT ACTIVITY NEW ROUTE
router.get("/projects/:id/activities/new", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            res.render("activities/new", {project: foundProject});
        }
    });
});

// PROJECT ACTIVITY CREATE ROUTE
router.post("/projects/:id/activities", middleware.isLoggedIn, function(req, res){
    Project.findById(req.params.id, function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            Activity.create(req.body.activity, function(err, createdActivity){
                if(err){
                    console.log(err);
                } else {
                    // Add username and ID to task.
                    createdActivity.status = true;
                    createdActivity.owner.id = req.user._id;
                    createdActivity.owner.username = req.user.username;
                    createdActivity.save();
                    // Connect new task to project
                    foundProject.activities.push(createdActivity);
                    foundProject.save();
                    // Redirect to project SHOW page
                    // req.flash("success", "Successfully added comment");
                    res.redirect("/projects/" + foundProject._id);
                }
            });
        }
    });
});

// GENERATE ACTIVITIES
router.get("/projects/:id/generateactivities", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT
    Project.findById(req.params.id).populate("budgets.establishment").exec(function(err, foundProject){
        if(err){
            console.log(err);
        } else {
            //
            var activityArray = [];
            for(i=0;i<foundProject.budgets.establishment.postings.length;i++){
                var activity = {
                    status: false,
                    automated: true
                };
                if(foundProject.budgets.establishment.postings.postType === "material"){
                    activity.name = "Acquire: " + foundProject.budgets.establishment.postings[i].name;
                } else {
                    activity.name = "Perform: " + foundProject.budgets.establishment.postings[i].name
                }
                activityArray.push(activity);
            }
            Activity.insertMany(activityArray, function(err, createdActivities){
                if(err){
                    console.log(err);
                } else {
                    Project.findByIdAndUpdate(foundProject._id, { $push: { activities: { $each: createdActivities } } }, function(err, updatedBudget){
                        if(err){
                            console.log(err);
                        } else {
                            console.log("Activities added to project implementation plan");
                            res.redirect("/projects/" + foundProject._id);
                        }
                    });
                }
            });
        }
    });
});

// --------------- NESTED ROUTES ---------------- //

module.exports = router;