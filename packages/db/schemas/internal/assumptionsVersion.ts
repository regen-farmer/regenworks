import mongoose from "mongoose";

/**
 * One imported version of Grove Data's economic assumptions (grove-data `assumptions/`):
 * yield, price and cost ranges, area payments and the fruit/berry supplement rules.
 * Stored whole, so an economic scenario computed with version N can always be explained.
 * Grove team only; see backend/src/internal/economicsRoutes.ts.
 */
export interface IAssumptionsVersion {
	version: number;
	importedAt: Date;
	importedBy?: mongoose.Types.ObjectId | string;
	note?: string;
	counts: { ranges: number; payments: number; fruitBerry: number; crops: number; sources: number };
	warnings: string[];
	ranges: Record<string, unknown>[];
	payments: Record<string, unknown>[];
	fruitBerry: Record<string, unknown>[];
	crops: Record<string, unknown>[];
	sources: Record<string, unknown>[];
}

const schema = new mongoose.Schema<IAssumptionsVersion>(
	{
		version: { type: Number, required: true, unique: true },
		importedAt: { type: Date, default: Date.now },
		importedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		note: { type: String, maxlength: 500 },
		counts: { ranges: Number, payments: Number, fruitBerry: Number, crops: Number, sources: Number },
		warnings: [String],
		ranges: [mongoose.Schema.Types.Mixed],
		payments: [mongoose.Schema.Types.Mixed],
		fruitBerry: [mongoose.Schema.Types.Mixed],
		crops: [mongoose.Schema.Types.Mixed],
		sources: [mongoose.Schema.Types.Mixed],
	},
	{ collection: "grove_assumption_versions" },
);

const AssumptionsVersion = mongoose.models?.AssumptionsVersion || mongoose.model("AssumptionsVersion", schema);
export default AssumptionsVersion;
