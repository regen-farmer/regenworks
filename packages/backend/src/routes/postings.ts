import express from "express";
import Posting from "@rw/db/schemas/posting";
import Budget from "@rw/db/schemas/budget";
import Parcel from "@rw/db/schemas/parcel";
import Layer from "@rw/db/schemas/layer";
import middleware from "../middleware/index";
import type { UserDocument } from "@rw/db/schemas/user";
import type { Auth0IDToken } from "../app";

const router = express.Router();

// POSTING EDIT ROUTE

// POSTING UPDATE ROUTE

// NESTED POSTING BUDGET NEW ROUTE
router.get(
	"/budgets/:id/postings/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND BUDGET ID
		try {
			const foundBudget = await Budget.findById(req.params.id);
			res.send({ budget: foundBudget });
		} catch (err) {
			console.log(err);
		}
	},
);

// NESTED POSTING BUDGET CREATE ROUTE
router.post(
	"/budgets/:id/postings",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
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
					await foundBudget.save();
					res.send(`/budgets/${foundBudget._id}`);
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
	"/budgets/:id/postings/:postid/edit",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND BUDGET
		try {
			const foundBudget = await Budget.findById(req.params.id);
			try {
				const foundPosting = await Posting.findById(req.params.postid);
				res.send({
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
	"/budgets/:id/postings/:postid",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND POSTING AND UPDATE
		try {
			await Posting.findByIdAndUpdate(req.params.postid, req.body.posting);
			res.send(`/budgets/${req.params.id}`);
		} catch (err) {
			console.log(err);
		}
	},
);

// POSTING PARCEL BUDGET NEW
router.get(
	"/parcels/:id/layers/:bid/accounts/postings/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND BUDGET ID
		try {
			const foundParcel = await Parcel.findById(req.params.id)
				.populate({ path: "layers", populate: { path: "budget" } })
				.exec();
			try {
				const foundLayer = await Layer.findById(req.params.bid);
				res.send({
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
	"/parcels/:id/layers/:bid/accounts/postings",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// BUDGET MIDDLEWARE!!! VIP
		// CREATE POSTING FIRST AND INSERT IN BUDGET
		try {
			const foundLayer = await Layer.findById(req.params.bid)
				.populate({ path: "accounts" })
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
							await foundBudget.save();
							res.send(`/parcels/${req.params.id}/accounts`);
						} catch (err) {
							console.log(err);
						}
					}
				} catch (err) {
					console.log(err);
				}
			} else {
				console.log("No foundLayer");
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// POSTING

export default router;
