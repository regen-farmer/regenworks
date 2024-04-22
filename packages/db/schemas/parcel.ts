import mongoose from "mongoose";
import type { ILayerSchema } from "./layer";
import type { IPracticesSchema } from "./practice";
import type { IProjectSchema } from "./project";
import type { IUserSchema } from "./user";

export interface IParcelSchema {
	name: string;
	agType: [
		{
			type: string;
		},
	];
	description: string;
	soilType: string;
	size: number;
	location: string;
	lat: number;
	lng: number;
	geometry: string;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema>;
	};
	practices: [mongoose.HydratedDocument<IPracticesSchema>];
	layers: [mongoose.HydratedDocument<ILayerSchema>];
	projects: [mongoose.HydratedDocument<IProjectSchema>];
	climate: {
		monthlyaveragetemp: {
			january: number;
			february: number;
			march: number;
			april: number;
			may: number;
			june: number;
			july: number;
			august: number;
			september: number;
			october: number;
			november: number;
			december: number;
		};
		annualaverageprec: number;
		monthlyaverageprec: {
			january: number;
			february: number;
			march: number;
			april: number;
			may: number;
			june: number;
			july: number;
			august: number;
			september: number;
			october: number;
			november: number;
			december: number;
		};
		hardiness: {
			low: number;
			high: number;
		};
	};
	measurement: string;
}

// PARCEL SCHEMA SETUP
const parcelSchema = new mongoose.Schema<IParcelSchema>({
	name: String,
	agType: [
		{
			type: String,
		},
	],
	description: String,
	soilType: String,
	size: Number,
	location: String,
	lat: Number,
	lng: Number,
	geometry: String,
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
	practices: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Practice",
		},
	],
	layers: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Layer",
		},
	],
	projects: [
		{
			type: mongoose.Schema.Types.ObjectId,
			ref: "Project",
		},
	],
	climate: {
		monthlyaveragetemp: {
			january: Number,
			february: Number,
			march: Number,
			april: Number,
			may: Number,
			june: Number,
			july: Number,
			august: Number,
			september: Number,
			october: Number,
			november: Number,
			december: Number,
		},
		annualaverageprec: Number,
		monthlyaverageprec: {
			january: Number,
			february: Number,
			march: Number,
			april: Number,
			may: Number,
			june: Number,
			july: Number,
			august: Number,
			september: Number,
			october: Number,
			november: Number,
			december: Number,
		},
		hardiness: {
			low: Number,
			high: Number,
		},
	},
	measurement: String,
});

const Parcel =
	mongoose.models?.Parcel || mongoose.model("Parcel", parcelSchema);
export default Parcel;
export type ParcelDocument = ReturnType<(typeof Parcel)["hydrate"]>;
