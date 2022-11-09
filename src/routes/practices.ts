import express from "express";
var router = express.Router();
import Practice from "../models/practice";
import Parcel from "../models/parcel";
import middleware from "../middleware";

// PRACTICE INDEX ROUTE

// PRACTICE NEW ROUTE

// PRACTICE CREATE ROUTE

// PRACTICE SHOW ROUTE - NEED TO REFACTOR FOR NO PARCEL ID QUERY
router.get("/practices/:id", middleware.isLoggedIn, function(req:any, res){
    Practice.findById(req.params.id, function(err, foundPractice){
        if(err){
            console.log(err);
        } else {
            Parcel.findById(req.query.parcelid, function(err, foundParcel){
                if(err){
                    console.log(err);
                } else {
                    if(foundParcel.owner.id.equals(req.user._id)){ // REFACTOR OWNERSHIP MIDDLEWARE?!?! WORKS FOR NOW
                        console.log(foundParcel);
                        res.render("practices/show", {practice: foundPractice, parcel: foundParcel});
                    } else {
                        // req.flash("error", "You don't have permission to do that.");
                        res.redirect("back");
                    }
                }
            });
        }
    });
});

// PRACTICE UPDATE ROUTE

// PRACTICE DELETE ROUTE

export default router;