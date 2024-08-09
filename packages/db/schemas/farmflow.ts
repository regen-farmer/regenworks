import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species.ts";

export interface IFarmFlowSchema {
	name: string;
	description: string;
	type: string;
	unit: string;
	timeframe: string;
	source: string;
	timestamp: Date;
	amount: number;
	species: mongoose.HydratedDocument<ISpeciesSchema>;
}

// FLOW SCHEMA SETUP
const farmflowSchema = new mongoose.Schema<IFarmFlowSchema>({
	name: String,
	description: String,
	type: String,
	unit: String,
	timeframe: String,
	source: String,
	timestamp: Date,
	amount: Number,
	species: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
	},
});

const FarmFlow =
	mongoose.models?.Farmflow || mongoose.model("Farmflow", farmflowSchema);
export default FarmFlow;
export type FarmFlowDocument = ReturnType<(typeof FarmFlow)["hydrate"]>;
