import { model, Schema } from "mongoose";

export interface ILogSchema {
	message: string;
	level: string;
	timestamp: number;
}

// LOG SCHEMA SETUP
const logSchema = new Schema<ILogSchema>({
	message: String,
	level: String,
	timestamp: Number,
});

const Log = model("Log", logSchema);
export default Log;
export type LogDocument = ReturnType<(typeof Log)["hydrate"]>;
