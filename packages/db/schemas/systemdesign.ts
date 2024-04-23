import mongoose from "mongoose";
import { ISpeciesSchema } from "./species";

export interface ISystemDesignSchema {
	rows: {
		sequence: {
			species:mongoose.HydratedDocument<ISpeciesSchema> | string;
			spacingAfter: number;
		}[];
		offset?: {
			before?: number;
			after?: number;
		};
		groundcover?: mongoose.HydratedDocument<ISpeciesSchema>;
		width: number;
	}[];
	bearing: number;
	margin: number;
	headland: number;
}

const systemdesignSchema = new mongoose.Schema<ISystemDesignSchema>({
	rows: [
		{
			sequence: [
				{
					species: {
						type: mongoose.Schema.Types.ObjectId,
						ref: "Species",
					},
					spacingAfter: Number,
				},
			],
			offset: {
				before: Number,
				after: Number,
			},
			groundcover: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Species",
			},
			width: Number,
		},
	],
	bearing: { type: Number, default: 0 },
	margin: { type: Number, default: 0 },
	headland: { type: Number, default: 0 },
});

const SystemDesign = mongoose.models?.SystemDesign || mongoose.model("SystemDesign", systemdesignSchema);
export default SystemDesign;
export type SystemDesignDocument = ReturnType<(typeof SystemDesign)["hydrate"]>;
