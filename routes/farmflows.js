var express = require("express");
var router = express.Router();
var Farmflow = require("../models/farmflow");
var Species = require("../models/species");
var Parcel = require("../models/parcel");
var System = require("../models/system");
var middleware = require("../middleware");

// PARCEL FLOWS
router.get("/parcels/:id/farmflows", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate({path:'layers', populate:{path:'rows'}}).exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            // RENDER ACTIVITIES
            res.render("farmflows/index", {parcel: foundParcel})
        }
    });
});

// --------------- NESTED ROUTES ROW BASED ---------------- //

router.get("/parcels/:id/layers/:pid/rows/:rid/farmflows/new", middleware.isLoggedIn, function(req, res){
    // RENDER NEW ACTIVITY PAGE
    res.render("farmflows/rownew", {parcelid: req.params.id, layerid: req.params.pid, rowid: req.params.rid})
});

// CREATE NOTE ON ROW
router.post("/parcels/:id/layers/:pid/rows/:rid/farmflows", middleware.isLoggedIn, function(req, res){
    // CREATE ACTIVITY
    Farmflow.create(req.body.farmflow, function(err, createdFarmflow){
        if(err){
            console.log(err);
        } else {
            Row.findByIdAndUpdate(req.params.rid, { $push: { farmflows : createdFarmflow } }, function(err, updatedRow){
                if(err){
                    console.log(err);
                } else {
                    res.redirect("/parcels/" + req.params.id + "/farmflows")
                }
            });
        }
    });
});

module.exports = router;