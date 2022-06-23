var express = require("express");
var router = express.Router();
var Well = require("../models/well");
var Parcel = require("../models/parcel");
var middleware = require("../middleware");
const logger = require("../middleware/logger");
const Species = require("../models/species");
const Animal = require("../models/animal");

// NESTED PARCEL WELL NEW ROUTE
router.get("/parcels/:id/wells/new", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL ID
    Parcel.findById(req.params.id, function(err, foundParcel){
        if(err) {
            console.log(err);
            logger.error(err.message);
            // res.flash(err)
        } else {
            res.render("wells/new", {parcel: foundParcel});
        }
    });
});

// NESTED PARCEL WELL CREATE ROUTE


module.exports = router;
