import mongoose from "mongoose";
import type { IAreaSchema } from "./area.ts";
import type { IAssetSchema } from "./asset.ts";
import type { IBudgetSchema } from "./budget.ts";
import type { IProjectSchema } from "./project.ts";
import type { IRowSchema } from "./row.ts";
import type { ISaptestSchema } from "./saptest.ts";
import type { ISoiltestSchema } from "./soiltest.ts";
import type { ISystemSchema } from "./system.ts";
import type { IUserSchema } from "./user.ts";

export interface ILayerSchema {
	name: string;
	description: string;
	type: string;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | string;
	};
	climate: {
		monthlyaveragetemp: {
			january: number;
			february: number;
			march: number;
			april: number;
			may: number;
			june: number;
			july: number;
			august: number;
			september: number;
			october: number;
			november: number;
			december: number;
		};
		annualaverageprec: number;
		monthlyaverageprec: {
			january: number;
			february: number;
			march: number;
			april: number;
			may: number;
			june: number;
			july: number;
			august: number;
			september: number;
			october: number;
			november: number;
			december: number;
		};
	};
	geometry: string;
	lat: number;
	lng: number;
	size: number;
	systems: {
		past: [mongoose.HydratedDocument<ISystemSchema>];
		present: mongoose.HydratedDocument<ISystemSchema>;
		future: [mongoose.HydratedDocument<ISystemSchema>];
	};
	projects: [mongoose.HydratedDocument<IProjectSchema>];
	assets: [mongoose.HydratedDocument<IAssetSchema>];
	alignment: string;
	layout: string;
	headland: number;
	rows: mongoose.HydratedDocument<IRowSchema>[];
	areas: [mongoose.HydratedDocument<IAreaSchema>];
	soiltests: [mongoose.HydratedDocument<ISoiltestSchema>];
	saptests: [mongoose.HydratedDocument<ISaptestSchema>];
	accounts: mongoose.HydratedDocument<IBudgetSchema>;
}

// LAYER SCHEMA SETUP
const layerSchema = new mongoose.Schema<ILayerSchema>({
	name: String,
	description: String,
	type: String,
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	climate: {
		monthlyaveragetemp: {
			january: Number,
			february: Number,
			march: Number,
			april: Number,
			may: Number,
			june: Number,
			july: Number,
			august: Number,
			september: Number,
			october: Number,
			november: Number,
			december: Number,
		},
		annualaverageprec: Number,
		monthlyaverageprec: {
			january: Number,
			february: Number,
			march: Number,
			april: Number,
			may: Number,
			june: Number,
			july: Number,
			august: Number,
			september: Number,
			october: Number,
			november: Number,
			december: Number,
		},
	},
	geometry: String,
	lat: Number,
	lng: Number,
	size: Number,
	systems: {
		past: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "System",
			},
		],
		present: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "System",
		},
		future: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "System",
			},
		],
	},
	projects: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Project",
		},
	],
	assets: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Asset",
		},
	],
	alignment: String,
	layout: String,
	headland: Number,
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
	soiltests: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Soiltest",
		},
	],
	saptests: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Saptest",
		},
	],
	accounts: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Budget",
	},
});

const Layer = mongoose.models?.Layer || mongoose.model("Layer", layerSchema);
export default Layer;
export type LayerDocument = ReturnType<(typeof Layer)["hydrate"]>;
