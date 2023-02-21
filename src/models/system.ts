import { Document, model, Schema } from 'mongoose';
import { IAnimalSchema } from './animal';
import { ISequenceSchema } from './sequence';
import { ISpeciesSchema } from './species';
import { ISystemflowSchema } from './systemflow';
import { IUserSchema } from './user';

// SYSTEM SCHEMA SETUP

export interface ISystemSchema extends Document {
	name: string;
	description: string;
	rows: [{ width: number; sequense: [ISequenceSchema] }];
	model: [
		{
			species: ISpeciesSchema;
			position: number[];
			width: number;
		},
	];
	animals: [IAnimalSchema];
	owner: {
		id: IUserSchema;
	};
	shared: boolean;
	flows: [ISystemflowSchema];
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
		],
		id: ISpeciesSchema | string,
		name: string
	}[],
	uniqueUtilities: string[];
}

const systemSchema = new Schema<ISystemSchema>({
	name: String,
	description: String,
	rows: [
		{
			width: Number,
			sequense: [
				{
					type: Schema.Types.ObjectId,
					ref: "Species",
				},
			],
		},
	],
	model: [
		{
			species: {
				type: Schema.Types.ObjectId,
				ref: "Species",
			},
			position: [Number],
			width: Number,
		},
	],
	animals: [
		{
			type: Schema.Types.ObjectId,
			ref: "Animal",
		},
	],
	owner: {
		id: {
			type: Schema.Types.ObjectId,
			ref: "User",
		},
	},
	shared: {
		type: Boolean,
		default: false,
	},
	flows: [
		{
			type: Schema.Types.ObjectId,
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
	uniqueSpecies: [{
		name: String,
		id: {
			type: Schema.Types.ObjectId,
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
	}],
	uniqueUtilities: [String],
});

export default model('System', systemSchema);
