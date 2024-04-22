import { model, Schema, HydratedDocument } from "mongoose";
import { ISpeciesSchema } from "./species.js";
import { IUserSchema } from "./user.js";

export interface IVarietySchema {
	name: string;
	species: HydratedDocument<ISpeciesSchema>;
	price: number;
	description: string;
	class: string;
	pollination: string;
	rootstock: {
		name: string;
		species: HydratedDocument<ISpeciesSchema>;
	};
	hybrid: HydratedDocument<ISpeciesSchema>;
	owner: {
		id: HydratedDocument<IUserSchema> | string;
	};
}

// VARIETY SCHEMA SETUP
const varietySchema = new Schema<IVarietySchema>({
	name: String,
	species: {
		type: Schema.Types.ObjectId,
		ref: "Species",
	},
	price: Number,
	description: String,
	class: String,
	pollination: String,
	rootstock: {
		name: String,
		species: {
			type: Schema.Types.ObjectId,
			ref: "Species",
		},
	},
	hybrid: {
		type: Schema.Types.ObjectId,
		ref: "Species",
	},
	owner: {
		id: {
			type: Schema.Types.ObjectId,
			ref: "User",
		},
	},
});

const Variety = model("Variety", varietySchema);
export default Variety;
export type VarietyDocument = ReturnType<(typeof Variety)["hydrate"]>;
