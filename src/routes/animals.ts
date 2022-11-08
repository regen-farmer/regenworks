import express from "express";
var router = express.Router();
import Animal from "../models/animal";
var middleware = require("../middleware");

// ANIMAL INDEX
router.get("/animals", middleware.isLoggedIn, function(req, res){
    Animal.find(function(err, foundAnimals){
        if(err){
            console.log(err);
        } else {
            res.render("animals/index", {animals: foundAnimals});
        }
    })
});

// ANIMAL NEW
router.get("/animals/new", middleware.isLoggedIn, function(req, res){ // ADMIN LOGIN REQUIRED
    res.render("animals/new");
});

// ANIMAL CREATE
router.post("/animals", middleware.isLoggedIn, function(req, res){
    Animal.create(req.body.animal, function(err, createdAnimal){
        if(err){
            console.log(err);
        } else {
            console.log("Animal created: " + createdAnimal);
            res.redirect("/animals");
        }
    });
});

module.exports = router;