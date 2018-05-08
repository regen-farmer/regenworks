require("dotenv").config();
var express = require("express");
var app = express();
var bodyParser = require("body-parser"); // USED TO PARSE DATA FROM POST ROUTE
var mongoose = require("mongoose"); // REQUIRE MONGOOSE PACKAGE
var passport = require("passport"); // REQUIRE PASSPORT PACKAGE
var LocalStrategy = require("passport-local"); // REQUIRE LOCAL LOGIN PASSPORT PACKAGE
var methodOverride = require("method-override"); // USED FOR PUT AND DELETE REQUESTS

// REQUIRE MODELS
var Place = require("./models/place");
// var seedDB = require("./seeds");
var User = require("./models/user");

// REQUIRE ROUTE FILES
var placeRoutes = require("./routes/places");
var indexRoutes = require("./routes/index");

// APP SETUP
mongoose.connect(process.env.DATABASEURL); // CONNECTS TO MLAB MONGODB
app.use(bodyParser.urlencoded({extended: true})); // ENABLES BODY PARSER
app.set("view engine", "ejs"); // SET VIEW (RENDER) ENGINE TO EJS FILE
app.use(express.static(__dirname + "/public")); // SETS PUBLIC ASSETS REPOSITORY
app.use(methodOverride("_method")); // USE "_method" TO PASS PUT AND DELETE REQUESTS
// seedDB(); // USE ONLY FOR SEEDING DATABASE

// PASSPORT CONFIGURATION
app.use(require("express-session")({
    secret: "If found non we go down!",
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Use a function that sends the "currentUser" AND flash "success" and "error" messages through to all routes, so that login/register/logout is shown correctly on all routes
app.use(function(req, res, next){
    res.locals.currentUser = req.user;
    //res.locals.error = req.flash("error");
    //res.locals.success = req.flash("success");
    next();
});

// MAKES THE APP ACTUALLY USE THE ROUTES
app.use(indexRoutes);
app.use("", placeRoutes); // THE "" CAN BE CHANGED TO "/places FOR SHORTER FILES

// SETUP THE EXPRESS LISTENER ON LOCAL HOST
app.listen(process.env.PORT, process.env.IP, function(){
    console.log("The grown local Server Has Started!");
});