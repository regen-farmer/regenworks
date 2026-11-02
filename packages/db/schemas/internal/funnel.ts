import mongoose from "mongoose";

/**
 * A sales funnel in A · Clients & deals: a name and its ordered stages.
 * Stages are plain named boxes; `kind` says whether a deal in it is still
 * open, won or lost. Deals point at a stage by its `key`, so stages can be
 * renamed or reordered later without touching the deals. Grove team only.
 */
export const STAGE_KINDS = ["open", "won", "lost"] as const;

export interface IFunnelStage {
	key: string;
	name: string;
	kind: (typeof STAGE_KINDS)[number];
}

export interface IFunnel {
	key: string;
	name: string;
	description?: string;
	order: number;
	archived: boolean;
	stages: IFunnelStage[];
}

const stage = new mongoose.Schema<IFunnelStage>(
	{
		key: { type: String, required: true, maxlength: 40 },
		name: { type: String, required: true, trim: true, maxlength: 80 },
		kind: { type: String, enum: STAGE_KINDS, default: "open" },
	},
	{ _id: false },
);

const schema = new mongoose.Schema<IFunnel>(
	{
		key: { type: String, required: true, maxlength: 40, unique: true },
		name: { type: String, required: true, trim: true, maxlength: 100 },
		description: { type: String, maxlength: 500 },
		order: { type: Number, default: 0 },
		archived: { type: Boolean, default: false },
		stages: { type: [stage], default: [] },
	},
	{ collection: "grove_funnels", timestamps: true },
);

const Funnel = mongoose.models?.GroveFunnel || mongoose.model("GroveFunnel", schema);
export default Funnel;
