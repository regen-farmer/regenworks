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
	counts: { suppliers: number; documents: number; supplierPrices: number; salesPrices: number };
	warnings: string[];
	settings?: { defaultMarginPct?: number; eurDkk?: number };
	suppliers: Record<string, unknown>[];
	documents: Record<string, unknown>[];
	supplierPrices: Record<string, unknown>[];
	salesPrices: Record<string, unknown>[];
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
		},
		warnings: [String],
		settings: { defaultMarginPct: Number, eurDkk: Number },
		suppliers: [mongoose.Schema.Types.Mixed],
		documents: [mongoose.Schema.Types.Mixed],
		supplierPrices: [mongoose.Schema.Types.Mixed],
		salesPrices: [mongoose.Schema.Types.Mixed],
	},
	{ collection: "grove_pricebook_versions" },
);

const PricebookVersion =
	mongoose.models?.PricebookVersion || mongoose.model("PricebookVersion", schema);
export default PricebookVersion;
