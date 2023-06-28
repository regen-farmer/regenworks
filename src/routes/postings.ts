import express from 'express';
import Posting from '../models/posting.js';
import Budget from '../models/budget.js';
import Parcel from '../models/parcel.js';
import Layer from '../models/layer.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken, Variables } from '../app.js';

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

// POSTING EDIT ROUTE

// POSTING UPDATE ROUTE

// NESTED POSTING BUDGET NEW ROUTE
router.get(
  '/budgets/:entityid/postings/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND BUDGET ID
    try {
      const foundBudget = await Budget.findById(c.req.param('entityid'));
      return c.json({ budget: foundBudget });
    } catch (err) {
      console.log(err);
    }
  },
);

// NESTED POSTING BUDGET CREATE ROUTE
router.post(
  '/budgets/:entityid/postings',
  async (c) => {
    await middleware.isLoggedIn(c)
    // BUDGET MIDDLEWARE!!! VIP
    // CREATE POSTING FIRST AND INSERT IN BUDGET
    try {
      const foundBudget = await Budget.findById(c.req.param('entityid'));
      if (foundBudget) {
        try {
          const createdPosting = await Posting.create((await c.req.json()).posting);
          console.log(createdPosting);
          // SAVE POSTING ON BUDGET
          foundBudget.postings.push(createdPosting);
          await foundBudget.save();
          return c.json(`/budgets/${foundBudget._id}`);
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// NESTED POSTING BUDGET EDIT ROUTE - WITH THESE I CAN CHECK BUDGET OWNERSHIP
router.get(
  '/budgets/:entityid/postings/:postid/edit',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND BUDGET
    try {
      const foundBudget = await Budget.findById(c.req.param('entityid'));
      try {
        const foundPosting = await Posting.findById(c.req.param('postid'));
        return c.json({
          budget: foundBudget,
          posting: foundPosting,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// NESTED POSTING BUDGET UPDATE ROUTE
router.put(
  '/budgets/:entityid/postings/:postid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND POSTING AND UPDATE
    try {
      await Posting.findByIdAndUpdate(
        c.req.param('postid'),
        (await c.req.json()).posting,
      );
      return c.json(`/budgets/${c.req.param('entityid')}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// POSTING PARCEL BUDGET NEW
router.get(
  '/parcels/:entityid/layers/:bid/accounts/postings/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND BUDGET ID
    try {
      const foundParcel = await Parcel.findById(c.req.param('entityid'))
        .populate({ path: 'layers', populate: { path: 'budget' } })
        .exec();
      try {
        const foundLayer = await Layer.findById(c.req.param('bid'));
        return c.json({
          parcel: foundParcel,
          layer: foundLayer,
        });
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// POSTING PARCEL BUDGET CREATE ROUTE
router.post(
  '/parcels/:entityid/layers/:bid/accounts/postings',
  async (c) => {
    await middleware.isLoggedIn(c)
    // BUDGET MIDDLEWARE!!! VIP
    // CREATE POSTING FIRST AND INSERT IN BUDGET
    try {
      const foundLayer = await Layer.findById(c.req.param('bid'))
        .populate({ path: 'accounts' })
        .exec();
      if (foundLayer) {
        try {
          const foundBudget = await Budget.findById(foundLayer.accounts._id);
          if (foundBudget) {
            try {
              const createdPosting = await Posting.create((await c.req.json()).posting);
              console.log(createdPosting);
              // SAVE POSTING ON BUDGET
              foundBudget.postings.push(createdPosting);
              await foundBudget.save();
              return c.json(`/parcels/${c.req.param('entityid')}/accounts`);
            } catch (err) {
              console.log(err);
            }
          }
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log('No foundLayer');
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// POSTING

}
