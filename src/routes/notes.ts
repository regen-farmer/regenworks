var express = require("express");
var router = express.Router();
import Parcel from "../models/parcel";
import Note from "../models/note";
import Row from "../models/row";
import Area from "../models/area";
var middleware = require("../middleware");


// PARCEL NOTES
router.get("/parcels/:id/notes", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate({path:'layers', populate:{path:'rows', populate:{path:'notes'}}}).populate({path:'layers', populate:{path:'areas', populate:{path:'notes'}}}).exec(function(err, foundParcel){
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


router.get("/parcels/:id/layers/:pid/areas/:rid/notes/new", middleware.isLoggedIn, function(req, res){
    // RENDER NEW ACTIVITY PAGE
    res.render("notes/areanew", {parcelid: req.params.id, layerid: req.params.pid, areaid: req.params.rid})
});

// CREATE NOTE ON ROW
router.post("/parcels/:id/layers/:pid/areas/:rid/notes", middleware.isLoggedIn, function(req, res){
    // CREATE ACTIVITY
    Note.create(req.body.note, function(err, createdNote){
        if(err){
            console.log(err);
        } else {
            Area.findByIdAndUpdate(req.params.rid, { $push: { notes : createdNote } }, function(err, updatedArea){
                if(err){
                    console.log(err);
                } else {
                    res.redirect("/parcels/" + req.params.id + "/notes")
                }
            });
        }
    });
});

module.exports = router;