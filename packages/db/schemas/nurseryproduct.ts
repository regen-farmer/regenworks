import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species.ts";
import type { IUserSchema } from "./user.ts";

export interface INurseryProductSchema {
	name: string;
	variety: string;
	species: mongoose.HydratedDocument<ISpeciesSchema>;
	price: number;
	description: string;
	stock: number;
	class: string;
	pollination: string;
	orderlimit: number;
	rootstock: mongoose.HydratedDocument<ISpeciesSchema>;
	hybrid: mongoose.HydratedDocument<ISpeciesSchema>;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | string;
	};
	availability: boolean;
	season: {
		start: string;
		end: string;
	};
}

// NURSERY PRODUCT SCHEMA SETUP
const nurseryProductSchema = new mongoose.Schema<INurseryProductSchema>({
	name: String,
	variety: String,
	species: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
	},
	price: Number,
	description: String,
	stock: Number,
	class: String,
	pollination: String,
	orderlimit: Number,
	rootstock: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
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
	availability: { type: Boolean, default: false },
	season: {
		start: String,
		end: String,
	},
});

const NurseryProduct =
	mongoose.models?.Nurseryproduct ||
	mongoose.model("Nurseryproduct", nurseryProductSchema);
export default NurseryProduct;
export type NurseryProductDocument = ReturnType<
	(typeof NurseryProduct)["hydrate"]
>;
