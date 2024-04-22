import mongoose from "mongoose";

export interface IFlowSchema {
	name: string;
	type: string;
	unit: string;
	timeframe: string;
	data: number[];
	source: string;
}

// FLOW SCHEMA SETUP
const flowSchema = new mongoose.Schema<IFlowSchema>({
	name: String,
	type: String,
	unit: String,
	timeframe: String,
	data: [Number],
	source: String,
});

const Flow = mongoose.models?.Flow || mongoose.model("Flow", flowSchema);
export default Flow;
export type FlowDocument = ReturnType<(typeof Flow)["hydrate"]>;
