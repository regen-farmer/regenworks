import express from "express";
import NodeGeocoder from "node-geocoder";
import Nursery from "@rw/db/schemas/nursery.ts";
import User, { type UserDocument } from "@rw/db/schemas/user.ts";
import middleware from "../middleware/index.ts";
import type { Auth0IDToken } from "../app.ts";

// NODE GEOCODER CODE
const router = express.Router();

const options: NodeGeocoder.Options = {
  provider: "openstreetmap",
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
  headers: {
    "User-Agent": "RegenWorks",
    Referer: "https://regenfarmer.com",
  },
};

const geocoder = NodeGeocoder(options);

// NURSERY INDEX
router.get(
  "/nurseries",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND NURSERY BASED ON USER
    try {
      const foundNurseries = await Nursery.find({ "owner.id": req.user?._id });
      console.log(foundNurseries.length);
      res.send({ nurseries: foundNurseries });
    } catch (err) {
      console.log(err);
    }
  },
);

// NURSERY NEW
router.get(
  "/nurseries/new",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // ADMIN LOGIN REQUIRED
    res.send();
  },
);

// ANIMAL CREATE
router.post(
  "/nurseries",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // SET INITIAL VARIABLE
    const newNursery = req.body.nursery;
    // GEOLOCATION
    geocoder.geocode(req.body.nursery.location, async (err, data) => {
      if (err || !data.length) {
        console.log(err);
        console.log(data);
        return res.status(500).send({ error: `Error while geocoding: ${err.toString()}` });
      }
      // SET NEW LATS
      newNursery.lat = data[0].latitude;
      newNursery.lng = data[0].longitude;
      newNursery.location = data[0].formattedAddress;
      try {
        const createdNursery = await Nursery.create(newNursery);
        // SET OWNERSHIP
        createdNursery.owner.id = req.user?._id.toString()!;
        await createdNursery.save();
        // ADD TO USER
        try {
          const foundUser = await User.findById(req.user?._id);
          // Add the parcel to the users parcels for referencing
          if (foundUser) {
            foundUser.nurseries.push(createdNursery);
            await foundUser.save();
            // REDIRECT
            console.log(`Nursery created: ${createdNursery}`);
            res.send(`/nurseries/${createdNursery._id}`);
          }
        } catch (err) {
          console.log(err);
        }
      } catch (err) {
        console.log(err);
      }
    });
  },
);

// NURSERY SHOW
router.get(
  "/nurseries/:id",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // DO OWNERSHIP MODEL
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(req.params.id).populate("products").exec();
      // RENDER SHOW PAGE
      res.send({ nursery: foundNursery });
    } catch (err) {
      console.log(err);
    }
  },
);

// NURSERY EDIT
router.get(
  "/nurseries/:id/edit",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND NURSERY
    try {
      const foundNursery = await Nursery.findById(req.params.id);
      res.send({ nursery: foundNursery });
    } catch (err) {
      console.log(err);
    }
  },
);

// NURSERY UPDATE
router.put(
  "/nurseries/:id",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // SETUP NEW GEO
    // SET INITIAL VARIABLE
    const newNursery = req.body.nursery;
    // GEOLOCATION
    geocoder.geocode(req.body.nursery.location, async (err, data) => {
      if (err || !data.length) {
        console.log(err);
        console.log(data);
        return res.status(500).send({ error: `Error while geocoding: ${err.toString()}` });
      }
      // SET NEW LATS
      newNursery.lat = data[0].latitude;
      newNursery.lng = data[0].longitude;
      newNursery.location = data[0].formattedAddress;
      try {
        const updateNursery = await Nursery.findByIdAndUpdate(req.params.id, newNursery);
        // REDIRECT
        if (updateNursery) {
          console.log(`Nursery update: ${updateNursery}`);
          res.send(`/nurseries/${updateNursery._id}`);
        } else {
          console.log("No updateNursery");
        }
      } catch (err) {
        console.log(err);
      }
    });
  },
);

export default router;
