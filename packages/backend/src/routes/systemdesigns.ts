import express from "express";

import Project from "@rw/db/schemas/project";
import middleware from "../middleware/index";
import type { UserDocument } from "@rw/db/schemas/user";
import type { Auth0IDToken } from "../app";
import SystemDesign from "@rw/db/schemas/systemdesign";

const router = express.Router();

// NESTED AREA SYSTEM NEW ROUTE
router.get(
	"/projects/:projectid/systemdesign",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		console.log("new system");
		// FIND LAYER ID
		// try {
		//   const foundLayer = await Layer.findById(req.params.id);
		// FIND ALL SPECIES IN THE DATABASE

		const foundProject = await Project.findById(req.params.projectid).populate(
			"systemdesign",
		);

		if (foundProject) {
			// FIND ALL ANIMALS AND SORT
			try {
				res.send({
					// layer: foundLayer,
					systemdesign: foundProject.systemdesign,
				});
			} catch (err) {
				console.log(err);
			}
		}
		// } catch (err) {
		//   console.log(err);
		// }
	},
);

router.put(
	"/projects/:projectid/set-systemdesign",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND PROJECT
		const foundProject = await Project.findById(req.params.projectid).populate(
			"systemdesign",
		);

		// CHeck if project exists
		if (foundProject) {
			// Find system on project

			if (foundProject.systemdesign) {
				console.log("##### found system design #####");

				await foundProject.systemdesign.replaceOne(req.body);
			} else {
				console.log("##### didnt find system design #####");

				const newSystemDesign = await new SystemDesign(req.body);
				await newSystemDesign.save();
				foundProject.systemdesign = newSystemDesign;
				await foundProject.save();
			}

			res.sendStatus(200);
		} else {
			res.status(400).send({ error: "Project not found" });
		}
	},
);

export default router;
