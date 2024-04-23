import express from "express";
import Parcel from "@rw/db/schemas/parcel";
import Layer from "@rw/db/schemas/layer";
import Saptest from "@rw/db/schemas/saptest";
import middleware from "../middleware/index";
import { UserDocument } from "@rw/db/schemas/user";
import { Auth0IDToken } from "../app";

const router = express.Router();

// PARCEL LAYER SAP TEST NEW
router.get(
	"/parcels/:id/layers/:pid/saptests/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND PARCEL
		try {
			const foundParcel = Parcel.findById(req.params.id)
				.populate("layers")
				.exec();
			// FIND LAYER

			try {
				const foundLayer = Layer.findById(req.params.pid);
				// RENDER ACTIVITIES
				res.send({ parcel: foundParcel, layer: foundLayer });
			} catch (err) {
				console.log(err);
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// PARCEL LAYER SOIL TEST CREATE
router.post(
	"/parcels/:id/layers/:pid/saptests",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// PARSE COORDINATES
		/* var sapTest = req.body.saptest;
    var parsedCoordinates = req.body.coordinates.split(", ");
    console.log(parsedCoordinates);
    soiltest.lat = parsedCoordinates[0];
    soiltest.lat = parsedCoordinates[1];
    res.send("/parcels/" + req.params.id + "/status"); */
		// CREATE SOIL TEST
		try {
			const createdSaptest = await Saptest.create(req.body.saptest);
			try {
				await Layer.findByIdAndUpdate(req.params.pid, {
					$push: { saptests: createdSaptest },
				});
				// RENDER PARCEL LAYER SAP TEST PAGE
				res.send(`/parcels/${req.params.id}/status`);
			} catch (err) {
				console.log(err);
			}
		} catch (err) {
			console.log(err);
		}
	},
);

export default router;
