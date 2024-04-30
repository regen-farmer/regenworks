import express from "express";
// import Well from "collections/well";
import Parcel from "@rw/db/schemas/parcel";
import middleware from "../middleware/index";
import type { UserDocument } from "@rw/db/schemas/user";
import type { Auth0IDToken } from "../app";

const router = express.Router();
// import Species from "collections/species";
// import Animal from "collections/animal";

// NESTED PARCEL WELL NEW ROUTE
router.get(
	"/parcels/:id/wells/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND PARCEL ID
		try {
			const foundParcel = await Parcel.findById(req.params.id);
			res.send({ parcel: foundParcel });
		} catch (err) {
			console.log(err);
		}
	},
);

// NESTED PARCEL WELL CREATE ROUTE

export default router;
