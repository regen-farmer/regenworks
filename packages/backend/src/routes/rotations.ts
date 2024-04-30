import express from "express";
import Rotation from "@rw/db/schemas/rotation";
import Layer from "@rw/db/schemas/layer";
import Project from "@rw/db/schemas/project";
import Species from "@rw/db/schemas/species";
import middleware from "../middleware/index";
import type { UserDocument } from "@rw/db/schemas/user";
import type { Auth0IDToken } from "../app";

const router = express.Router();

// NEW AREA SYSTEM GRID NEW ROUTE
router.get(
	"/layers/:id/rotations/steps",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND LAYER
		try {
			const foundLayer = await Layer.findById(req.params.id);
			res.send({ layer: foundLayer, project: "" });
		} catch (err) {
			console.log(err);
		}
	},
);

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post(
	"/layers/:id/rotations/steps",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// CHECK LENGTH IS DIVISIBLE
		if ((req.body.length / req.body.distance) % 1 === 0) {
			// FIND LAYER
			try {
				const foundLayer = await Layer.findById(req.params.id);
				if (foundLayer) {
					res.send(
						`/layers/${foundLayer._id}/rotations/new?distance=${req.body.distance}&length=${req.body.length}`,
					);
				}
			} catch (err) {
				console.log(err);
			}
		} else {
			console.log(
				"Length must be divisible with distance between species in rotation.",
			);
			res.status(400).send({
				error:
					"Length must be divisible with distance between species in rotation.",
			});
		}
	},
);

// ROTATION NEW
router.get(
	"/layers/:id/rotations/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND LAYER
		try {
			const foundLayer = await Layer.findById(req.params.id);
			// FIND ALL SPECIES
			try {
				const foundSpecies = await Species.find();
				// SORT SPECIES
				foundSpecies.sort((a, b) => {
					if (a.genus < b.genus) {
						return -1;
					}
					if (a.genus > b.genus) {
						return 1;
					}
					return 0;
				});
				res.send({
					layer: foundLayer,
					project: "",
					species: foundSpecies,
					distance: req.query.distance,
					length: req.query.length,
				});
			} catch (err) {
				console.log(err);
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// SEQUENCE CREATE

// NEW AREA SYSTEM GRID NEW ROUTE
router.get(
	"/projects/:id/rotations/steps",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND LAYER
		try {
			const foundProject = await Project.findById(req.params.id);
			res.send({ project: foundProject });
		} catch (err) {
			console.log(err);
		}
	},
);

// NEW AREA SYSTEM GRID REDIRECT ROUTE
router.post(
	"/projects/:id/rotations/steps",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND PROJECT
		try {
			const foundProject = await Project.findById(req.params.id);
			if (foundProject) {
				res.send(
					`/projects/${foundProject._id}/rotations/new?steps=${req.body.steps}`,
				);
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// ROTATION NEW
router.get(
	"/projects/:id/rotations/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND LAYER
		try {
			const foundProject = await Project.findById(req.params.id);
			// FIND ALL SPECIES
			try {
				const foundSpecies = await Species.find();
				// SORT SPECIES

				foundSpecies.sort((a, b) => {
					if (a.genus < b.genus) {
						return -1;
					}
					if (a.genus > b.genus) {
						return 1;
					}
					return 0;
				});
				res.send({
					project: foundProject,
					species: foundSpecies,
					steps: req.query.steps,
				});
			} catch (err) {
				console.log(err);
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// CREATE PROJECT ROTATION
router.post(
	"/projects/:id/rotations",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND LAYER
		try {
			const foundProject = await Project.findById(req.params.id);
			if (foundProject) {
				// const model:any[] = [];
				// // CHECK IF ARRAY
				// if (!(req.body.model.speciesmix.species instanceof Array)) {
				//   const speciesmix: any = {
				//     species: req.body.model.speciesmix.species,
				//   };
				//   model.push(speciesmix);
				// } else {
				//   for (let i = 0; i < req.body.model.speciesmix.speciwwes.length; i++) {
				//   // FIX IF ONLY ONE ITEM IN ROW
				//   // IF SPECIES ID IS NULL
				//     if (!(req.body.model.speciesmix.species[i] === '')) {
				//       const speciesmix: any = {
				//         speciesmix: [
				//           {
				//             species: req.body.model.speciesmix.species[i],
				//             amount: 0,
				//           },
				//         ],
				//         planting: {
				//           year: req.body.model.planting.year[i],
				//           month: req.body.model.planting.month[i],
				//         },
				//         harvest: {
				//           year: req.body.model.harvest.year[i],
				//           month: req.body.model.harvest.month[i],
				//         },
				//       };
				//       model.push(speciesmix);
				//     }
				//   }
				// }
				const rotation = req.body.rotation;
				// rotation.model = req.body.model;
				try {
					const createdRotation = await Rotation.create(rotation);
					console.log(`rotation: ${createdRotation}`);
					// SAVE SEQUENCE ON LAYER?
					createdRotation.owner.id = req.user?._id.toString()!;
					await createdRotation.save();
					res.send(createdRotation);
				} catch (err) {
					console.log(err);
				}
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// EDIT PROJECT ROTATION
router.get(
	"/projects/:id/rotations/:pid/edit",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND LAYER
		try {
			const foundProject = await Project.findById(req.params.id)
				.populate({
					path: "areas.rotation",
					populate: { path: "model.species" },
				})
				.exec();
			// FIND SEQUENCES
			try {
				const foundRotation = await Rotation.findById(req.params.pid)
					.populate("model.speciesmix.species")
					.exec();

				// FIND ALL SPECIES
				res.send({ project: foundProject, rotation: foundRotation });
			} catch (err) {
				console.log(err);
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// UPDATE PROJECT ROTATION
router.put(
	"/projects/:id/rotations/:pid",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND LAYER
		const rotation = req.body.rotation;
		try {
			const foundProject = await Project.findById(req.params.id);
			if (foundProject) {
				try {
					await Rotation.findByIdAndUpdate(req.params.pid, rotation);
					res.send(`/projects/${foundProject._id}/layout`);
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
