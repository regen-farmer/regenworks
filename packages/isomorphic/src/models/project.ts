import mongoose from "mongoose";
import type { IActivitySchema } from "./activity";
import type { IAreaSchema } from "./area";
import type { IAssetSchema } from "./asset";
import type { IBudgetSchema } from "./budget";
import type { ILayerSchema } from "./layer";
import type { IRowSchema } from "./row";
import type { ISystemSchema } from "./system";
import type { IUserSchema } from "./user";
import type { ISystemDesignSchema } from "./systemdesign";

export interface IProjectSchema {
	name: string;
	description: string;
	location: string;
	lat: number;
	lng: number;
	assets: [mongoose.HydratedDocument<IAssetSchema>];
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | string;
	};
	layer: mongoose.HydratedDocument<ILayerSchema>;
	activities: mongoose.HydratedDocument<IActivitySchema>[];
	system: mongoose.HydratedDocument<ISystemSchema>;
	systemdesign: mongoose.HydratedDocument<ISystemDesignSchema>;
	edgesystem: mongoose.HydratedDocument<ISystemSchema>;
	budgets: {
		establishment: mongoose.HydratedDocument<IBudgetSchema>;
		management: mongoose.HydratedDocument<IBudgetSchema>;
	};
	financial: {
		discountRate: number;
		period: number;
	};
	layout: string;
	alignment: string;
	bearing: number;
	headland: number;
	bearingline: string;
	status: string;
	rows: mongoose.HydratedDocument<IRowSchema>[];
	areas: [mongoose.HydratedDocument<IAreaSchema>];
	isPublic: boolean;
}

// PROJECT SCHEMA SETUP
const projectSchema = new mongoose.Schema<IProjectSchema>({
	name: String,
	description: String,
	location: String,
	lat: Number,
	lng: Number,
	assets: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Asset",
		},
	],
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
	activities: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Activity",
		},
	],
	system: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "System",
	},
	systemdesign: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "SystemDesign",
	},
	edgesystem: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "System",
	},
	budgets: {
		establishment: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Budget",
		},
		management: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Budget",
		},
	},
	financial: {
		discountRate: Number,
		period: Number,
	},
	layout: { type: String, default: "straight" },
	alignment: { type: String, default: "north" },
	bearing: { type: Number, default: 0 },
	headland: { type: Number, default: 0 },
	bearingline: String,
	status: String,
	rows: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Row",
		},
	],
	areas: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Area",
		},
	],
	isPublic: { type: Boolean, default: false },
});

const Project =
	mongoose.models?.Project || mongoose.model("Project", projectSchema);
export default Project;
export type ProjectDocument = ReturnType<(typeof Project)["hydrate"]>;
