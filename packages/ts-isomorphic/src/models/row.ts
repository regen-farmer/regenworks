import mongoose from "mongoose";
import type { IActivitySchema } from "./activity";
import type { IAssetSchema } from "./asset";
import type { IFarmFlowSchema } from "./farmflow";
import type { INoteSchema } from "./note";
import type { ISequenceSchema } from "./sequence";

export interface IRowSchema {
	geometry: string;
	sequence: mongoose.HydratedDocument<ISequenceSchema>;
	name: string;
	assets: [mongoose.HydratedDocument<IAssetSchema>];
	activities: [mongoose.HydratedDocument<IActivitySchema>];
	farmflows: [mongoose.HydratedDocument<IFarmFlowSchema>];
	notes: [mongoose.HydratedDocument<INoteSchema>];
	rowlength: number;
}

// ROW SCHEMA SETUP
const rowSchema = new mongoose.Schema<IRowSchema>({
	geometry: String,
	sequence: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Sequence",
	},
	name: String,
	assets: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Asset",
		},
	],
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
	rowlength: Number,
});

const Row = mongoose.models?.Row || mongoose.model("Row", rowSchema);
export default Row;
export type RowDocument = ReturnType<(typeof Row)["hydrate"]>;
