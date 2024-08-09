/* eslint-disable import/first */
import dotenv from "dotenv";

dotenv.config();

import express from "express";
import mongoose from "mongoose";
import methodOverride from "method-override"; // USED FOR PUT AND DELETE REQUESTS
import cors from "cors";
import User, { type IUserSchema, type UserDocument } from "@rw/db/schemas/user.ts";
import bodyParser from "body-parser";

// REQUIRE ROUTES
import tilesRoutes from "./routes/tiles.ts";
import parcelRoutes from "./routes/parcels.ts";
import indexRoutes from "./routes/index.ts";
import activityRoutes from "./routes/activities.ts";
import projectRoutes from "./routes/projects.ts";
import layerRoutes from "./routes/layers.ts";
import practiceRoutes from "./routes/practices.ts";
import assetRoutes from "./routes/assets.ts";
import systemRoutes from "./routes/systems.ts";
import systemdesignRoutes from "./routes/systemdesigns.ts";
import speciesRoutes from "./routes/species.ts";
import flowRoutes from "./routes/flows.ts";
import systemflowRoutes from "./routes/systemflows.ts";
import animalRoutes from "./routes/animals.ts";
import budgetRoutes from "./routes/budgets.ts";
import postingRoutes from "./routes/postings.ts";
import nurseryRoutes from "./routes/nurseries.ts";
import nurseryproductRoutes from "./routes/nurseryproducts.ts";
import sequenceRoutes from "./routes/sequences.ts";
import areaRoutes from "./routes/areas.ts";
import noteRoutes from "./routes/notes.ts";
import soiltestRoutes from "./routes/soiltests.ts";
import saptestRoutes from "./routes/saptests.ts";
import farmflowRoutes from "./routes/farmflows.ts";
import rotationRoutes from "./routes/rotations.ts";
import varietyRoutes from "./routes/varieties.ts";
import stripeRoutes from "./routes/stripe.ts";

export type Auth0IDToken = {
	nickname: string;
	name: string;
	picture: string;
	updated_at: string;
	email: string;
	email_verified: boolean;
	iss: string;
	aud: string;
	iat: number;
	exp: number;
	sub: string;
	sid: string;
};
const app = express();

app.use(cors());

// APP SETUP
mongoose.connect(process.env.DATABASEURL as string); // CONNECTS TO MLAB MONGODB

app.use(bodyParser.json());

// app.use(express.static(`${__dirname}/public`)); // SETS PUBLIC ASSETS REPOSITORY
app.use(methodOverride("_method")); // USE "_method" TO PASS PUT AND DELETE REQUESTS
// seedDB(); // USE ONLY FOR SEEDING DATABAS

// const config = {
//   authRequired: false,
//   auth0Logout: true,
//   baseURL: process.env.AUTH0_BASE_URL,
//   clientID: process.env.AUTH0_CLIENT_ID,
//   issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
//   secret: process.env.AUTH0_SECRET,
// };

// app.use(auth(config));

const getDurationInMilliseconds = (start) => {
	const NS_PER_SEC = 1e9;
	const NS_TO_MS = 1e6;
	const diff = process.hrtime(start);

	return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS;
};

app.use((req, res, next) => {
	console.log(`${req.method} ${req.originalUrl} [STARTED]`);
	const start = process.hrtime();

	res.on("finish", () => {
		const durationInMilliseconds = getDurationInMilliseconds(start);
		console.log(
			`${req.method} ${
				req.originalUrl
			} [FINISHED] ${durationInMilliseconds.toLocaleString()} ms`,
		);
	});

	res.on("close", () => {
		const durationInMilliseconds = getDurationInMilliseconds(start);
		console.log(
			`${req.method} ${
				req.originalUrl
			} [CLOSED] ${durationInMilliseconds.toLocaleString()} ms`,
		);
	});

	next();
});

// // Use a function that sends the "currentUser" AND flash "success" and "error" messages through to all routes, so that login/register/logout is shown correctly on all routes
app.use(
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
		next: express.NextFunction,
	) => {
		res.locals.currentUser = undefined;

		const jwt = req.headers.authorization;

		function parseJwt(token) {
			// eslint-disable-next-line no-unneeded-ternary
			// console.log("token in place", token === "undefined" ? false : true);

			if (token === "undefined") {
				return;
			}

			return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
		}

		let idToken: Auth0IDToken | undefined;

		// console.log('jwt in place', jwt);

		if (jwt && jwt !== "" && jwt !== "undefined" && typeof jwt === "string") {
			// idToken = parseJwt(jwt);
			// console.log('jwt:', jwt)
			idToken = JSON.parse(jwt) as unknown as Auth0IDToken;
			// console.log('idToken:', idToken)
			// if (!idToken) {
			//   // console.log("no id token");
			//   res.status(404).send("Invalid token");
			//   return;
			// }
		} else {
			console.log("no jwt");
		}

		if (idToken?.sub) {
			const user = await User.findOne({ externalId: idToken.sub }).exec();
			if (user) {
				req.user = user;
			} else if (idToken?.email) {
				console.log("idToken", idToken);
				// Find any existing user
				const user = await User.findOne({ email: idToken.email }).exec();

				if (user) {
					user.externalId = idToken?.sub;
					await user.save();
					req.user = user;
				} else {
					// Create a new user if none exist
					const newUser = await User.create({
						externalId: idToken.sub,
						email: idToken.email,
						registrationDate: Date.now(),
						isProject: true,
					});

					const savedUser = await newUser.save();

					req.user = savedUser;
				}
			} else {
				// Create a new user if none exist
				const newUser = await User.create({
					externalId: idToken.sub,
					registrationDate: Date.now(),
					isProject: true,
				});

				const savedUser = await newUser.save();

				req.user = savedUser;
			}
		} else {
			console.log("No oidc user");
		}

		if (idToken) {
			req.idToken = idToken;
		}

		if (req.user) {
			res.locals.currentUser = req.user;
		}

		next();
	},
);

// MAKES THE APP ACTUALLY USE THE ROUTES
app.use(indexRoutes);
app.use("", tilesRoutes);
app.use("", parcelRoutes); // THE "" CAN BE CHANGED TO "/parcels FOR SHORTER FILES
app.use("", activityRoutes);
app.use("", projectRoutes);
app.use("", layerRoutes);
app.use("", practiceRoutes);
app.use("", assetRoutes);
app.use("", systemRoutes);
app.use("", systemdesignRoutes);
app.use("", speciesRoutes);
app.use("", flowRoutes);
app.use("", systemflowRoutes);
app.use("", animalRoutes);
app.use("", budgetRoutes);
app.use("", postingRoutes);
app.use("", nurseryRoutes);
app.use("", nurseryproductRoutes);
app.use("", sequenceRoutes);
app.use("", areaRoutes);
app.use("", noteRoutes);
app.use("", soiltestRoutes);
app.use("", saptestRoutes);
app.use("", farmflowRoutes);
app.use("", rotationRoutes);
app.use("", varietyRoutes);
app.use("", stripeRoutes);

// 404 ROUTE
app.get(
	"*",
	async (
		req: express.Request & { user?: IUserSchema },
		res: express.Response,
	) => {
		res.status(404).send("404");
	},
);
app.set("trust proxy", true);

const PORT = process.env.BACKEND_PORT
	? Number.parseInt(process.env.BACKEND_PORT)
	: 3001;
const IP = process.env.BACKEND_IP ?? "127.0.0.1";

app.listen(PORT, IP, () => {
	console.log(`RegenWorks backend server has started on ${IP}:${PORT}`);
});
