var express = require("express");
var router = express.Router();
var Parcel = require("../models/parcel");
var Note = require("../models/note");
var middleware = require("../middleware");


// PARCEL NOTES
router.get("/parcels/:id/notes", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate({path:'layers', populate:{path:'rows'}}).exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            // RENDER ACTIVITIES
            res.render("notes/index", {parcel: foundParcel})
        }
    });
});

// --------------- NESTED ROUTES ROW BASED ---------------- //


router.get("/parcels/:id/layers/:pid/rows/:rid/notes/new", middleware.isLoggedIn, function(req, res){
    // RENDER NEW ACTIVITY PAGE
    res.render("notes/rownew", {parcelid: req.params.id, layerid: req.params.pid, rowid: req.params.rid})
});

// CREATE NOTE ON ROW
router.post("/parcels/:id/layers/:pid/rows/:rid/notes", middleware.isLoggedIn, function(req, res){
    // CREATE ACTIVITY
    Note.create(req.body.note, function(err, createdNote){
        if(err){
            console.log(err);
        } else {
            Row.findByIdAndUpdate(req.params.rid, { $push: { notes : createdNote } }, function(err, updatedRow){
                if(err){
                    console.log(err);
                } else {
                    res.redirect("/parcels/" + req.params.id + "/notes")
                }
            });
        }
    });
});


// --------------- NESTED ROUTES ROW BASED ---------------- //

module.exports = router;