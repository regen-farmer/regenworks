/* eslint-disable import/first */
import dotenv from "dotenv";

dotenv.config();

import User, { type IUserSchema, type UserDocument } from "@rw/db/schemas/user.ts";
import bodyParser from "body-parser";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import methodOverride from "method-override"; // USED FOR PUT AND DELETE REQUESTS
import mongoose from "mongoose";
import activityRoutes from "./routes/activities.ts";
import advisorRequets from "./routes/advisorrequests.ts";
import animalRoutes from "./routes/animals.ts";
import areaRoutes from "./routes/areas.ts";
import assetRoutes from "./routes/assets.ts";
import budgetRoutes from "./routes/budgets.ts";
import catalogueRoutes from "./routes/catalogue.ts";
import farmerAdvisorRoutes from "./routes/farmer-advisor-survey.ts";
import farmflowRoutes from "./routes/farmflows.ts";
import farmScenarioConfigRoutes from "./routes/farmscenarioconfigs.ts";
import internalRoutes from "./routes/internal.ts";
import financialModelsRoutes from "./routes/financialModels.ts";
import flowRoutes from "./routes/flows.ts";
import indexRoutes from "./routes/index.ts";
import layerRoutes from "./routes/layers.ts";
import noteRoutes from "./routes/notes.ts";
import nurseryRoutes from "./routes/nurseries.ts";
import nurseryproductRoutes from "./routes/nurseryproducts.ts";
import parcelRoutes from "./routes/parcels.ts";
import plantOfferRequestRoutes from "./routes/plant-offer-requests.ts";
import postingRoutes from "./routes/postings.ts";
import practiceRoutes from "./routes/practices.ts";
import projectRoutes from "./routes/projects.ts";
import rotationRoutes from "./routes/rotations.ts";
import saptestRoutes from "./routes/saptests.ts";
import sequenceRoutes from "./routes/sequences.ts";
import soiltestRoutes from "./routes/soiltests.ts";
import speciesRoutes from "./routes/species.ts";
import stripeRoutes from "./routes/stripe.ts";
import systemdesignRoutes from "./routes/systemdesigns.ts";
import systemflowRoutes from "./routes/systemflows.ts";
import systemRoutes from "./routes/systems.ts";
import { checkAuthConfig, identify, IdentityUnavailableError } from "./auth/identify.ts";
import { resolveUser } from "./auth/resolveUser.ts";
// REQUIRE ROUTES
import tilesRoutes from "./routes/tiles.ts";
import userPresetsRoutes from "./routes/userpresets.ts";
import varietyRoutes from "./routes/varieties.ts";

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
const app = express();

app.set("trust proxy", 1);
app.use(cors());

const rateLimitWindowMs = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "900000", 10);
const rateLimitMax = Number.parseInt(process.env.RATE_LIMIT_MAX ?? "1000", 10);

app.use(
  rateLimit({
    windowMs: Number.isFinite(rateLimitWindowMs) ? rateLimitWindowMs : 15 * 60 * 1000,
    limit: Number.isFinite(rateLimitMax) ? rateLimitMax : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
  }),
);

// APP SETUP
mongoose.set("sanitizeFilter", true);
checkAuthConfig(); // fail fast on bad Auth0 settings, before serving anything
await mongoose.connect(process.env.DATABASEURL as string); // CONNECTS TO MLAB MONGODB

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// app.use(express.static(`${__dirname}/public`)); // SETS PUBLIC ASSETS REPOSITORY
app.use(methodOverride("_method")); // USE "_method" TO PASS PUT AND DELETE REQUESTS
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

const getDurationInMilliseconds = (start) => {
  return performance.now() - start;
};

app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl} [STARTED]`);
  const start = performance.now();

  res.on("finish", () => {
    const durationInMilliseconds = getDurationInMilliseconds(start);
    console.log(
      `${req.method} ${req.originalUrl} [FINISHED] ${durationInMilliseconds.toLocaleString()} ms`,
    );
  });

  res.on("close", () => {
    const durationInMilliseconds = getDurationInMilliseconds(start);
    console.log(
      `${req.method} ${req.originalUrl} [CLOSED] ${durationInMilliseconds.toLocaleString()} ms`,
    );
  });

  next();
});

// // Use a function that sends the "currentUser" AND flash "success" and "error" messages through to all routes, so that login/register/logout is shown correctly on all routes
app.use(
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
    next: express.NextFunction,
  ) => {
    res.locals.currentUser = undefined;

    // Identity comes only from Auth0 (see auth/identify.ts); the account rules
    // are in auth/resolveUser.ts. Never trust the request body or an unsigned header.
    let identity: Awaited<ReturnType<typeof identify>>;
    try {
      identity = await identify(req.headers.authorization);
    } catch (err) {
      if (err instanceof IdentityUnavailableError) {
        console.error(err.message);
        res
          .status(503)
          .send({ error: "Login check is temporarily unavailable. Please try again." });
        return;
      }
      throw err;
    }
    const idToken: Auth0IDToken | undefined = identity
      ? ({
          sub: identity.sub,
          email: identity.email,
          email_verified: identity.email_verified,
        } as Auth0IDToken)
      : undefined;

    const user = await resolveUser(identity, User);
    if (user) req.user = user;

    if (idToken) {
      req.idToken = idToken;
    }

    if (req.user) {
      res.locals.currentUser = req.user;
    }

    next();
  },
);

// MAKES THE APP ACTUALLY USE THE ROUTES
app.use(indexRoutes);
app.use("", tilesRoutes);
app.use("", parcelRoutes); // THE "" CAN BE CHANGED TO "/parcels FOR SHORTER FILES
app.use("", activityRoutes);
app.use("", projectRoutes);
app.use("", layerRoutes);
app.use("", practiceRoutes);
app.use("", farmerAdvisorRoutes);
app.use("", assetRoutes);
app.use("", systemRoutes);
app.use("", advisorRequets);
app.use("", systemdesignRoutes);
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
app.use("", catalogueRoutes); // plant catalogue: hybrid groups, cultivars, rootstocks
app.use("", stripeRoutes);
app.use("", userPresetsRoutes);
app.use("", farmScenarioConfigRoutes);
app.use("/internal", internalRoutes); // Grove team only: see routes/internal.ts
app.use("", plantOfferRequestRoutes);
app.use("", financialModelsRoutes);

// 404 ROUTE (Express 5 requires a named wildcard; bare "*" throws under path-to-regexp 8)
app.get("/*splat", async (req: express.Request & { user?: IUserSchema }, res: express.Response) => {
  res.status(404).send("404");
});

// ERRORS: one JSON answer and one log line with a short id, so a message on
// screen ("error a1b2c3d4") can be found in the Render logs.
app.use(
  (err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const errorId = randomUUID().slice(0, 8);
    console.error(`[error ${errorId}] ${req.method} ${req.originalUrl}`, err);
    if (res.headersSent) return;
    const status = Number.isInteger(err?.status) && err.status >= 400 ? err.status : 500;
    res.status(status).send({
      error: status === 500 ? "Something went wrong on the server" : String(err?.message ?? "Error"),
      errorId,
    });
  },
);

const PORT = process.env.BACKEND_PORT ? Number.parseInt(process.env.BACKEND_PORT) : 3001;
const IP = process.env.BACKEND_IP ?? "127.0.0.1";

app.listen(PORT, IP, () => {
  console.log(`RegenWorks backend server has started on ${IP}:${PORT}`);
});
