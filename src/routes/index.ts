import express from "express";
var router = express.Router();
import User from "../models/user";
import Parcel from "../models/parcel";
import Activity from "../models/activity";
import middleware from "../middleware"; // Will automatically require the middleware "index" file as the standard

import logger from "../middleware/logger";

// ROOT ROUTE
router.get("/", function(req, res){
    res.render("login")
});

// ABOUT ROUTE
router.get("/about", function(req, res){
    res.render("about");
});

// TERMS ROUTE
router.get("/terms", function(req, res){
    res.render("terms");
});

// PRIVACY ROUTE
router.get("/privacy", function(req, res){
    res.render("privacy");
});

// FEEDBACK ROUTE
router.get("/feedback", middleware.isLoggedIn, function(req, res){
    res.render("feedback");
});

// COMPOSITION ROUTE
router.get("/composition", middleware.isLoggedIn, function(req, res){
    res.render("composition");
});

// SUCCESSION ROUTE
router.get("/succession", middleware.isLoggedIn, function(req, res){
    res.render("succession");
});

// QUESTIONNAIRE ROUTE
router.get("/questionnaire", function(req, res){
    res.render("questionnaire");
});

// SUPPORT ROUTE
router.get("/support", function(req, res){
    res.render("support");
});

// PLANNING ROUTE
router.get("/planning", middleware.isLoggedIn, function(req, res){
    res.render("planning");
});

// DASHBOARD ROUTE
router.get("/dashboard", middleware.isLoggedIn, function(req, res){
    //@ts-ignore
    Parcel.find({'owner.id': req.user._id}, function(err, allParcels){
        if(err) {
            console.log(err);
        } else {
            //@ts-ignore
            Activity.find({'owner.id': req.user._id}, function(err, allActivities){
                if(err) {
                    console.log(err);
                } else {
                    allActivities.sort(function(a, b){
                        return Date.parse(a.start.date.toString()) - Date.parse(b.start.date.toString());
                    });
                    allActivities.slice(0,4);
                    res.render("dashboard", {activities: allActivities, parcels: allParcels});
                }
            });
        }
    });
});

// NEW USER ROUTE
// router.get("/users/new", function(req, res){
//     logger.info('Sign up page requested', {timestamp: Date.now()});
//     res.render("users/new");
// });

// robots.txt
router.get('/robots.txt', function (req, res) {
    res.type('text/plain');
    res.send("User-agent: *\nDisallow: /");
});

// ADMIN PANEL
router.get("/admindash", middleware.adminIsLoggedIn, function(req, res){
    // GET LOGS

    res.render("admin")
});


// SHOW USER ROUTE
router.get("/users/:id", middleware.checkUserOwnership, function(req, res){
    User.findById(req.params.id).populate("parcels").exec(function(err, foundUser){
        if(err) {
            console.log(err);
        } else {
            res.render("users/show", {user: foundUser});
        }
    });
});

// USER EDIT ROUTE
router.get("/users/:id/edit", middleware.checkUserOwnership, function(req, res){
    User.findById(req.params.id, function(err, foundUser){
        if(err) {
            console.log(err);
        } else {
            res.render("users/edit", {user: foundUser});
        }
    });
});

// USER UPDATE ROUTE
router.put("/users/:id", middleware.checkUserOwnership, function(req, res){
    User.findByIdAndUpdate(req.params.id, req.body.user, function(err, updatedUser){
        if (err) {
            // flash with updatedUser
            console.log(err);
        } else {
            // flash with updatedUser
            res.redirect("/users/" + req.params.id);
        }
    });
});

// USER DELETE ROUTE
router.delete("/users/:id", middleware.checkUserOwnership, async function(req, res){
    try {

        let user = await User.findByIdAndRemove(req.params.id);
        
        // Flash message
        logger.info('User "' + user?.email + '" was deleted', {timestamp: Date.now()});
        res.redirect("/parcels");
    }
    catch (err){
        console.log(err);
        // Flash message
        res.redirect("/parcels");
    } 
});


// SET CURRENTPROJECT //
router.post("/users/:id/currentproject/", middleware.checkUserOwnership, function(req, res){
    //@ts-ignore
    User.findById(req.user._id, function(err, foundUser){
        if(err) {
            console.log(err);
        } else {
            Parcel.findById(req.body.parcelid, function(err, foundParcel) {
                if (err) {
                    console.log(err);
                } else {
                    foundUser.currentProject = foundParcel;
                    foundUser.save();
                    console.log(foundParcel.name + " has been set to active project");
                    res.redirect("/parcels/" + foundParcel._id);
                }
            });
        }
    });
});

// PARCEL STATUS PAGE
router.get("/parcels/:id/status", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate({path:'layers', populate:{path: 'soiltests'}}).exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            // RENDER ACTIVITIES
            res.render("status", {parcel: foundParcel})
        }
    });
});

export default router;