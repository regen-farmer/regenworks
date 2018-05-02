var express = require("express");
var router = express.Router();
var passport = require("passport");
var User = require("../models/user");

// ROOT ROUTE
router.get("/", function(req, res){
    res.render("index");
});

// NEW USER ROUTE
router.get("/users/new", function(req, res){
    res.render("users/new");
});

// CREATE USER ROUTE
router.post("/users", function(req, res){
    var newUser = new User({username: req.body.user.username});
    User.register(newUser, req.body.user.password, function(err, user){
        if(err) {
            console.log(err);
            return res.render("users/new");
        }
        passport.authenticate("local")(req, res, function(){
            res.redirect("/places");
        });
    });
});

// SHOW USER ROUTE
router.get("/users/:id", function(req, res){
    User.findById(req.params.id, function(err, foundUser){
        if(err) {
            console.log(err);
        } else {
            res.render("users/show", {user: foundUser});
        }
    });
});

// USER EDIT ROUTE

// USER UPDATE ROUTE

// SHOW LOGIN FORM
router.get("/login", function(req, res) {
    res.render("login");
});

// HANDLE LOGIN LOGIC
router.post("/login", passport.authenticate("local",
    {
        successRedirect: "/places",
        failureRedirect: "/login"
    }), function (req, res) {
});

// LOGOUT ROUTE
router.get("/logout", function(req, res) {
    req.logout();
    // req.flash("success", "Logged you out!");
    res.redirect("/places");
});

module.exports = router;