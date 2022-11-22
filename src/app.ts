import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser'; // USED TO PARSE DATA FROM POST ROUTE
import { connect } from 'mongoose'; // REQUIRE MONGOOSE PACKAGE
import methodOverride from 'method-override'; // USED FOR PUT AND DELETE REQUESTS

// REQUIRE MODELS
import path from 'path';
import { auth } from 'express-openid-connect';
// import Parcel from './models/parcel';
// import seedDB from "./seeds";
import User, { IUserSchema } from './models/user';
// REQUIRE ROUTE FILES
import parcelRoutes from './routes/parcels';
import indexRoutes from './routes/index';
import activityRoutes from './routes/activities';
import projectRoutes from './routes/projects';
import layerRoutes from './routes/layers';
import practiceRoutes from './routes/practices';
import assetRoutes from './routes/assets';
import systemRoutes from './routes/systems';
import speciesRoutes from './routes/species';
import flowRoutes from './routes/flows';
import systemflowRoutes from './routes/systemflows';
import animalRoutes from './routes/animals';
import budgetRoutes from './routes/budgets';
import postingRoutes from './routes/postings';
import nurseryRoutes from './routes/nurseries';
import nurseryproductRoutes from './routes/nurseryproducts';
import sequenceRoutes from './routes/sequences';
import areaRoutes from './routes/areas';
import noteRoutes from './routes/notes';
import soiltestRoutes from './routes/soiltests';
import saptestRoutes from './routes/saptests';
import farmflowRoutes from './routes/farmflows';
import rotationRoutes from './routes/rotations';
import varietyRoutes from './routes/varieties';

dotenv.config();
const app = express();

// APP SETUP
connect(process.env.DATABASEURL as string); // CONNECTS TO MLAB MONGODB
app.use(bodyParser.urlencoded({ extended: true })); // ENABLES BODY PARSER
app.set('view engine', 'ejs'); // SET VIEW (RENDER) ENGINE TO EJS FILE
app.set('views', path.join(__dirname, '/views'));
app.use(express.static(`${__dirname}/public`)); // SETS PUBLIC ASSETS REPOSITORY
app.use(methodOverride('_method')); // USE "_method" TO PASS PUT AND DELETE REQUESTS
// seedDB(); // USE ONLY FOR SEEDING DATABAS

const config = {
  authRequired: false,
  auth0Logout: true,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  secret: process.env.AUTH0_SECRET,
};

app.use(auth(config));

// // Use a function that sends the "currentUser" AND flash "success" and "error" messages through to all routes, so that login/register/logout is shown correctly on all routes
app.use(async (req: express.Request & { user?: IUserSchema}, res: express.Response, next: express.NextFunction) => {
  res.locals.currentUser = undefined;

  if (req.oidc.user && req.oidc.user.email) {
    // Find any existing user
    const user = await User.findOne({ email: req.oidc.user.email }).exec();

    if (user) {
      // @ts-ignore
      req.user = user;
    } else {
      // Create a new user if none exist
      const newUser = await User.create({
        externalId: req.oidc.user.sub,
        email: req.oidc.user.email,
        registrationDate: Date.now(),
        membership: 1209600000,
        farmLimit: 1,
        isProject: true,
      });

      const savedUser = await newUser.save();

      // @ts-ignore
      req.user = savedUser;
    }
  } else {
    console.log('No oidc user');
  }

  // @ts-ignore
  res.locals.currentUser = req.user;

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
app.get('*', (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  res.status(404).render('404');
});
app.set('trust proxy', true);

// @ts-ignore
app.listen(process.env.PORT, process.env.IP, () => {
  console.log('The grown local Server Has Started!');
});
