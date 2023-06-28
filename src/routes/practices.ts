import express from "express";
import Practice from "../models/practice.js";
import Parcel from "../models/parcel.js";
import middleware from "../middleware/index.js";
import { UserDocument } from "../models/user.js";
import { Auth0IDToken, Variables } from "../app.js";

import { Hono } from "hono";

// import logger from '../middleware/logger';

export default function indexRoutes(
  router: Hono<
    {
      Variables: Variables;
    },
    {},
    "/"
  >
) {
  // PRACTICE INDEX ROUTE

  // PRACTICE NEW ROUTE

  // PRACTICE CREATE ROUTE

  // PRACTICE SHOW ROUTE - NEED TO REFACTOR FOR NO PARCEL ID QUERY
  router.get("/practices/:id", async (c) => {
await middleware.isLoggedIn(c);
    try {
      const foundPractice = await Practice.findById(c.req.param("id"));
      try {
        const foundParcel = await Parcel.findById(c.req.query('parcelid'));
        if (
          foundParcel &&
          foundParcel.owner.id.toString() === c.get("user")?._id.toString()
        ) {
          // REFACTOR OWNERSHIP MIDDLEWARE?!?! WORKS FOR NOW
          console.log(foundParcel);
          return c.json({ practice: foundPractice, parcel: foundParcel });
        } else {
          // req.flash("error", "You don't have permission to do that.");
          c.status(401);
          return c.json({ error: "User is not owner of this farm" });
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  });

  // PRACTICE UPDATE ROUTE

  // PRACTICE DELETE ROUTE
}
