import express from "express";
import Asset from "../models/asset.js";
import Layer from "../models/layer.js";
import Project from "../models/project.js";
import Species from "../models/species.js";
import middleware from "../middleware/index.js";
import { UserDocument } from "../models/user.js";
import { Auth0IDToken } from "../app.js";

const router = express.Router();

// ASSET INDEX ROUTE
router.get(
	"/assets",
	middleware.adminIsLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// Get all assets from DB
		try {
			const allAssets = await Asset.find({ "owner.id": req.user?._id });
			res.send({ assets: allAssets });
		} catch (err) {
			console.log(err);
		}
	},
);

// ASSET NEW ROUTE
router.get(
	"/assets/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		try {
			const foundLayers = await Layer.find({ "owner.id": req.user?._id });
			// console.log("Reached this far");
			// foundLayers.forEach(function(layer){
			//     console.log(layer.id);
			// });
			res.send({ layers: foundLayers });
		} catch (err) {
			console.log(err);
		}
	},
);

// ASSET CREATE ROUTE
router.post(
	"/assets",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// Create a new experience
		try {
			const createdAsset = await Asset.create(req.body.asset);
			// Add ID to experience
			createdAsset.owner.id = req.user?._id.toString()!;
			// Save the asset - Not needed if created after this step
			await createdAsset.save();
			res.send("/assets");
		} catch (err) {
			console.log(err);
		}
	},
);

// ASSET SHOW ROUTES
router.get(
	"/assets/:id",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// Find specific asset
		try {
			const foundAsset = await Asset.findById(req.params.id)
				.populate("layer")
				.exec();
			res.send({ asset: foundAsset });
		} catch (err) {
			console.log(err);
		}
	},
);

// ASSET EDIT ROUTE
router.get(
	"/assets/:id/edit",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND ASSET AND RENDER EDIT PAGE
		try {
			const foundAsset = await Asset.findById(req.params.id)
				.populate("species")
				.exec();
			if (foundAsset) {
				// GET ALL SPECIES!!
				try {
					const foundSpecies = await Species.find();
					console.log(foundAsset.species);
					console.log(foundSpecies[0]);
					res.send({
						asset: foundAsset,
						species: foundSpecies,
					});
				} catch (err) {
					console.log(err);
				}
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// ASSET UPDATE ROUTE
router.put(
	"/assets/:id",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// UPDATE ASSET
		try {
			const updatedAsset = await Asset.findByIdAndUpdate(
				req.params.id,
				req.body.asset,
			);
			if (updatedAsset) {
				res.send(`/assets/${updatedAsset._id}`);
			} else {
				console.log("Asset not updated");
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// ASSET DELETE ROUTE
router.delete(
	"/assets/:id",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// MAKE ACTIVITY OWNERSHIP MIDDLEWARE
		// FIND ASSET
		try {
			const foundAsset = await Asset.findById(req.params.id);
			console.log(foundAsset);
			// REMOVE ASSET FROM PROJECT
			if (foundAsset) {
				try {
					const foundProject = await Project.findOne({
						assets: foundAsset._id,
					});
					if (foundProject) {
						try {
							await Project.findByIdAndUpdate(foundProject._id, {
								$pull: { assets: foundAsset._id },
							});

							// DELETE ASSET
							try {
								await Asset.findByIdAndRemove(req.params.id);
								res.send(`/projects/${foundProject._id}`);
							} catch (err) {
								console.log(err);
								res.send("/assets");
							}
						} catch (err) {
							console.log(err);
						}
					}
				} catch (err) {
					console.log(err);
				}
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// AREA ASSET NEW ROUTE
router.get(
	"/layers/:id/assets/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		try {
			const foundLayer = await Layer.findById(req.params.id);
			res.send({ layer: foundLayer });
		} catch (err) {
			console.log(err);
		}
	},
);

// AREA ASSET CREATE ROUTE
router.post(
	"/layers/:id/assets",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		try {
			const foundLayer = await Layer.findById(req.params.id);
			if (foundLayer) {
				const createdAsset = await Asset.create(req.body.asset);

				// Add user ID to experience
				createdAsset.owner.id = req.user?._id.toString()!;
				await createdAsset.save();
				// ADD ASSET TO LAYER
				foundLayer.assets.push(createdAsset);
				// REDIRECT TO
				res.send(`/layers/${foundLayer._id}`);
			}
		} catch (err) {
			console.log(err);
		}
	},
);

export default router;
