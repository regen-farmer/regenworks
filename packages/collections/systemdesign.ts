import { model, Schema, HydratedDocument } from "mongoose";
import { ISpeciesSchema } from "./species.js";

export interface ISystemDesignSchema {
	rows: {
		sequence: {
			species: HydratedDocument<ISpeciesSchema> | string;
			spacingAfter: number;
		}[];
		offset?: {
			before?: number;
			after?: number;
		};
		groundcover?: HydratedDocument<ISpeciesSchema>;
		width: number;
	}[];
	bearing: number;
	margin: number;
	headland: number;
}

const systemdesignSchema = new Schema<ISystemDesignSchema>({
	rows: [
		{
			sequence: [
				{
					species: {
						type: Schema.Types.ObjectId,
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
				type: Schema.Types.ObjectId,
				ref: "Species",
			},
			width: Number,
		},
	],
	bearing: { type: Number, default: 0 },
	margin: { type: Number, default: 0 },
	headland: { type: Number, default: 0 },
});

const SystemDesign = model("SystemDesign", systemdesignSchema);
export default SystemDesign;
export type SystemDesignDocument = ReturnType<(typeof SystemDesign)["hydrate"]>;
