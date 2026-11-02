import mongoose from "mongoose";

/**
 * One imported version of Grove's private pricebook (Grove team only).
 * Stored whole, so an offer priced with version N can always be explained.
 * Never returned by public routes; see backend/src/internal/.
 */
export interface IPricebookVersion {
	version: number;
	importedAt: Date;
	importedBy: mongoose.Types.ObjectId | string;
	note?: string;
	counts: { suppliers: number; documents: number; supplierPrices: number; salesPrices: number; services?: number };
	warnings: string[];
	settings?: { defaultMarginPct?: number; eurDkk?: number; targetMarginTrees?: number; targetMarginServices?: number; guaranteeTextDa?: string };
	suppliers: Record<string, unknown>[];
	documents: Record<string, unknown>[];
	supplierPrices: Record<string, unknown>[];
	salesPrices: Record<string, unknown>[];
	services?: Record<string, unknown>[];
}

const schema = new mongoose.Schema<IPricebookVersion>(
	{
		version: { type: Number, required: true, unique: true },
		importedAt: { type: Date, default: Date.now },
		importedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		note: { type: String, maxlength: 500 },
		counts: {
			suppliers: Number,
			documents: Number,
			supplierPrices: Number,
			salesPrices: Number,
			services: Number,
		},
		warnings: [String],
		settings: { defaultMarginPct: Number, eurDkk: Number, targetMarginTrees: Number, targetMarginServices: Number, guaranteeTextDa: { type: String, maxlength: 3000 } },
		suppliers: [mongoose.Schema.Types.Mixed],
		documents: [mongoose.Schema.Types.Mixed],
		supplierPrices: [mongoose.Schema.Types.Mixed],
		salesPrices: [mongoose.Schema.Types.Mixed],
		services: { type: [mongoose.Schema.Types.Mixed], default: [] },
	},
	{ collection: "grove_pricebook_versions" },
);

const PricebookVersion =
	mongoose.models?.PricebookVersion || mongoose.model("PricebookVersion", schema);
export default PricebookVersion;
