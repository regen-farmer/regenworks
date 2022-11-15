import express from "express";
var router = express.Router();
import Parcel from "../models/parcel";
import Activity, { IActivitySchema } from "../models/activity";
import Layer from "../models/layer";
import Project, { IProjectSchema } from "../models/project";
import Row, { IRowSchema } from "../models/row";
import Area from "../models/area";
import middleware from "../middleware";

// NODE GEOCODER CODE
import NodeGeocoder from "node-geocoder";
import unique from "array-unique";

var options:NodeGeocoder.Options = {
    provider: "google",
    apiKey: process.env.GEOCODER_API_KEY,
    formatter: null
};

var geocoder = NodeGeocoder(options);

// ACTIVITY INDEX ROUTE
router.get("/activities", middleware.isLoggedIn, function(req:any, res){
    // Get all activities from DB
    Activity.find({'owner.id': req.user._id}, function(err, allActivities){
        if(err) {
            console.log(err);
        } else {
            allActivities.sort(function(a, b){
                return Date.parse(a.start.date.toString()) - Date.parse(b.start.date.toString());
            });
            allActivities.slice(0,4);
            res.render("activities/index", {activities: allActivities});
        }
    });
});

// ACTIVITY NEW ROUTE
router.get("/activities/new", middleware.isLoggedIn, function(req:any, res){
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
router.post("/activities", middleware.isLoggedIn, function(req:any, res){
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
router.get("/activities/:id", middleware.isLoggedIn, async function(req, res){
    try {
        let foundActivity = await Activity.findById(req.params.id).populate("layer").exec();
        if(foundActivity) {
            var dateParts = foundActivity?.start.date.split("-");
            const monthNames = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ];
            var monthNumber = parseInt(dateParts[1], 10) - 1;
            var month = monthNames[monthNumber];
            var day = parseInt(dateParts[2], 10);
            res.render("activities/show", {activity: foundActivity, month: month, day: day});
        } else {
            console.log("No activity found");
        }
    } catch(err) {
        console.log(err);
    }
});

// ACTIVITY EDIT ROUTE
router.get("/activities/:id/edit", middleware.isLoggedIn, function(req:any, res){ // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
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
router.delete("/activities/:id", middleware.isLoggedIn, async function(req, res){ // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
    try {
        await Activity.findByIdAndRemove(req.params.id);
        res.redirect("/activities");
    } catch(err) {
        console.log(err);
        res.redirect("/activities");
    }
});


// --------------- NESTED ROUTES ---------------- //

// PARCEL ACTIVITIES
router.get("/parcels/:id/activities", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate({path:'layers', populate:{path:'rows'}}).populate({path:'layers', populate:{path:'areas'}}).exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            // RENDER ACTIVITIES
            res.render("activities/index", {parcel: foundParcel})
        }
    });
});

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
router.post("/parcels/:id/activities", middleware.isLoggedIn, function(req:any, res){
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
router.post("/projects/:id/activities", middleware.isLoggedIn, function(req:any, res){
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
router.get("/projects/:id/generateactivities", middleware.isLoggedIn, async function(req, res){
    // FIND PROJECT
    try {
        let foundProject = await Project.findById(req.params.id).populate({path:'budgets.establishment', populate:{path:'postings'}}).exec();    
        if (foundProject){
        var activityArray: any[] = [];
            for(let i=0;i<foundProject.budgets.establishment.postings.length;i++){
                var activity:any = {
                    status: false,
                    automated: true
                };
                if(foundProject.budgets.establishment.postings[i].postType === "material"){
                    activity.name = "Acquire: " + foundProject.budgets.establishment.postings[i].name;
                } else {
                    activity.name = "Perform: " + foundProject.budgets.establishment.postings[i].name
                }
                activityArray.push(activity);
            }
            console.log("Activity array length" + activityArray.length);
            try {
                let createdActivities = await Activity.insertMany(activityArray);
                try {
                    let updatedBudget = await Project.findByIdAndUpdate(foundProject._id, { $push: { activities: { $each: createdActivities } } });
                    console.log("Activities added to project implementation plan");
                    res.redirect("/projects/" + foundProject._id);
                }
                catch (err){
                    console.log(err);
                }
                
            } catch (err){
                console.log(err);
            } 
        }
    } catch (err){
        console.log(err);
    }
    
            
       
});

// PROJECT EDIT ACTIVITY ROUTE
router.get("/projects/:id/activities/:pid/edit", middleware.isLoggedIn, function(req, res){
    // FIND PROJECT WITH ACTIVITY
    Project.findById(req.params.id, function(err, foundProject: IProjectSchema){
        if(err){
            console.log(err);
        } else {
            Activity.findById(req.params.pid, function(err, foundActivity){
                if(err){
                    console.log(err);
                } else {
                    // RENDER EDIT PAGE
                    res.render("projects/editactivity", {project: foundProject, activity: foundActivity});
                }
            });
        }
    });
});

// PROJECT UPDATE ACTIVITY ROUTE
router.put("/projects/:id/activities/:pid", middleware.isLoggedIn, async function(req, res){
   // FIND ACTIVITY AND UPDATE
   try {
       let updatedActivity = await Activity.findByIdAndUpdate(req.params.pid, req.body.activity);
       res.redirect("/projects/" + req.params.id);
   }
    catch (err){
        console.log(err);
    } 
});


// DELETE ACTIVITY IN PROJECT
router.delete("/projects/:id/activities/:pid", middleware.isLoggedIn, function(req, res){
    // FIND ACTIVITY
    Activity.findById(req.params.pid, function(err, foundActivity){
        if(err){
            console.log(err);
        } else {
            // FIND PROJECT
            Project.findById(req.params.id, async function(err, updatedProject: IProjectSchema){
                if(err){
                    console.log(err)
                } else {
                    // REMOVE ACTIVITY FROM PROJECT
                    // @ts-ignore
                    updatedProject.activities.remove(foundActivity);
                    updatedProject.save();
                    // DELETE ACTIVITY
                    try {
                        await Activity.findByIdAndRemove(req.params.pid);
                        res.redirect("/projects/" + updatedProject._id);
                    } catch(err){
                        console.log(err);
                    }
                }
            });
        }
    });
});

// --------------- NESTED ROUTES ROW BASED ---------------- //


router.get("/parcels/:id/layers/:pid/rows/:rid/activities/new", middleware.isLoggedIn, async function(req, res){
    // FIND ROW SEQUENCE SPECIES
    try {
        let foundRow = await Row.findById(req.params.rid).populate({path:'sequence', populate:{path:'model.species'}}).exec();
        // FIND ALL SPECIES
        if(foundRow && foundRow.sequence){
            console.log("species there");
            var allSpecies:any[] = [];
            foundRow.sequence.model.forEach(function(species){
                allSpecies.push(species.species);
            });
            // FIND UNIQUE SPECIES / REMOVE DUPLICATES
            var uniqueSpecies = unique(allSpecies);
            console.log(uniqueSpecies);
            res.render("activities/rownew", {parcelid: req.params.id, layerid: req.params.pid, rowid: req.params.rid, row: foundRow, species: uniqueSpecies})
        } else {
            res.redirect("back");
        }
    } catch(err){
        console.log(err);
    }
});

router.post("/parcels/:id/layers/:pid/rows/:rid/activities", middleware.isLoggedIn, async function(req, res){
   // CREATE ACTIVITY
    var types = req.body.activityType.split(" ");
    var activity = {
        activityType: types[0],
        subtype: types[1],
        name: req.body.activity.name,
        description: req.body.activity.description,
        start: {
            date: req.body.activity.start.date
        },
        time: req.body.activity.time,
        species: req.body.activity.species
    };
    try {
        let createdActivity = await Activity.create(activity);
        try {

            let updatedRow = Row.findByIdAndUpdate(req.params.rid, { $push: { activities: createdActivity } })
            res.redirect("/parcels/" + req.params.id + "/activities")
        }
        catch(err){
            console.log(err);
        } 
    }
    catch(err){
        console.log(err);
    }
   
   
            
       
});


// --------------- NESTED ROUTES AREA BASED ---------------- //


router.get("/parcels/:id/layers/:pid/areas/:rid/activities/new", middleware.isLoggedIn, async function(req, res){
    // FIND AREA ROTATION SPECIES
    
    try{
        let foundArea = await Area.findById(req.params.rid).populate({path:'rotation', populate:{path:'model.speciesmix.species'}}).exec()
        // FIND ALL SPECIES
        if(foundArea && foundArea.rotation){
            console.log("species there");
            var allSpecies:any[] = [];
            foundArea.rotation.model.forEach(function(speciesmix){
                allSpecies.push(speciesmix.speciesmix[0].species);
            });
            // FIND UNIQUE SPECIES / REMOVE DUPLICATES
            var uniqueSpecies = unique(allSpecies);
            console.log(uniqueSpecies);
            res.render("activities/areanew", {parcelid: req.params.id, layerid: req.params.pid, areaid: req.params.rid, area: foundArea, species: uniqueSpecies})
        } else {
            res.redirect("back");
        }
    }
        catch (err){
            console.log(err);
        } 
            
});

router.post("/parcels/:id/layers/:pid/areas/:rid/activities", middleware.isLoggedIn, function(req, res){
    // CREATE ACTIVITY
    var types = req.body.activityType.split(" ");
    var activity = {
        activityType: types[0],
        subtype: types[1],
        name: req.body.activity.name,
        description: req.body.activity.description,
        start: {
            date: req.body.activity.start.date
        },
        time: req.body.activity.time,
        species: req.body.activity.species
    };
    Activity.create(activity, function(err, createdActivity){
        if(err){
            console.log(err);
        } else {
            Area.findByIdAndUpdate(req.params.rid, { $push: { activities: createdActivity } }, function(err, updatedArea){
                if(err){
                    console.log(err);
                } else {
                    res.redirect("/parcels/" + req.params.id + "/activities")
                }
            });
        }
    });
});

export default router;