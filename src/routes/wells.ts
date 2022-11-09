import express from "express";
var router = express.Router();
// import Well from "../models/well";
import Parcel from "../models/parcel";
import middleware from "../middleware";
import logger from "../middleware/logger";
// import Species from "../models/species";
// import Animal from "../models/animal";

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


export default router;
