import mongoose from "mongoose";
import type { IActivitySchema } from "./activity.ts";
import type { IFarmFlowSchema } from "./farmflow.ts";
import type { INoteSchema } from "./note.ts";
import type { IRotationSchema } from "./rotation.ts";
import type { IUserSchema } from "./user.ts";

export interface IAreaSchema {
	name: string;
	description: string;
	geometry: string;
	size: number;
	rotation: mongoose.HydratedDocument<IRotationSchema>;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema>;
	};
	activities: mongoose.HydratedDocument<IActivitySchema>[];
	farmflows: mongoose.HydratedDocument<IFarmFlowSchema>[];
	notes: mongoose.HydratedDocument<INoteSchema>[];
}

// AREA SCHEMA SETUP
const areaSchema = new mongoose.Schema<IAreaSchema>({
	name: String,
	description: String,
	geometry: String,
	size: Number,
	rotation: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Rotation",
	},
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	activities: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Activity",
		},
	],
	farmflows: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Farmflow",
		},
	],
	notes: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Note",
		},
	],
});

const Area = mongoose.models?.Area || mongoose.model("Area", areaSchema);

export default Area;

export type AreaDocument = ReturnType<(typeof Area)["hydrate"]>;
