import mongoose, { type Document, model } from "mongoose";

export interface IFinancialModelSchema {
	// Core relationships
	farmScenarioConfig: mongoose.Schema.Types.ObjectId | string;
	user: mongoose.Schema.Types.ObjectId | string;

	// Model identification
	name: string;

	// Financial parameters
	parameters: {
		period: number; // projection years
		currency: string; // e.g., "EUR", "USD"
	};

	// Species-level pricing configuration (costs default from species activities, but can be overridden)
	// "Unit" refers to trees (count) or ground cover (m2) depending on species type
	speciesPricing: Array<{
		species: mongoose.Schema.Types.ObjectId | string;
		establishmentCostPerUnit?: number; // override for establishment cost (defaults to species activities)
		managementCostPerUnitPerYear?: number; // override for annual management cost (defaults to species activities)
		incomePerUnit: number; // expected income per unit (tree or m2) per year at maturity
	}>;

	// Timestamps
	createdAt?: Date;
	updatedAt?: Date;
}

export type FinancialModelDocument = IFinancialModelSchema & Document;

const financialModelSchema = new mongoose.Schema<FinancialModelDocument>(
	{
		farmScenarioConfig: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "FarmScenarioConfig",
			required: true,
			index: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
			default: "Default Model",
		},
		parameters: {
			period: {
				type: Number,
				default: 20,
				min: 1,
				max: 100,
			},
			currency: {
				type: String,
				default: "EUR",
				trim: true,
			},
		},
		speciesPricing: [
			{
				species: {
					type: mongoose.Schema.Types.ObjectId,
					ref: "Species",
					required: true,
				},
				establishmentCostPerUnit: {
					type: Number,
					default: undefined, // undefined means use species default
					min: 0,
				},
				managementCostPerUnitPerYear: {
					type: Number,
					default: undefined, // undefined means use species default
					min: 0,
				},
				incomePerUnit: {
					type: Number,
					default: 0,
					min: 0,
				},
			},
		],
	},
	{
		timestamps: true,
	},
);

// Compound index for farm scenario config and user
financialModelSchema.index({ farmScenarioConfig: 1, user: 1 });

// Ensure unique name per farm scenario config
financialModelSchema.index(
	{ farmScenarioConfig: 1, name: 1 },
	{ unique: true },
);

export const FinancialModel = model<FinancialModelDocument>(
	"FinancialModel",
	financialModelSchema,
);

export default FinancialModel;
