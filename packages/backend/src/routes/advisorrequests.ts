import express from "express";
import middleware from "../middleware/index.ts";
import AdvisorRequestDocument from "@rw/db/schemas/advisorrequests.ts";
import type { Auth0IDToken } from "../app.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";

const router = express.Router();



router.post(
	"/advisor-requests",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {


		try {
		const advisorRequest = new AdvisorRequestDocument({
			user: req.user?._id,
			email: req.user?.email,
			creationDate: new Date(),
			status: "pending",
		});

			
			await advisorRequest.save();
			res.status(201).json(advisorRequest);
		} catch (err) {
			
			res.status(500).json({ message: "Server error" });
		}
	},
);

router.get(
	"/my-advisor-requests",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		try {
			const advisorRequests = await AdvisorRequestDocument.find({
				user: req.user?._id,
				status: "pending",
			});

			
			await res.status(200).json(advisorRequests);
		} catch (err) {
			await res.status(500).json({ message: "Server error" });
			
		}
	},
);

router.get(
	"/advisor-requests",
	middleware.adminIsLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		
		try {
			const advisorRequests = await AdvisorRequestDocument.find().populate('user');

			await res.status(200).json(advisorRequests);
		} catch (err) {
			await res.status(500).json({ message: "Server error" });
		}
	},
);


router.put(
	"/advisor-requests/:id",
	middleware.adminIsLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {

		try {
			const advisorRequest = await AdvisorRequestDocument.findByIdAndUpdate(
				req.params.id,
				{ status: req.body.status },
				{ new: true }
			).populate('user');
			if (!advisorRequest) {
				await res.status(404).json({ message: "Advisor request not found" });
			}
			res.status(200).json(advisorRequest);
		} catch (err) {
			
			await res.status(500).json({ message: "Server error" });
		}

	}
);

export default router;