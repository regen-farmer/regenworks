var express = require("express");
var router = express.Router();
var NurseryProduct = require("../models/nurseryproduct");
var Nursery = require("../models/nursery");
var Species = require("../models/species");
var middleware = require("../middleware");


// NURSERY PRODUCT NURSERY NEW
router.get("/nurseries/:id/nurseryproducts/new", middleware.isLoggedIn, function(req, res){
    // FIND NURSERY
    Nursery.findById(req.params.id, function(err, foundNursery){
        if(err){
            console.log(err);
        } else {
            // FIND ALL SPECIES
            Species.find(function(err, allSpecies){
                if(err) {
                    console.log(err);
                } else {
                    // SORT SPECIES
                    function compare(a, b) {
                        if (a.genus < b.genus) {
                            return -1;
                        }
                        if (a.genus > b.genus) {
                            return 1;
                        }
                        return 0;
                    }
                    allSpecies.sort(compare);
                    res.render("nurseryproducts/new", {nursery: foundNursery, species: allSpecies});
                }
            });
        }
    });
});

// NURSERY PRODUCT NURSERY CREATE
router.post("/nurseries/:id/nurseryproducts", middleware.isLoggedIn, function(req, res){
    // CLEAN NONE OPTIONS
    var product = req.body.product;
    if(req.body.product.species === ""){
        delete product.species;
    }
    if(req.body.product.hybrid === ""){
        delete product.hybrid;
    }
    if(req.body.product.rootstock === ""){
        delete product.rootstock;
    }
    // FIND NURSERY
    Nursery.findById(req.params.id, function(err, foundNursery){
        if(err){
            console.log(err);
        } else {
            // CREATE PRODUCT
            NurseryProduct.create(product, function(err, createdProduct){
                if(err){
                    console.log(err);
                } else {
                    // SET OWNERSHIP
                    createdProduct.owner.id = req.user._id;
                    createdProduct.owner.username = req.user.username;
                    createdProduct.save();
                    // INSERT PRODUCT IN NURSERY
                    foundNursery.products.push(createdProduct);
                    foundNursery.save();
                    // REDIRECT TO NURSERY
                    res.redirect("/nurseries/" + foundNursery._id);
                }
            });
        }
    });
});

// NURSERY PRODUCT SHOW
router.get("/nurseryproducts/:id", middleware.isLoggedIn, function(req, res){
    // FIND PRODUCT
    NurseryProduct.findById(req.params.id, function(err, foundProduct){
        if(err){
            console.log(err);
        } else {
            res.render("nurseryproduct/show", {product: foundProduct});
        }
    });
});


module.exports = router;