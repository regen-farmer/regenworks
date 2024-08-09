import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species.ts";
import type { IUserSchema } from "./user.ts";

export interface IVarietySchema {
	name: string;
	species: mongoose.HydratedDocument<ISpeciesSchema>;
	price: number;
	description: string;
	class: string;
	pollination: string;
	rootstock: {
		name: string;
		species: mongoose.HydratedDocument<ISpeciesSchema>;
	};
	hybrid: mongoose.HydratedDocument<ISpeciesSchema>;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | string;
	};
}

// VARIETY SCHEMA SETUP
const varietySchema = new mongoose.Schema<IVarietySchema>({
	name: String,
	species: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
	},
	price: Number,
	description: String,
	class: String,
	pollination: String,
	rootstock: {
		name: String,
		species: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Species",
		},
	},
	hybrid: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
	},
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
});

const Variety =
	mongoose.models?.Variety || mongoose.model("Variety", varietySchema);
export default Variety;
export type VarietyDocument = ReturnType<(typeof Variety)["hydrate"]>;
