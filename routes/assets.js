var express = require("express");
var router = express.Router();
var Asset = require("../models/asset");
var Layer = require("../models/layer");
var middleware = require("../middleware");

// ASSET INDEX ROUTE
router.get("/assets", middleware.isLoggedIn, function(req, res){
    // Get all assets from DB
    Asset.find({'owner.id': req.user._id}, function(err, allAssets){
        if(err) {
            console.log(err);
        } else {
            res.render("assets/index", {assets: allAssets});
        }
    });
});

// ASSET NEW ROUTE
router.get("/assets/new", middleware.isLoggedIn, function(req, res){
    Layer.find({'owner.id': req.user._id}, function(err, foundLayers){
        if(err){
            console.log(err);
        } else {
            // console.log("Reached this far");
            // foundLayers.forEach(function(layer){
            //     console.log(layer.id);
            // });
            res.render("assets/new", {layers: foundLayers});
        }
    });
});

// ASSET CREATE ROUTE
router.post("/assets", middleware.isLoggedIn, function(req, res){
    // Create a new experience
    Asset.create(req.body.asset, function(err, createdAsset){
        if(err){
            console.log(err);
        } else {
            // Add username and ID to experience
            createdAsset.owner.id = req.user._id;
            createdAsset.owner.username = req.user.username;
            // Save the asset - Not needed if created after this step
            createdAsset.save();
            res.redirect("/assets");
        }
    });
});

// ASSET SHOW ROUTES
router.get("/assets/:id", middleware.isLoggedIn, function(req, res){
    // Find specific asset
    Asset.findById(req.params.id).populate("layer").exec(function(err, foundAsset){
        if(err){
            console.log(err);
        } else {
            res.render("assets/show", {asset: foundAsset});
        }
    });
});

// ASSET EDIT ROUTE

// ASSET UPDATE ROUTE

// ASSET DELETE ROUTE
router.delete("/assets/:id", middleware.isLoggedIn, function(req, res){ // MAKE ACTIVITY OWNERSHIP MIDDLEWARE
    Asset.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/assets");
        } else {
            res.redirect("/assets");
        }
    });
});

module.exports = router;