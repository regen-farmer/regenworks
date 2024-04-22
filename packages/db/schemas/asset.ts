import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species";
import type { IUserSchema } from "./user";

export interface IAssetSchema {
	name: string;
	description: string;
	typeAsset: string;
	amount: number;
	species: mongoose.HydratedDocument<ISpeciesSchema>;
	value: number;
	creation: number;
	determination: number;
	lat: number;
	lng: number;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | string;
	};
}

// ASSET SCHEMA SETUP
const assetSchema = new mongoose.Schema<IAssetSchema>({
	name: String,
	description: String,
	typeAsset: String,
	amount: Number,
	species: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
	},
	value: Number,
	creation: Number,
	determination: Number,
	lat: Number,
	lng: Number,
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
});

const Asset = mongoose.models?.Asset || mongoose.model("Asset", assetSchema);

export default Asset;

export type AssetDocument = ReturnType<(typeof Asset)["hydrate"]>;
