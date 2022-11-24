import express from 'express';
import Posting from '../models/posting';
import Budget from '../models/budget';
import Parcel from '../models/parcel';
import Layer from '../models/layer';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';

const router = express.Router();

// POSTING EDIT ROUTE

// POSTING UPDATE ROUTE

// NESTED POSTING BUDGET NEW ROUTE
router.get(
  '/budgets/:id/postings/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND BUDGET ID
    try {
      const foundBudget = await Budget.findById(req.params.id);
      res.render('postings/new', { budget: foundBudget });
    } catch (err) {
      console.log(err);
    }
  },
);

// NESTED POSTING BUDGET CREATE ROUTE
router.post(
  '/budgets/:id/postings',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // BUDGET MIDDLEWARE!!! VIP
    // CREATE POSTING FIRST AND INSERT IN BUDGET
    try {
      const foundBudget = await Budget.findById(req.params.id);
      if (foundBudget) {
        try {
          const createdPosting = await Posting.create(req.body.posting);
          console.log(createdPosting);
          // SAVE POSTING ON BUDGET
          foundBudget.postings.push(createdPosting);
          foundBudget.save();
          res.redirect(`/budgets/${foundBudget._id}`);
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
  '/budgets/:id/postings/:postid/edit',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND BUDGET
    try {
      const foundBudget = await Budget.findById(req.params.id);
      try {
        const foundPosting = await Posting.findById(req.params.postid);
        res.render('postings/edit', {
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
  '/budgets/:id/postings/:postid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND POSTING AND UPDATE
    try {
      Posting.findByIdAndUpdate(
        req.params.postid,
        req.body.posting,
      );
      res.redirect(`/budgets/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },
);

// POSTING PARCEL BUDGET NEW
router.get(
  '/parcels/:id/layers/:bid/accounts/postings/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND BUDGET ID
    try {
      const foundParcel = await Parcel.findById(req.params.id)
        .populate({ path: 'layers', populate: { path: 'budget' } })
        .exec();
      try {
        const foundLayer = await Layer.findById(req.params.bid);
        res.render('postings/accountnew', {
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
  '/parcels/:id/layers/:bid/accounts/postings',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // BUDGET MIDDLEWARE!!! VIP
    // CREATE POSTING FIRST AND INSERT IN BUDGET
    try {
      const foundLayer = await Layer.findById(req.params.bid)
        .populate({ path: 'accounts' })
        .exec();
      if (foundLayer) {
        try {
          const foundBudget = await Budget.findById(foundLayer.accounts._id);
          if (foundBudget) {
            try {
              const createdPosting = await Posting.create(req.body.posting);
              console.log(createdPosting);
              // SAVE POSTING ON BUDGET
              foundBudget.postings.push(createdPosting);
              foundBudget.save();
              res.redirect(`/parcels/${req.params.id}/accounts`);
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

export default router;
