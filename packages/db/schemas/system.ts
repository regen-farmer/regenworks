import mongoose from "mongoose";
import type { AnimalDocument } from "./animal";
import type { ISequenceSchema } from "./sequence";
import type { ISpeciesSchema } from "./species";
import type { ISystemflowSchema } from "./systemflow";
import type { IUserSchema } from "./user";

// SYSTEM SCHEMA SETUP

export interface ISystemSchema {
	name: string;
	description: string;
	rows: [
		{ width: number; sequense: [mongoose.HydratedDocument<ISequenceSchema>] },
	];
	model: [
		{
			species: mongoose.HydratedDocument<ISpeciesSchema>;
			position: number[];
			width: number;
		},
	];
	animals: [mongoose.HydratedDocument<AnimalDocument>];
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | string;
	};
	shared: boolean;
	flows: [mongoose.HydratedDocument<ISystemflowSchema>];
	occurrences: [
		{
			name: string;
			lat: number;
			lng: number;
			alt: number;
			country: string;
			source: string;
			eco: number;
			koppen: string;
		},
	];
	grid: number;
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
	uniqueUtilities: string[];
}

const systemSchema = new mongoose.Schema<ISystemSchema>({
	name: String,
	description: String,
	rows: [
		{
			width: Number,
			sequense: [
				{
					type: mongoose.Schema.Types.ObjectId,
					ref: "Species",
				},
			],
		},
	],
	model: [
		{
			species: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Species",
			},
			position: [Number],
			width: Number,
		},
	],
	animals: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Animal",
		},
	],
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	shared: {
		type: Boolean,
		default: false,
	},
	flows: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Systemflow",
		},
	],
	occurrences: [
		{
			name: String,
			lat: Number,
			lng: Number,
			alt: Number,
			country: String,
			source: String,
			eco: Number,
			koppen: String,
		},
	],
	grid: Number,
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
	uniqueUtilities: [String],
});

const System =
	mongoose.models?.System || mongoose.model("System", systemSchema);
export default System;
export type SystemDocument = ReturnType<(typeof System)["hydrate"]>;
