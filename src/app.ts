require("dotenv").config();
var express = require("express");
var app = express();
var bodyParser = require("body-parser"); // USED TO PARSE DATA FROM POST ROUTE
import {connect} from "mongoose"; // REQUIRE MONGOOSE PACKAGE
var flash = require("connect-flash"); // ENABLES FLASH MESSAGES
var passport = require("passport"); // REQUIRE PASSPORT PACKAGE
var LocalStrategy = require("passport-local"); // REQUIRE LOCAL LOGIN PASSPORT PACKAGE
var methodOverride = require("method-override"); // USED FOR PUT AND DELETE REQUESTS

// REQUIRE MODELS
import Parcel from "./models/parcel";
//var seedDB = require("./seeds");
import User from "./models/user";

// REQUIRE ROUTE FILES
var parcelRoutes = require("./routes/parcels");
var indexRoutes = require("./routes/index");
var activityRoutes = require("./routes/activities");
var projectRoutes = require("./routes/projects");
var layerRoutes = require("./routes/layers");
var practiceRoutes = require("./routes/practices");
var assetRoutes = require("./routes/assets");
var systemRoutes = require("./routes/systems");
var speciesRoutes = require("./routes/species");
var flowRoutes = require("./routes/flows");
var systemflowRoutes = require("./routes/systemflows");
var animalRoutes = require("./routes/animals");
var budgetRoutes = require("./routes/budgets");
var postingRoutes = require("./routes/postings");
var nurseryRoutes = require("./routes/nurseries");
var nurseryproductRoutes = require("./routes/nurseryproducts");
var sequenceRoutes = require("./routes/sequences");
var areaRoutes = require("./routes/areas");
var noteRoutes = require("./routes/notes");
var soiltestRoutes = require("./routes/soiltests");
var saptestRoutes = require("./routes/saptests");
var farmflowRoutes = require("./routes/farmflows");
var rotationRoutes = require("./routes/rotations");
var varietyRoutes = require("./routes/varieties");
var path = require('path');

// APP SETUP
connect(process.env.DATABASEURL as string, {useNewUrlParser: true, useUnifiedTopology: true}); // CONNECTS TO MLAB MONGODB
app.use(bodyParser.urlencoded({extended: true})); // ENABLES BODY PARSER
app.set("view engine", "ejs"); // SET VIEW (RENDER) ENGINE TO EJS FILE
app.set('views', path.join(__dirname, '/views'));
app.use(express.static(__dirname + "/public")); // SETS PUBLIC ASSETS REPOSITORY
app.use(methodOverride("_method")); // USE "_method" TO PASS PUT AND DELETE REQUESTS
app.use(flash());
//seedDB(); // USE ONLY FOR SEEDING DATABAS

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
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
});

// MAKES THE APP ACTUALLY USE THE ROUTES
app.use(indexRoutes);
app.use("", parcelRoutes); // THE "" CAN BE CHANGED TO "/parcels FOR SHORTER FILES
app.use("", activityRoutes);
app.use("", projectRoutes);
app.use("", layerRoutes);
app.use("", practiceRoutes);
app.use("", assetRoutes);
app.use("", systemRoutes);
app.use("", speciesRoutes);
app.use("", flowRoutes);
app.use("", systemflowRoutes);
app.use("", animalRoutes);
app.use("", budgetRoutes);
app.use("", postingRoutes);
app.use("", nurseryRoutes);
app.use("", nurseryproductRoutes);
app.use("", sequenceRoutes);
app.use("", areaRoutes);
app.use("", noteRoutes);
app.use("", soiltestRoutes);
app.use("", saptestRoutes);
app.use("", farmflowRoutes);
app.use("", rotationRoutes);
app.use("", varietyRoutes);

// 404 ROUTE
app.get('*', function(req, res){
    res.status(404).render('404');
});

// SETUP THE EXPRESS LISTENER ON LOCAL HOST
app.listen(process.env.PORT, process.env.IP, function(){
    console.log("The grown local Server Has Started!");
});