var express = require("express");
var router = express.Router();
var NurseryProduct = require("../models/nurseryproduct");
var Nursery = require("../models/nursery");
var Species = require("../models/species");
var middleware = require("../middleware");

// ADMIN ALL VARIETIES
router.get("/nurseryproducts", middleware.adminIsLoggedIn, function(req, res){
    NurseryProduct.find().populate("species").populate("rootstock").populate("hybrid").exec(function(err, foundNurseryProducts){
        if(err){
            console.log(err);
        } else {
            res.render("nurseryproducts/index", {products: foundNurseryProducts});
        }
    });
});

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
    if(req.body.product.availability){
        product.availability = true;
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
router.get("/nurseries/:id/nurseryproducts/:pid", middleware.isLoggedIn, function(req, res){
    // FIND NURSERY
    Nursery.findById(req.params.id, function(err, foundNursery){
        if(err){
            console.log(err);
        } else {
            // FIND PRODUCT
            NurseryProduct.findById(req.params.pid).populate("species").populate("rootstock").populate("hybrid").exec(function(err, foundProduct){
                if(err){
                    console.log(err)
                } else {
                    res.render("nurseryproducts/show", {nursery: foundNursery, product: foundProduct});
                }
            });
        }
    });
});

// NURSERY PRODUCT EDIT
router.get("/nurseries/:id/nurseryproducts/:pid/edit", middleware.isLoggedIn, function(req, res){
    // FIND NURSERY
    Nursery.findById(req.params.id, function(err, foundNursery){
        if(err){
            console.log(err);
        } else {
            // FIND PRODUCT
            NurseryProduct.findById(req.params.pid).populate("species").populate("rootstock").populate("hybrid").exec(function(err, foundProduct){
                if(err){
                    console.log(err)
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
                            res.render("nurseryproducts/edit", {nursery: foundNursery, product: foundProduct, species: allSpecies});
                        }
                    });
                }
            });
        }
    });
});

// NURSERY PRODUCT UPDATE
router.put("/nurseries/:id/nurseryproducts/:pid", middleware.isLoggedIn, function(req, res){
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
    if(req.body.product.availability){
        product.availability = true;
    } else {
        product.availability = false;
    }
    console.log(req.body.product.availability);
    console.log(typeof req.body.product.availability);
    NurseryProduct.findByIdAndUpdate(req.params.pid, product, function(err, updatedProduct){
        if(err){
            console.log(err);
        } else {
            // REDIRECT TO PRODUCT
            /*if(req.body.product.hybrid === ""){
                updatedProduct.hybrid = {};
                updatedProduct.save();
            }
            if(req.body.product.rootstock === ""){
                delete updatedProduct.rootstock;
                updatedProduct.save();
            }*/
            res.redirect("/nurseries/" + req.params.id + "/nurseryproducts/" + updatedProduct._id);
        }
    });
});


// NURSERY PRODUCT DUPLICATE


module.exports = router;