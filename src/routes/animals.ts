import express from "express";
import Animal from "../models/animal.js";
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
  // ANIMAL INDEX
  router.get("/animals", async (c) => {
    await middleware.isLoggedIn(c);
    const foundAnimals = await Animal.find();
    return c.json({ animals: foundAnimals });
  });

  // ANIMAL NEW
  router.get("/animals/new", async (c) => {
    await middleware.isLoggedIn(c); // ADMIN LOGIN REQUIRED
    return c.json({});
  });

  // ANIMAL CREATE
  router.post("/animals", async (c) => {
    await middleware.isLoggedIn(c);
    const payload = await c.req.json();
    try {
      const createdAnimal = await Animal.create(payload.animal);
      console.log(`Animal created: ${createdAnimal}`);
      return c.json("/animals");
    } catch (err) {
      console.log(err);
    }
  });
}
