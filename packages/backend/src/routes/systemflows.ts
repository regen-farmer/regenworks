import express from "express";
import Systemflow from "@rw/db/schemas/systemflow";
import System from "@rw/db/schemas/system";
import Species from "@rw/db/schemas/species";
import middleware from "../middleware/index";
import { UserDocument } from "@rw/db/schemas/user";
import { Auth0IDToken } from "../app";

const router = express.Router();

// SYSTEMFLOW INDEX ROUTE

// NESTED SYSTEM SYSTEMFLOW NEW ROUTE
router.get(
	"/systems/:id/flows/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND SYSTEM ID
		try {
			const foundSystem = await System.findById(req.params.id);
			const foundSpecies = await Species.find();

			// SORT SPECIES
			foundSpecies.sort((a, b) => {
				if (a.nameCommon < b.nameCommon) {
					return -1;
				}
				if (a.nameCommon > b.nameCommon) {
					return 1;
				}
				return 0;
			});
			res.send({ system: foundSystem, species: foundSpecies });
		} catch (err) {
			console.log(err);
		}
	},
);

// NESTED SYSTEM SYSTEMFLOW CREATE ROUTE
router.post(
	"/systems/:id/flows",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND SYSTEM
		try {
			const foundSystem = await System.findById(req.params.id);
			const flow = req.body.flow;
			const data: any[] = [];
			for (let i = 0; i < flow.data.length; i++) {
				if (!(flow.data[i].species === "")) {
					data.push(flow.data[i]);
				}
			}
			flow.data = data;

			if (foundSystem) {
				try {
					const createdSystemflow = await Systemflow.create(req.body.flow);
					foundSystem.flows.push(createdSystemflow);
					await foundSystem.save();
					res.send(`/systems/${foundSystem._id}`);
				} catch (err) {
					console.log(err);
				}
			}
		} catch (err) {
			console.log(err);
		}
	},
);

export default router;
