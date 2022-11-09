import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser"; // USED TO PARSE DATA FROM POST ROUTE
import {connect} from "mongoose"; // REQUIRE MONGOOSE PACKAGE
import flash from "connect-flash"; // ENABLES FLASH MESSAGES
import passport from "passport"; // REQUIRE PASSPORT PACKAGE
import LocalStrategy from "passport-local"; // REQUIRE LOCAL LOGIN PASSPORT PACKAGE
import methodOverride from "method-override"; // USED FOR PUT AND DELETE REQUESTS

// REQUIRE MODELS
import Parcel from "./models/parcel";
//import seedDB from "./seeds";
import User from "./models/user";
import expressSession from "express-session";

dotenv.config();
var app = express();
// REQUIRE ROUTE FILES
import parcelRoutes from "./routes/parcels";
import indexRoutes from "./routes/index";
import activityRoutes from "./routes/activities";
import projectRoutes from "./routes/projects";
import layerRoutes from "./routes/layers";
import practiceRoutes from "./routes/practices";
import assetRoutes from "./routes/assets";
import systemRoutes from "./routes/systems";
import speciesRoutes from "./routes/species";
import flowRoutes from "./routes/flows";
import systemflowRoutes from "./routes/systemflows";
import animalRoutes from "./routes/animals";
import budgetRoutes from "./routes/budgets";
import postingRoutes from "./routes/postings";
import nurseryRoutes from "./routes/nurseries";
import nurseryproductRoutes from "./routes/nurseryproducts";
import sequenceRoutes from "./routes/sequences";
import areaRoutes from "./routes/areas";
import noteRoutes from "./routes/notes";
import soiltestRoutes from "./routes/soiltests";
import saptestRoutes from "./routes/saptests";
import farmflowRoutes from "./routes/farmflows";
import rotationRoutes from "./routes/rotations";
import varietyRoutes from "./routes/varieties";
import path from 'path';

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
app.use(expressSession({
    secret: "If found non we go down!",
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
// @ts-ignore
passport.use(new LocalStrategy(User.authenticate()));
// @ts-ignore
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

// @ts-ignore
app.listen(process.env.PORT, process.env.IP, function(){
    console.log("The grown local Server Has Started!");
});