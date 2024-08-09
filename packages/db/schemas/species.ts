import mongoose from "mongoose";
import type { IFlowSchema } from "./flow.ts";

export interface ISpeciesSchema {
	id: string;
	_id?: string;
	nameCommon: string;
	genus: string;
	species: string;
	family: string;
	origin: string;
	invasive: string;
	temperature: {
		min: number;
		max: number;
	};
	precipitation: {
		min: number;
		max: number;
	};
	cultivation: string;
	form: string;
	management: string;
	stapleCrop: string;
	industrialCrop: string;
	fodder: string;
	classsyntropic: {
		strata: string;
		lifecycle: string;
	};
	lifespan: number;
	height: number;
	width: number;
	flows: [mongoose.HydratedDocument<IFlowSchema>];
	utilities: [string];
	nutrients: {
		fat: number;
		carb: number;
		protein: number;
	};
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
	price: number;
}

// SPECIES SCHEMA SETUP
const speciesSchema = new mongoose.Schema<ISpeciesSchema>({
	nameCommon: String,
	genus: String,
	species: String,
	family: String,
	origin: String,
	invasive: String,
	temperature: {
		min: Number,
		max: Number,
	},
	precipitation: {
		min: Number,
		max: Number,
	},
	cultivation: String,
	form: String,
	management: String,
	stapleCrop: String,
	industrialCrop: String,
	fodder: String,
	classsyntropic: {
		strata: String,
		lifecycle: String,
	},
	lifespan: Number,
	height: Number,
	width: Number,
	flows: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Flow",
		},
	],
	utilities: [String],
	nutrients: {
		fat: Number,
		carb: Number,
		protein: Number,
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
	price: Number,
});

const Species =
	mongoose.models?.Species || mongoose.model("Species", speciesSchema);
export default Species;
export type SpeciesDocument = ReturnType<(typeof Species)["hydrate"]>;
