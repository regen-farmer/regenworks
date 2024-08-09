import mongoose from "mongoose";
import type { ILayerSchema } from "./layer.ts";
import type { ISpeciesSchema } from "./species.ts";
import type { IUserSchema } from "./user.ts";

export interface IActivitySchema {
	_id: string;
	name: string;
	description: string;
	start: {
		date: string;
		time: string;
	};
	end: {
		date: string;
		time: string;
	};
	time: number;
	status: boolean;
	activityType: string;
	subtype: string;
	automated: boolean;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema>;
	};
	layer: mongoose.HydratedDocument<ILayerSchema>;
	species: mongoose.HydratedDocument<ISpeciesSchema>;
}

// ACTIVITY SCHEMA SETUP
const activitySchema = new mongoose.Schema<IActivitySchema>({
	name: String,
	description: String,
	start: {
		date: String,
		time: String,
	},
	end: {
		date: String,
		time: String,
	},
	time: Number,
	status: Boolean,
	activityType: String,
	subtype: String,
	automated: Boolean,
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	layer: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Layer",
	},
	species: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
	},
});

const Activity =
	mongoose.models?.Activity || mongoose.model("Activity", activitySchema);

export default Activity;

export type ActivityDocument = ReturnType<(typeof Activity)["hydrate"]>;
