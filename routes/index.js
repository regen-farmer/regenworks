var express = require("express");
var router = express.Router();
var passport = require("passport");
var User = require("../models/user");
var Parcel = require("../models/parcel");
var Activity = require("../models/activity");
var middleware = require("../middleware"); // Will automatically require the middleware "index" file as the standard
var async = require("async"); // “waterfall” - makes sure the function are called in sequence without using any callbacks.
var nodemailer = require("nodemailer"); // used to send emails from node.js - for example via gmail.
var crypto = require("crypto");
var logger = require("../middleware/logger");

// ROOT ROUTE
router.get("/", function(req, res){
    res.redirect("/login");
});

// ABOUT ROUTE
router.get("/about", function(req, res){
    res.render("about");
});

// TERMS ROUTE
router.get("/terms", function(req, res){
    res.render("terms");
});

// PRIVACY ROUTE
router.get("/privacy", function(req, res){
    res.render("privacy");
});

// FEEDBACK ROUTE
router.get("/feedback", middleware.isLoggedIn, function(req, res){
    res.render("feedback");
});

// COMPOSITION ROUTE
router.get("/composition", middleware.isLoggedIn, function(req, res){
    res.render("composition");
});

// SUCCESSION ROUTE
router.get("/succession", middleware.isLoggedIn, function(req, res){
    res.render("succession");
});

// PLANNING ROUTE
router.get("/planning", middleware.isLoggedIn, function(req, res){
    res.render("planning");
});

// QUESTIONNAIRE ROUTE
router.get("/questionnaire", function(req, res){
    res.render("questionnaire");
});

// SUPPORT ROUTE
router.get("/support", function(req, res){
    res.render("support");
});

// PLANNING ROUTE
router.get("/planning", function(req, res){
    res.render("planning");
});

// DASHBOARD ROUTE
router.get("/dashboard", middleware.isLoggedIn, function(req, res){
    Parcel.find({'owner.id': req.user._id}, function(err, allParcels){
        if(err) {
            console.log(err);
        } else {
            Activity.find({'owner.id': req.user._id}, function(err, allActivities){
                if(err) {
                    console.log(err);
                } else {
                    allActivities.sort(function(a, b){
                        return Date.parse(a.start.date) - Date.parse(b.start.date);
                    });
                    allActivities.slice(0,4);
                    res.render("dashboard", {activities: allActivities, parcels: allParcels});
                }
            });
        }
    });
});

// NEW USER ROUTE
router.get("/users/new", function(req, res){
    logger.info('Sign up page requested', {timestamp: Date.now()});
    res.render("users/new");
});

// robots.txt
router.get('/robots.txt', function (req, res) {
    res.type('text/plain');
    res.send("User-agent: *\nDisallow: /admin/");
});

// CREATE USER ROUTE
router.post("/users", function(req, res){
    if (req.body.secret === "899af01m4maiq5k3"){
        logger.info("Secret correct", {timestamp: Date.now()});
        var newUser = new User({username: req.body.username, email: req.body.email});
        User.register(newUser, req.body.password, function(err, user){
            if(err) {
                // req.flash("error", err.message);
                logger.error(err.message);
                return res.render("users/new");
            }
            logger.info('New user "' + user.username + '" was created', {timestamp: Date.now()});
            passport.authenticate("local")(req, res, function(){
                // req.flash("success", "Welcome to Regen Farmer " + user.username + ". Please start out by creating your first parcel of land below.");
                res.redirect("/users/" + req.user.id); // Redirect to user account page
            });
        });
    } else {
        logger.error("Secret is wrong", {timestamp: Date.now()});
        req.flash("error", "Secret not correct");
        res.redirect("/users/new");
    }
});

// SHOW USER ROUTE
router.get("/users/:id", middleware.checkUserOwnership, function(req, res){
    User.findById(req.params.id).populate("favorites").populate("parcels").exec(function(err, foundUser){
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
router.put("/users/:id", middleware.checkUserOwnership, function(req, res){
    User.findByIdAndUpdate(req.params.id, req.body.user, function(err, updatedUser){
        if (err) {
            // flash with updatedUser
            console.log(err);
        } else {
            // flash with updatedUser
            res.redirect("/users/" + req.params.id);
        }
    });
});

// USER DELETE ROUTE
router.delete("/users/:id", middleware.checkUserOwnership, function(req, res){
    User.findByIdAndRemove(req.params.id, function(err, user){
        if(err){
            console.log(err);
            // Flash message
            res.redirect("/parcels");
        } else {
            // Flash message
            logger.info('User "' + user.username + '" was deleted', {timestamp: Date.now()});
            res.redirect("/parcels");
        }
    });
});

// SHOW LOGIN FORM
router.get("/login", function(req, res) {
    logger.info('Login page requested', {timestamp: Date.now()});
    res.render("login");
});

// HANDLE LOGIN LOGIC
router.post("/login", passport.authenticate("local", {failureRedirect: '/login'}), function (req, res) {
    logger.info(req.user.username + " has logged in", {timestamp: Date.now()});
    res.redirect('/users/' + req.user.id);
});

// LOGOUT ROUTE
router.get("/logout", function(req, res) {
    logger.info("User requested to log out", {timestamp: Date.now()});
    req.logout();
    logger.info("User was logged out", {timestamp: Date.now()});
    // req.flash("success", "Logged you out!");
    res.redirect("/login");
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
             from: "hello@regenfarmer.com",
             subject: "Regen Farmer - Reset Password",
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
                from: "hello@regenfarmer.com",
                subject: "Your password has been changed",
                text: 'Hello, \n\n'
            };
            smtpTransport.sendMail(mailOptions, function(err) {
                req.flash("success", "Success! Your password has been changed.");
                done(err);
            });
        }
    ], function(err){
        if(err){
            console.log(err);
        } else {
            res.redirect("/parcels");
        }
    });
});

// SET CURRENTPROJECT //
router.post("/users/:id/currentproject/", middleware.checkUserOwnership, function(req, res){
    User.findById(req.user._id, function(err, foundUser){
        if(err) {
            console.log(err);
        } else {
            Parcel.findById(req.body.parcelid, function(err, foundParcel) {
                if (err) {
                    console.log(err);
                } else {
                    foundUser.currentProject = foundParcel;
                    foundUser.save();
                    console.log(foundParcel.name + " has been set to active project");
                    res.redirect("/parcels/" + foundParcel._id);
                }
            });
        }
    });
});

module.exports = router;