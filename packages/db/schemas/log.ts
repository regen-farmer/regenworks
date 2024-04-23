import mongoose from "mongoose";

export interface ILogSchema {
	message: string;
	level: string;
	timestamp: number;
}

// LOG SCHEMA SETUP
const logSchema = new mongoose.Schema<ILogSchema>({
	message: String,
	level: String,
	timestamp: Number,
});

const Log = mongoose.models?.Log || mongoose.model("Log", logSchema);
export default Log;
export type LogDocument = ReturnType<(typeof Log)["hydrate"]>;
