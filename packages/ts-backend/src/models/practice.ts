import { model, Schema } from "mongoose";

export interface IPracticesSchema {
	name: string;
	type: string;
	description: string;
	tasks: string;
	regenScores: {
		soilScore: number;
		bioScore: number;
		waterScore: number;
		climateScore: number;
	};
}

// PRACTICE SCHEMA SETUP
const practicesSchema = new Schema<IPracticesSchema>({
	name: String,
	type: String,
	description: String,
	tasks: String,
	regenScores: {
		soilScore: Number,
		bioScore: Number,
		waterScore: Number,
		climateScore: Number,
	},
});

const Practice = model("Practice", practicesSchema);
export default Practice;
export type PracticeDocument = ReturnType<(typeof Practice)["hydrate"]>;
