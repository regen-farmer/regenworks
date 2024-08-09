import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species.ts";
import type { IUserSchema } from "./user.ts";

export interface IRotationSchema {
	name: string;
	description: string;
	model: [
		{
			speciesmix: [
				{
					species: mongoose.HydratedDocument<ISpeciesSchema>;
					amount: number;
				},
			];
			planting: {
				year: number;
				month: number;
			};
			harvest: {
				year: number;
				month: number;
			};
		},
	];
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | string;
	};
}

// ROTATION SCHEMA SETUP
const rotationSchema = new mongoose.Schema<IRotationSchema>({
	name: String,
	description: String,
	model: [
		{
			speciesmix: [
				{
					species: {
						type: mongoose.Schema.Types.ObjectId,
						ref: "Species",
					},
					amount: Number,
				},
			],
			planting: {
				year: Number,
				month: Number,
			},
			harvest: {
				year: Number,
				month: Number,
			},
		},
	],
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
});

const Rotation =
	mongoose.models?.Rotation || mongoose.model("Rotation", rotationSchema);
export default Rotation;
export type RotationDocument = ReturnType<(typeof Rotation)["hydrate"]>;
