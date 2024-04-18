import express from "express";
import Flow from "../models/flow.js";
import Species from "../models/species.js";
import Parcel from "../models/parcel.js";
import middleware from "../middleware/index.js";
import { UserDocument } from "../models/user.js";
import { Auth0IDToken } from "../app.js";

const router = express.Router();

// PARCEL FLOWS
router.get(
	"/parcels/:id/flows",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		try {
			// FIND PARCEL
			const foundParcel = await Parcel.findById(req.params.id)
				.populate({ path: "layers", populate: { path: "rows" } })
				.exec();
			res.send({ parcel: foundParcel });
		} catch (err) {
			console.log(err);
		}
	},
);

// NESTED SPECIES FLOW NEW ROUTE
router.get(
	"/species/:id/flows/new",
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

// NESTED SPECIES FLOW CREATE ROUTE
router.post(
	"/species/:id/flows",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND SPECIES
		try {
			const foundSpecies = await Species.findById(req.params.id);
			console.log(req.body.flow);

			if (foundSpecies) {
				try {
					const createdFlow = await Flow.create(req.body.flow);
					foundSpecies.flows.push(createdFlow);
					await foundSpecies.save();
					res.send(`/species/${foundSpecies._id}`);
				} catch (err) {
					console.log(err);
				}
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// NESTED SYSTEM FLOW NEW ROUTE

// NESTED SYSTEM FLOW CREATE ROUTE

export default router;
