require('dotenv').config();
const express = require('express');

const app = express();
const bodyParser = require('body-parser'); // USED TO PARSE DATA FROM POST ROUTE
const mongoose = require('mongoose'); // REQUIRE MONGOOSE PACKAGE
const flash = require('connect-flash'); // ENABLES FLASH MESSAGES
const passport = require('passport'); // REQUIRE PASSPORT PACKAGE
const LocalStrategy = require('passport-local'); // REQUIRE LOCAL LOGIN PASSPORT PACKAGE
const methodOverride = require('method-override'); // USED FOR PUT AND DELETE REQUESTS

// REQUIRE MODELS
const Parcel = require('./models/parcel');
// var seedDB = require("./seeds");
const User = require('./models/user');

// REQUIRE ROUTE FILES
const parcelRoutes = require('./routes/parcels');
const indexRoutes = require('./routes/index');
const activityRoutes = require('./routes/activities');
const projectRoutes = require('./routes/projects');
const layerRoutes = require('./routes/layers');
const practiceRoutes = require('./routes/practices');
const assetRoutes = require('./routes/assets');
const systemRoutes = require('./routes/systems');
const speciesRoutes = require('./routes/species');
const flowRoutes = require('./routes/flows');
const systemflowRoutes = require('./routes/systemflows');
const animalRoutes = require('./routes/animals');
const budgetRoutes = require('./routes/budgets');
const postingRoutes = require('./routes/postings');
const nurseryRoutes = require('./routes/nurseries');
const nurseryproductRoutes = require('./routes/nurseryproducts');
const sequenceRoutes = require('./routes/sequences');
const areaRoutes = require('./routes/areas');
const noteRoutes = require('./routes/notes');
const soiltestRoutes = require('./routes/soiltests');
const saptestRoutes = require('./routes/saptests');
const farmflowRoutes = require('./routes/farmflows');
const rotationRoutes = require('./routes/rotations');
const varietyRoutes = require('./routes/varieties');

// APP SETUP
mongoose.connect(process.env.DATABASEURL); // CONNECTS TO MLAB MONGODB
app.use(bodyParser.urlencoded({ extended: true })); // ENABLES BODY PARSER
app.set('view engine', 'ejs'); // SET VIEW (RENDER) ENGINE TO EJS FILE
app.use(express.static(`${__dirname}/public`)); // SETS PUBLIC ASSETS REPOSITORY
app.use(methodOverride('_method')); // USE "_method" TO PASS PUT AND DELETE REQUESTS
app.use(flash());
// seedDB(); // USE ONLY FOR SEEDING DATABAS

// PASSPORT CONFIGURATION
app.use(require('express-session')({
  secret: 'If found non we go down!',
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Use a function that sends the "currentUser" AND flash "success" and "error" messages through to all routes, so that login/register/logout is shown correctly on all routes
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.error = req.flash('error');
  res.locals.success = req.flash('success');
  next();
});

// MAKES THE APP ACTUALLY USE THE ROUTES
app.use(indexRoutes);
app.use('', parcelRoutes); // THE "" CAN BE CHANGED TO "/parcels FOR SHORTER FILES
app.use('', activityRoutes);
app.use('', projectRoutes);
app.use('', layerRoutes);
app.use('', practiceRoutes);
app.use('', assetRoutes);
app.use('', systemRoutes);
app.use('', speciesRoutes);
app.use('', flowRoutes);
app.use('', systemflowRoutes);
app.use('', animalRoutes);
app.use('', budgetRoutes);
app.use('', postingRoutes);
app.use('', nurseryRoutes);
app.use('', nurseryproductRoutes);
app.use('', sequenceRoutes);
app.use('', areaRoutes);
app.use('', noteRoutes);
app.use('', soiltestRoutes);
app.use('', saptestRoutes);
app.use('', farmflowRoutes);
app.use('', rotationRoutes);
app.use('', varietyRoutes);

// 404 ROUTE
app.get('*', (req, res) => {
  res.status(404).render('404');
});

// SETUP THE EXPRESS LISTENER ON LOCAL HOST
app.listen(process.env.PORT, process.env.IP, () => {
  console.log('The grown local Server Has Started!');
});
