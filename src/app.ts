/* eslint-disable import/first */
import dotenv from 'dotenv';

dotenv.config();

import express from 'express';
import { connect } from 'mongoose'; // REQUIRE MONGOOSE PACKAGE
import methodOverride from 'method-override'; // USED FOR PUT AND DELETE REQUESTS
import fs from 'fs';
import https from 'https';
// REQUIRE MODELS
// import path from 'path';
// import { auth } from 'express-openid-connect';
// import Parcel from './models/parcel';
// import seedDB from "./seeds";
import cors from 'cors';
import User, { IUserSchema, UserDocument } from './models/user';
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
import systemdesignRoutes from './routes/systemdesigns';
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
import stripeRoutes from './routes/stripe';

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
let num = 0;
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const method = req.method;
  const url = req.url;

  console.log(`${++num}. IP ${ip} ${method} ${url}`);
  next();
});

// // Use a function that sends the "currentUser" AND flash "success" and "error" messages through to all routes, so that login/register/logout is shown correctly on all routes
app.use(async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response, next: express.NextFunction) => {
  res.locals.currentUser = undefined;

  const jwt = req.headers.authorization;

  // console.log('body:', req.body)

  function parseJwt(token) {
    // eslint-disable-next-line no-unneeded-ternary
    console.log('token in place', token === 'undefined' ? false : true);

    if (token === 'undefined') {
      return;
    }

    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  }

  let idToken: Auth0IDToken | undefined;

  // console.log('jwt in place', jwt);

  if (jwt && typeof (jwt) === 'string') {
    idToken = parseJwt(jwt);
    if (!idToken) {
      console.log('no id token');
      res.status(404).send('Invalid token');
      return;
    }
  } else {
    console.log('no jwt');
  }

  if (idToken?.email) {
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
app.use('', systemdesignRoutes);
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
app.use('', stripeRoutes);

// 404 ROUTE
app.get('*', async (req: express.Request & { user?: IUserSchema }, res: express.Response) => {
  res.status(404).send('404');
});
app.set('trust proxy', true);

if (process.env.HTTPS === 'TRUE') {
  const key = fs.readFileSync('0.0.0.0-key.pem', 'utf-8');
  const cert = fs.readFileSync('0.0.0.0.pem', 'utf-8');

  // @ts-ignore
  https.createServer({ key, cert }, app).listen(process.env.PORT, process.env.IP, () => {
    console.log('RegenWorks backend server has started!');
  });
} else {
  // @ts-ignore
  app.listen(process.env.PORT, process.env.IP, () => {
    console.log('RegenWorks backend server has started!');
  });
}
