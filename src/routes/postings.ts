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
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // BUDGET MIDDLEWARE!!! VIP
    // CREATE POSTING FIRST AND INSERT IN BUDGET
    Budget.findById(req.params.id, (err, foundBudget) => {
      if (err) {
        console.log(err);
      } else {
        Posting.create(req.body.posting, (err, createdPosting) => {
          if (err) {
            console.log(err);
          } else {
            console.log(createdPosting);
            // SAVE POSTING ON BUDGET
            foundBudget.postings.push(createdPosting);
            foundBudget.save();
            res.redirect(`/budgets/${foundBudget._id}`);
          }
        });
      }
    });
  },
);

// NESTED POSTING BUDGET EDIT ROUTE - WITH THESE I CAN CHECK BUDGET OWNERSHIP
router.get(
  '/budgets/:id/postings/:postid/edit',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND BUDGET
    Budget.findById(req.params.id, (err, foundBudget) => {
      if (err) {
        console.log(err);
      } else {
        Posting.findById(req.params.postid, (err, foundPosting) => {
          if (err) {
            console.log(err);
          } else {
            res.render('postings/edit', {
              budget: foundBudget,
              posting: foundPosting,
            });
          }
        });
      }
    });
  },
);

// NESTED POSTING BUDGET UPDATE ROUTE
router.put(
  '/budgets/:id/postings/:postid',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND POSTING AND UPDATE
    Posting.findByIdAndUpdate(
      req.params.postid,
      req.body.posting,
      (err) => {
        if (err) {
          console.log(err);
        } else {
          res.redirect(`/budgets/${req.params.id}`);
        }
      },
    );
  },
);

// POSTING PARCEL BUDGET NEW
router.get(
  '/parcels/:id/layers/:bid/accounts/postings/new',
  middleware.isLoggedIn,
  (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND BUDGET ID
    Parcel.findById(req.params.id)
      .populate({ path: 'layers', populate: { path: 'budget' } })
      .exec((err, foundParcel) => {
        if (err) {
          console.log(err);
        } else {
          Layer.findById(req.params.bid, (err, foundLayer) => {
            if (err) {
              console.log(err);
            } else {
              res.render('postings/accountnew', {
                parcel: foundParcel,
                layer: foundLayer,
              });
            }
          });
        }
      });
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
        Budget.findById(foundLayer.accounts._id, (err, foundBudget) => {
          if (err) {
            console.log(err);
          } else {
            Posting.create(req.body.posting, (err, createdPosting) => {
              if (err) {
                console.log(err);
              } else {
                console.log(createdPosting);
                // SAVE POSTING ON BUDGET
                foundBudget.postings.push(createdPosting);
                foundBudget.save();
                res.redirect(`/parcels/${req.params.id}/accounts`);
              }
            });
          }
        });
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
