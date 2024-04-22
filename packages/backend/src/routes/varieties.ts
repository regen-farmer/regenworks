import express from "express";
import Variety from "@rw/db/schemas/variety";
import Species from "@rw/db/schemas/species";
import middleware from "../middleware/index";
import { UserDocument } from "@rw/db/schemas/user";
import { Auth0IDToken } from "../app";

const router = express.Router();

// VARIETY INDEX
router.get(
	"/varieties",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// Get all varieties from DB
		try {
			const allUserVarieties = await Variety.find({ "owner.id": req.user?._id })
				.populate("species")
				.exec();
			res.send({ varieties: allUserVarieties });
		} catch (err) {
			console.log(err);
		}
	},
);

// VARIETY NEW
router.get(
	"/varieties/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND ALL SPECIES
		try {
			const allSpecies = await Species.find();
			// SORT SPECIES
			allSpecies.sort((a, b) => {
				if (a.genus < b.genus) {
					return -1;
				}
				if (a.genus > b.genus) {
					return 1;
				}
				return 0;
			});
			res.send({ species: allSpecies });
		} catch (err) {
			console.log(err);
		}
	},
);

// VATERTY CREATE
router.post(
	"/varieties",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// CLEAN NONE OPTIONS
		const variety = req.body.variety;
		if (req.body.variety.species === "") {
			delete variety.species;
		}
		if (req.body.variety.hybrid === "") {
			delete variety.hybrid;
		}
		if (req.body.variety.rootstock.species === "") {
			delete variety.rootstock.species;
		}
		// CREATE VARIETY
		const createdVariety = await Variety.create(variety);

		// SET OWNERSHIP
		createdVariety.owner.id = req.user?._id.toString()!;
		await createdVariety.save();
		// REDIRECT TO USER
		res.send(`/users/${req.user?._id}`);
	},
);

export default router;
