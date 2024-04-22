import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species";
import type { IUserSchema } from "./user";

export interface ISequenceSchema {
	name: string;
	description: string;
	model: [
		{
			species: mongoose.HydratedDocument<ISpeciesSchema>;
			position: number;
		},
	];
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | string;
	};
	sequencelength: number;
	uniqueSpecies: {
		activities: [
			{
				activityType: string;
				subtype: string;
				name: string;
				time: {
					startMonth: number;
					endMonth: number;
				};
				price: number;
			},
		];
		id: mongoose.HydratedDocument<ISpeciesSchema> | string;
		name: string;
	}[];
}

// SEQUENCE SCHEMA SETUP
const sequenceSchema = new mongoose.Schema<ISequenceSchema>({
	name: String,
	description: String,
	model: [
		{
			species: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Species",
			},
			position: Number,
		},
	],
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	sequencelength: Number,
	uniqueSpecies: [
		{
			name: String,
			id: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Species",
			},
			activities: [
				{
					activityType: String,
					subtype: String,
					name: String,
					time: {
						startMonth: Number,
						endMonth: Number,
					},
					price: { type: Number, default: 0 },
				},
			],
		},
	],
});

const Sequence =
	mongoose.models?.Sequence || mongoose.model("Sequence", sequenceSchema);
export default Sequence;
export type SequenceDocument = ReturnType<(typeof Sequence)["hydrate"]>;
