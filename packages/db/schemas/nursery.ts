import mongoose from "mongoose";
import type { INurseryProductSchema } from "./nurseryproduct.ts";
import type { IUserSchema } from "./user.ts";

export interface INurserySchema {
	name: string;
	location: string;
	currency: string;
	description: string;
	lat: number;
	lng: number;
	range: number;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | string;
	};
	products: [mongoose.HydratedDocument<INurseryProductSchema>];
}

// NURSERY SCHEMA SETUP
const nurserySchema = new mongoose.Schema<INurserySchema>({
	name: String,
	location: String,
	currency: String,
	description: String,
	lat: Number,
	lng: Number,
	range: Number,
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	products: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Nurseryproduct",
		},
	],
});

const Nursery =
	mongoose.models?.Nursery || mongoose.model("Nursery", nurserySchema);
export default Nursery;
export type NurseryDocument = ReturnType<(typeof Nursery)["hydrate"]>;
