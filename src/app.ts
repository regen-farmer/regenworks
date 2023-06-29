/* eslint-disable import/first */
import dotenv from "dotenv";

dotenv.config();

import { Hono } from "hono";
import { cors } from 'hono/cors'

import { connect } from "mongoose";
import User, { IUserSchema, UserDocument } from "./models/user.js";
import { serve } from '@hono/node-server'
import { logger } from 'hono/logger'

// REQUIRE ROUTES
import indexRoutes from "./routes/index.js";
import tilesRoutes from "./routes/tiles.js";
import parcelRoutes from "./routes/parcels.js";
import activityRoutes from "./routes/activities.js";
import projectRoutes from "./routes/projects.js";
import layerRoutes from "./routes/layers.js";
import practiceRoutes from "./routes/practices.js";
import assetRoutes from "./routes/assets.js";
import systemRoutes from "./routes/systems.js";
import systemdesignRoutes from "./routes/systemdesigns.js";
import speciesRoutes from "./routes/species.js";
import flowRoutes from "./routes/flows.js";
import systemflowRoutes from "./routes/systemflows.js";
import animalRoutes from "./routes/animals.js";
import budgetRoutes from "./routes/budgets.js";
import postingRoutes from "./routes/postings.js";
import nurseryRoutes from "./routes/nurseries.js";
import nurseryproductRoutes from "./routes/nurseryproducts.js";
import sequenceRoutes from "./routes/sequences.js";
import areaRoutes from "./routes/areas.js";
import noteRoutes from "./routes/notes.js";
import soiltestRoutes from "./routes/soiltests.js";
import saptestRoutes from "./routes/saptests.js";
import farmflowRoutes from "./routes/farmflows.js";
import rotationRoutes from "./routes/rotations.js";
import varietyRoutes from "./routes/varieties.js";
import stripeRoutes from "./routes/stripe.js";

export type Auth0IDToken = {
  nickname: string;
  name: string;
  picture: string;
  updated_at: string;
  email: string;
  email_verified: boolean;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  sub: string;
  sid: string;
};

export type Variables = {
  currentUser: any;
  user?: UserDocument;
  idToken?: Auth0IDToken;
};

const app = new Hono<{ Variables: Variables }>();
app.use('*', logger())
app.use('*', cors())

// APP SETUP
connect(process.env.DATABASEURL as string); // CONNECTS TO MLAB MONGODB

// // Use a function that sends the "currentUser" AND flash "success" and "error" messages through to all routes, so that login/register/logout is shown correctly on all routes
app.use(
  "*",
  async (
    // req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    // res: express.Response,
    c,
    next
  ) => {
    c.set("currentUser", undefined);

    const jwt = c.req.headers.get("authorization");

    // console.log('body:', payload)

    async function parseJwt(token) {
      // eslint-disable-next-line no-unneeded-ternary
      // console.log("token in place", token === "undefined" ? false : true);

      if (token === "undefined") {
        await next();
      }

      return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    }

    let idToken: Auth0IDToken | undefined;

    // console.log('jwt in place', jwt);

    if (jwt && typeof jwt === "string") {
      idToken = await parseJwt(jwt);
      if (!idToken) {
        console.log("no id token");
        c.status(404);
        return c.text("invalid token");
      }
    } else {
      console.log("no jwt");
    }

    if (idToken?.email) {
      // Find any existing user
      const user = await User.findOne({ email: idToken.email }).exec();

      if (user) {
        c.set("user", user);
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

        c.set("user", savedUser);
      }
    } else {
      console.log("No oidc user");
    }

    c.set("idToken", idToken);

    c.set("currentUser", c.get("user"));

    await next();
  }
);

// MAKES THE APP ACTUALLY USE THE ROUTES
indexRoutes(app);
tilesRoutes(app);
parcelRoutes(app); // THE "" CAN BE CHANGED TO "/parcels FOR SHORTER FILES
activityRoutes(app);
projectRoutes(app);
layerRoutes(app);
practiceRoutes(app);
assetRoutes(app);
systemRoutes(app);
systemdesignRoutes(app);
speciesRoutes(app);
flowRoutes(app);
systemflowRoutes(app);
animalRoutes(app);
budgetRoutes(app);
postingRoutes(app);
nurseryRoutes(app);
nurseryproductRoutes(app);
sequenceRoutes(app);
areaRoutes(app);
noteRoutes(app);
soiltestRoutes(app);
saptestRoutes(app);
farmflowRoutes(app);
rotationRoutes(app);
varietyRoutes(app);
stripeRoutes(app);

// 404 ROUTE
app.get(
  "*",
  async (
    c
  ) => {
    c.status(404)
    return c.text("404");
  }
);

console.log('serve!')
serve({
  fetch: app.fetch,
  port: 3001, // Port number, default is 3000
}, (info) => {
  console.log(`Listening on http://localhost:${info.port}`) // Listening on http://localhost:3000
})
