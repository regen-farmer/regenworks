var express = require("express");
var router = express.Router();
var Parcel = require("../models/parcel");
var middleware = require("../middleware");


// PARCEL NOTES
router.get("/parcels/:id/notes", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL
    Parcel.findById(req.params.id).populate("layers").exec(function(err, foundParcel){
        if(err){
            console.log(err);
        } else {
            // RENDER ACTIVITIES
            res.render("notes/index", {parcel: foundParcel})
        }
    });
});

module.exports = router;