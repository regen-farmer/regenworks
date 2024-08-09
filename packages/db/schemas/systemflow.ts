import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species.ts";
import type { ISystemSchema } from "./system.ts";

export interface ISystemflowSchema {
	name: string;
	type: string;
	unit: string;
	timeframe: string;
	location: string;
	data: [
		{
			species: mongoose.HydratedDocument<ISpeciesSchema>;
			data: [number];
		},
	];
	source: string;
	systemref: mongoose.HydratedDocument<ISystemSchema>;
}

// SYSTEM FLOW SCHEMA SETUP
const systemflowSchema = new mongoose.Schema<ISystemflowSchema>({
	name: String,
	type: String,
	unit: String,
	timeframe: String,
	location: String,
	data: [
		{
			species: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Species",
			},
			data: [Number],
		},
	],
	source: String,
	systemref: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "System",
	},
});

const Systemflow =
	mongoose.models?.Systemflow || mongoose.model("Systemflow", systemflowSchema);
export default Systemflow;
export type SystemflowDocument = ReturnType<(typeof Systemflow)["hydrate"]>;
