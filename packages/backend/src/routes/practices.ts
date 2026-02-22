import express from "express";
import Practice from "@rw/db/schemas/practice.ts";
import Parcel from "@rw/db/schemas/parcel.ts";
import middleware from "../middleware/index.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import type { Auth0IDToken } from "../app.ts";

const router = express.Router();

// PRACTICE INDEX ROUTE

// PRACTICE NEW ROUTE

// PRACTICE CREATE ROUTE

// PRACTICE SHOW ROUTE - NEED TO REFACTOR FOR NO PARCEL ID QUERY
router.get(
  "/practices/:id",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    try {
      const foundPractice = await Practice.findById(req.params.id);
      try {
        const foundParcel = await Parcel.findById(req.query.parcelid);
        if (foundParcel && foundParcel.owner.id.toString() === req.user?._id.toString()) {
          // REFACTOR OWNERSHIP MIDDLEWARE?!?! WORKS FOR NOW
          console.log(foundParcel);
          res.send({ practice: foundPractice, parcel: foundParcel });
        } else {
          // req.flash("error", "You don't have permission to do that.");
          res.status(401).send({ error: "User is not owner of this farm" });
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PRACTICE UPDATE ROUTE

// PRACTICE DELETE ROUTE

export default router;
