import mongoose from "mongoose";
import type { IUserSchema } from "./schemas/user";

export interface IWellSchema {
	name: string;
	description: string;
	geometry: string;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema>;
	};
}

// WELL SCHEMA SETUP
const wellSchema = new mongoose.Schema<IWellSchema>({
	name: String,
	description: String,
	geometry: String,
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
});

const Well = mongoose.models?.Well || mongoose.model("Well", wellSchema);
export default Well;
export type WellDocument = ReturnType<(typeof Well)["hydrate"]>;
