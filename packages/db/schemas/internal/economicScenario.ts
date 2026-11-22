import mongoose from "mongoose";

/**
 * An economic scenario (B · Projects → Economics, Grove team only, 22 Nov 2026): a farm, the fields
 * and the design (scenario) chosen on each, the value chain per crop, establishment and management
 * costs, and what the land does today (crop or grazing, area payments). The cash flow is computed
 * from these with one version of Grove Data's assumptions (`assumptionsVersion`, kept so a result
 * can be reproduced after the assumptions change). Separate from offers and from public users' data.
 */
const band = { low: Number, likely: Number, high: Number };

export interface IEconomicScenario {
	name: string;
	notes?: string;
	farm: mongoose.Types.ObjectId | string;
	groveProject?: mongoose.Types.ObjectId | string | null;
	fields: { layer: mongoose.Types.ObjectId | string; scenario?: mongoose.Types.ObjectId | string | null; plantingYear?: number | null }[];
	horizonYears: number;
	discountRate?: number | null;
	assumptionsVersion?: number | null;
	crops: Record<string, unknown>[];
	establishment: Record<string, number | null>;
	management: Record<string, number | null>;
	baseline: {
		landUse?: string;
		opportunityPerHa?: { low: number; likely: number; high: number } | null;
		organic: boolean;
		paymentsToday: string[];
		paymentsWithTrees?: string[] | null;
	};
	createdBy?: mongoose.Types.ObjectId | string;
	updatedBy?: mongoose.Types.ObjectId | string;
}

const schema = new mongoose.Schema<IEconomicScenario>(
	{
		name: { type: String, required: true, maxlength: 120 },
		notes: { type: String, maxlength: 4000 },
		farm: { type: mongoose.Schema.Types.ObjectId, ref: "Parcel", required: true },
		groveProject: { type: mongoose.Schema.Types.ObjectId, ref: "GroveProject" },
		fields: [
			{
				_id: false,
				layer: { type: mongoose.Schema.Types.ObjectId, ref: "Layer", required: true },
				scenario: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
				plantingYear: Number,
			},
		],
		horizonYears: { type: Number, default: 30, min: 1, max: 60 },
		discountRate: Number,
		assumptionsVersion: Number,
		crops: { type: [mongoose.Schema.Types.Mixed], default: [] },
		establishment: { type: mongoose.Schema.Types.Mixed, default: {} },
		management: { type: mongoose.Schema.Types.Mixed, default: {} },
		baseline: {
			landUse: { type: String, maxlength: 40 },
			opportunityPerHa: band,
			organic: { type: Boolean, default: false },
			paymentsToday: { type: [String], default: [] },
			paymentsWithTrees: { type: [String], default: undefined },
		},
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_economic_scenarios", timestamps: true, minimize: false },
);

const EconomicScenario = mongoose.models?.EconomicScenario || mongoose.model("EconomicScenario", schema);
export default EconomicScenario;
