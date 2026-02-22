import express from "express";
import Species from "@rw/db/schemas/species.ts";
import middleware from "../middleware/index.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import type { Auth0IDToken } from "../app.ts";

const router = express.Router();

// SPECIES INDEX
router.get(
  "/species",
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundSpecies = await Species.aggregate([
        {
          $project: {
            id: 1,
            // _id: 1,
            nameCommon: 1,
            genus: 1,
            species: 1,
            family: 1,
            origin: 1,
            form: 1,
          },
        },
        {
          $sort: {
            nameCommon: 1,
          },
        },
      ]);

      res.send({ species: foundSpecies });
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES NEW
router.get(
  "/species/new",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // ONLY ADMIN ACCESS?
    res.send();
  },
);

// SPECIES CREATE
router.post(
  "/species",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // ONLY ADMIN ACCESS?
    try {
      const createdSpecies = await Species.create(req.body.species);
      console.log(createdSpecies);
      res.send(createdSpecies);
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES SHOW
router.get(
  "/species/:id",
  middleware.adminIsLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      // ONLY ADMIN ACCESS?
      const foundSpecies = await Species.findById(req.params.id).populate("flows").exec();
      res.send({ species: foundSpecies });
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES EDIT
router.get(
  "/species/:id/edit",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // ONLY ADMIN ACCESS?
    try {
      const foundSpecies = await Species.findById(req.params.id);
      res.send({ species: foundSpecies });
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES UPDATE
router.put(
  "/species/:id",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const updatedSpecies = await Species.findByIdAndUpdate(req.params.id, req.body.species);
      console.log(updatedSpecies);
      res.send(`/species/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES DELETE

// SPECIES ACTIVITY NEW ROUTE
router.get(
  "/species/:id/activities/new",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundSpecies = await Species.findById(req.params.id);
      res.send({ species: foundSpecies });
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES ACTIVITY CREATE ROUTE
router.post(
  "/species/:id/activities",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // SPLIT TYPE TO MAIN AND SUB ACTIVITY TYPE
    const types = req.body.activity.activityType.split(" ");
    const activity = {
      activityType: types[0],
      subtype: types[1],
      name: req.body.activity.name,
      time: {
        startMonth: req.body.activity.time.startMonth,
        endMonth: req.body.activity.time.endMonth,
      },
      price: req.body.activity.price,
    };
    try {
      const updatedSpecies = await Species.findByIdAndUpdate(req.params.id, {
        $addToSet: { activities: activity },
      });
      console.log(`${req.body.activity.name} has been added to the species`);
      res.send(`/species/${updatedSpecies?._id}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES ACTIVITY EDIT ROUTE
router.get(
  "/species/:id/activities/edit",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundSpecies = await Species.findById(req.params.id);
      if (foundSpecies) {
        if (req.query.index && typeof req.query.index === "string") {
          const activity = foundSpecies.activities[Number.parseInt(req.query.index, 10)];
          res.send({
            species: foundSpecies,
            activity,
            index: req.query.index,
          });
        } else {
          console.warn("req.query.index is not string type:", req.query.index);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES ACTIVITY UPDATE ROUTE
router.put(
  "/species/:id/activities",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // SPLIT TYPE TO MAIN AND SUB ACTIVITY TYPE
    const types = req.body.activity.activityType.split(" ");
    const activity = {
      activityType: types[0],
      subtype: types[1],
      name: req.body.activity.name,
      time: {
        startMonth: req.body.activity.time.startMonth,
        endMonth: req.body.activity.time.endMonth,
      },
      price: req.body.activity.price,
    };
    // FIND SPECIES
    try {
      const updatedSpecies = await Species.findById(req.params.id);
      if (updatedSpecies) {
        // CHANGE ACTIVITY DETAILS
        if (req.query.index && typeof req.query.index === "string") {
          updatedSpecies.activities[Number.parseInt(req.query.index, 10)] = activity;
          await updatedSpecies.save();
          res.send(`/species/${updatedSpecies._id}`);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES NUTRIENTS CREATE ROUTE
router.get(
  "/species/:id/nutrients/new",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundSpecies = await Species.findById(req.params.id);
      res.send({ species: foundSpecies });
    } catch (err) {
      console.log(err);
    }
  },
);

// SPECIES NUTRIENTS UPDATE ROUTE
router.put(
  "/species/:id/nutrients",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const updatedSpecies = await Species.findByIdAndUpdate(req.params.id, {
        $set: { nutrients: req.body.nutrients },
      });
      if (updatedSpecies) {
        res.send(`/species/${updatedSpecies._id}`);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

export default router;
