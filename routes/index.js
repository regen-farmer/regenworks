var express = require("express");
var router = express.Router();
var passport = require("passport");
var User = require("../models/user");
var middleware = require("../middleware"); // Will automatically require the middleware "index" file as the standard
var async = require("async"); // “waterfall” - makes sure the function are called in sequence without using any callbacks.
var nodemailer = require("nodemailer"); // used to send emails from node.js - for example via gmail.
var crypto = require("crypto");

// ROOT ROUTE
router.get("/", function(req, res){
    res.render("index");
});

// ABOUT ROUTE
router.get("/about", function(req, res){
    res.render("about");
});

// SUPPORT ROUTE
router.get("/support", function(req, res){
    res.render("support");
});

// NEW USER ROUTE
router.get("/users/new", function(req, res){
    res.render("users/new");
});

// CREATE USER ROUTE
router.post("/users", function(req, res){
    var newUser = new User({username: req.body.username, email: req.body.email});
    User.register(newUser, req.body.password, function(err, user){
        if(err) {
            // req.flash("error", err.message);
            console.log(err);
            return res.render("users/new");
        }
        passport.authenticate("local")(req, res, function(){
            // req.flash("success", "Welcome to Yelpcamp " + user.username);
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
router.get("/users/:id/edit", middleware.checkUserOwnership, function(req, res){
    User.findById(req.params.id, function(err, foundUser){
        if(err) {
            console.log(err);
        } else {
            res.render("users/edit", {user: foundUser});
        }
    });
});

// USER UPDATE ROUTE
// router.put("/users/:id/edit", middleware.checkUserOwnership, function(req, res){

// });

// USER DELETE ROUTE

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

// SHOW FORGOT PASSWORD PAGE
router.get("/forgot", function(req, res){
    res.render("forgot");
});

// POST FORGOT PASSWORD REQUEST
router.post("/forgot", function(req, res, next){
    async.waterfall([ // AN ARRAY OF FUNCTIONS THAT GETS CALLED ONE AFTER THE OTHER
        function(done) {
            // CREATES A RANDOM UNIQUE TOKEN USED TO RESET THE PASSWORD
            crypto.randomBytes(20, function(err, buf){
                var token = buf.toString('hex');
                done(err, token);
            });
        },
        function(token, done){
            User.findOne({email: req.body.email}, function(err, user){
                if(!user){
                    // req.flash('error', "No account with that email address exists.");
                    return res.redirect('/forgot');
                }

                user.resetPasswordToken = token;
                user.resetPasswordExpires = Date.now() + 3600000; // 1 HOUR

                user.save(function(err){
                    done(err, token, user);
                });
            });
        },
        function(token, user, done){
         var smtpTransport = nodemailer.createTransport({
             service: "Gmail",
             auth: {
                 user: "grownlocalmailer@gmail.com",
                 pass: process.env.GMAILPW
             }
         });
         var mailOptions = {
             to: user.email,
             from: "info@grownlocal.dk",
             subject: "Grown Local - Nulstil kodeord",
             text: 'http://' + req.headers.host + '/reset/' + token + '\n\n'
         };
         smtpTransport.sendMail(mailOptions, function(err){
             console.log("mail sent");
             // req.flash("success", "An email has been sent to " + user.email + " with further instructions.")
             done(err, "done");
         });
        }
    ], function(err){
        if(err) return next(err);
        res.redirect("/forgot");
    });
});

// SHOW NEW PASSWORD PAGE
router.get("/reset/:token", function(req, res){
    User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now()}}, function(err, user){
        if(!user){
            // req.flash("error", "Password reset token invalid or expired.");
            return res.redirect("/forgot");
        }
        res.render("reset", {token: req.params.token});
    });
});

// POST NEW PASSWORD REQUEST
router.post("/reset/:token", function(req, res){
    async.waterfall([
        function(done){
            User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now()}}, function(err, user){
                if(!user) {
                    req.flash("error", "Password reset token invalid or has expired");
                    return res.redirect("back");
                }
                if(req.body.password === req.body.confirm){
                    user.setPassword(req.body.password, function(err){ // SALT AND HASH NEW PASSWORD
                        user.resetPasswordToken = undefined;
                        user.resetPasswordExpires = undefined;

                        user.save(function(err){ // SAVES TO MONGODB
                            req.logIn(user, function(err){
                                done(err, user);
                            });
                        });
                    });
                } else {
                    req.flash("error", "Passwords do not match.");
                    return res.redirect("back");
                }
            });
        },
        function(user, done){
            var smtpTransport = nodemailer.createTransport({
                service: "Gmail",
                auth: {
                    user: "grownlocalmailer@gmail.com",
                    pass: process.env.GMAILPW
                }
            });
            var mailOptions = {
                to: user.email,
                from: "info@grownlocal.dk",
                subject: "Dit kodeord er blevet opdateret",
                text: 'Hello, \n\n'
            };
            smtpTransport.sendMail(mailOptions, function(err) {
                req.flash("success", "Success! Din kodeord er blevet opdateret.");
                done(err);
            });
        }
    ], function(err){
        if(err){
            console.log(err);
        } else {
            res.redirect("/places");
        }
    });
});

module.exports = router;