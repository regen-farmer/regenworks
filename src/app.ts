import dotenv from 'dotenv';
dotenv.config();


import express from 'express';
import { connect } from 'mongoose'; // REQUIRE MONGOOSE PACKAGE
import methodOverride from 'method-override'; // USED FOR PUT AND DELETE REQUESTS

// REQUIRE MODELS
import path from 'path';
// import { auth } from 'express-openid-connect';
// import Parcel from './models/parcel';
// import seedDB from "./seeds";
import User, { IUserSchema } from './models/user';
// REQUIRE ROUTE FILES
import tilesRoutes from './routes/tiles';
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
import cors from 'cors';


export type Auth0IDToken = {
  nickname: string,
  name: string,
  picture: string,
  updated_at: string,
  email: string,
  email_verified: boolean,
  iss: string,
  aud: string,
  iat: number,
  exp: number,
  sub: string,
  sid: string
}
const app = express();

app.use(cors());


// APP SETUP
connect(process.env.DATABASEURL as string); // CONNECTS TO MLAB MONGODB

app.use(express.json());

app.use(express.static(`${__dirname}/public`)); // SETS PUBLIC ASSETS REPOSITORY
app.use(methodOverride('_method')); // USE "_method" TO PASS PUT AND DELETE REQUESTS
// seedDB(); // USE ONLY FOR SEEDING DATABAS

// const config = {
//   authRequired: false,
//   auth0Logout: true,
//   baseURL: process.env.AUTH0_BASE_URL,
//   clientID: process.env.AUTH0_CLIENT_ID,
//   issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
//   secret: process.env.AUTH0_SECRET,
// };

// app.use(auth(config));
var num = 0;
app.use(function (req, res, next) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var method = req.method;
    var url = req.url;

    console.log((++num) + ". IP " + ip + " " + method + " " + url);
    next();
});

// // Use a function that sends the "currentUser" AND flash "success" and "error" messages through to all routes, so that login/register/logout is shown correctly on all routes
app.use(async (req: express.Request & { user?: IUserSchema, idToken?: Auth0IDToken }, res: express.Response, next: express.NextFunction) => {
  res.locals.currentUser = undefined;

  const jwt = req.headers.authorization;

  // console.log('body:', req.body)

  function parseJwt(token) {

    console.log('token in place')
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

  }

  let idToken: Auth0IDToken | undefined;
  if (jwt && typeof(jwt) == 'string') {
    idToken = parseJwt('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImpJT0o5UEVDSkxfbzZQbVBkdnVTcyJ9.eyJuaWNrbmFtZSI6ImJpcmsiLCJuYW1lIjoiYmlya0ByZWdlbmZhcm1lci5jb20iLCJwaWN0dXJlIjoiaHR0cHM6Ly9zLmdyYXZhdGFyLmNvbS9hdmF0YXIvMjJjMGE4OTRkM2E3ZjFmZjY3YzUzNTkzZmE2NDAxYWI_cz00ODAmcj1wZyZkPWh0dHBzJTNBJTJGJTJGY2RuLmF1dGgwLmNvbSUyRmF2YXRhcnMlMkZiaS5wbmciLCJ1cGRhdGVkX2F0IjoiMjAyMy0wMS0yNFQxMTowMTo1OC4wNjlaIiwiZW1haWwiOiJiaXJrQHJlZ2VuZmFybWVyLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJpc3MiOiJodHRwczovL2Rldi0zejYycmFxY3A0d2N4bWtiLmV1LmF1dGgwLmNvbS8iLCJhdWQiOiJTYXFlYzhKamFxcXRhOWMyZjBpM2wyNG5WQjh6c0toUCIsImlhdCI6MTY3NDU1ODExOCwiZXhwIjoxNjc0NTk0MTE4LCJzdWIiOiJhdXRoMHw2Mzg2NzA3MDNhZjE2OWRjMGYxM2MwOTAiLCJzaWQiOiJIclZWX3cyUHQwVkF6WHNLVWhOM2Z4bENpanRpTFh5SCJ9.oCGHWR9_JakiLgLWgT_QjEoD4Gpcmu-Q75XHQTrjU3_pFwRDlMtniJiwZyvsao2ctu-HaK7FHsrDekECOgN4JDqWIEflrBe6tK14xtcOS1zfifC2K4b-maOPqPnMchk9hWyiG_UofdVT7-_OAf8QnhS1a07QarqdENADgY_RbhxUEqk-DRhTPuoqF7YnPkqFT2tkk-0TpRbm7ojb-Y_rTzbWNYlM2NX4253UeJeqioplesWDusOFfHYYLDjO03Ny2sHX9StS9f8mXAY2VIGA-v4S4lC08Ux1ARy8us6PByy4pwO40gcmytI__6FBz4VS8afnrVVSs7TDSkUlV4_tOg')
  } else {
    console.log('no jwt')
  }


  if (idToken && idToken.email) {
    // Find any existing user
    const user = await User.findOne({ email: idToken.email }).exec();

    if (user) {
      req.user = user;
    } else {
      // Create a new user if none exist
      const newUser = await User.create({
        externalId: idToken.sub,
        email: idToken.email,
        registrationDate: Date.now(),
        membership: 1209600000,
        farmLimit: 1,
        isProject: true,
      });

      const savedUser = await newUser.save();

      req.user = savedUser;
    }
  } else {
    console.log('No oidc user');
  }

  req.idToken = idToken;

  res.locals.currentUser = req.user;

  next();
});

// MAKES THE APP ACTUALLY USE THE ROUTES
app.use(indexRoutes);
app.use('', tilesRoutes);
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
app.get('*', async (req: express.Request & { user?: IUserSchema }, res: express.Response) => {
  res.status(404).send('404');
});
app.set('trust proxy', true);

// @ts-ignore
app.listen(process.env.PORT, process.env.IP, () => {
  console.log('The grown local Server Has Started!');
});
