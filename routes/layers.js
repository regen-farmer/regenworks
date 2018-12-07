var express = require("express");
var router = express.Router();
var Layer = require("../models/layer");
var Parcel = require("../models/parcel");
var middleware = require("../middleware");
var logger = require("../middleware/logger");

// LAYER INDEX ROUTE

// NESTED PARCEL LAYER NEW ROUTE
router.get("/parcels/:id/layers/new", middleware.isLoggedIn, function(req, res){
    // FIND PARCEL ID
    Parcel.findById(req.params.id, function(err, foundParcel){
        if(err) {
            console.log(err);
            logger.error(err.message);
            // res.flash(err
        } else {
            res.render("layers/new", {parcel: foundParcel});
        }
    });
});

// NESTED PARCEL LAYER CREATE ROUTE
router.post("/parcels/:id/layers", middleware.checkParcelOwnership, function(req, res){
    // Lookup place using id
    Parcel.findById(req.params.id, function(err, foundParcel){
        if(err) {
            console.log(err);
            res.redirect("/parcels");
        } else {
            Layer.create(req.body.layer, function (err, layer) {
                if (err) {
                    console.log(err);
                } else {
                    // Add username and ID to Layer.
                    layer.owner.id = req.user._id;
                    layer.owner.username = req.user.username;
                    // Save the layer
                    layer.save();
                    // Save JSON file to geometry
                    layer.geometry = req.body.geometry;
                    layer.size = req.body.layersize;
                    // Save the layer
                    layer.save();
                    // Connect new layer to parcel
                    foundParcel.layers.push(layer); // MOVE THIS UP TO AVOID ERRORS IF LAYER FAILS?!!!
                    foundParcel.save();
                    console.log(layer);
                    // Redirect to parcels SHOW page
                    // req.flash("success", "Successfully added comment");
                    res.redirect("/parcels/" + foundParcel._id);
                }
            });
        }
    });
});

// LAYER SHOW ROUTES
router.get("/layers/:id", middleware.isLoggedIn, function(req, res){ // MAKE LAYER OWNERSHIP MIDDLEWARE
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            res.render("layers/show", {layer: foundLayer});
        }
    });
});

// LAYER EDIT ROUTE
router.get("/layers/:id/edit", middleware.isLoggedIn, function(req, res){ // MAKE LAYER OWNERSHIP MIDDLEWARE
    // Find specific activity in database
    Layer.findById(req.params.id, function(err, foundLayer){
        if(err){
            console.log(err);
        } else {
            res.render("layers/edit", {layer: foundLayer});
        }
    });
});

// LAYER UPDATE ROUTE
router.put("/layers/:id", middleware.isLoggedIn, function(req, res){
    Layer.findByIdAndUpdate(req.params.id, req.body.layer, function(err, updatedLayer){
        if(err) {
            console.log(err);
        } else {
            console.log(updatedLayer);
            res.redirect("/layers/" + req.params.id);
        }
    });
});

// LAYER DELETE ROUTE
router.delete("/layers/:id", middleware.isLoggedIn, function(req, res){ // CHECK OWNERSHIP
    Layer.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/parcels");
        } else {
            res.redirect("/parcels");
        }
    });
});

module.exports = router;