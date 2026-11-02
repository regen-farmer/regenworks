import mongoose from "mongoose";

/**
 * A deal: one thing we try to sell to one client, moving through the stages
 * of one funnel. The main record of A · Clients & deals. A re-purchase is a
 * new deal on the same client. Grove team only (holds money and contacts).
 */
export const DEAL_STATUSES = ["open", "won", "lost"] as const;

export interface IDealMove {
	stage: string;
	funnel?: mongoose.Types.ObjectId;
	status: (typeof DEAL_STATUSES)[number];
	at: Date;
	by?: mongoose.Types.ObjectId | null;
	note?: string;
}

export interface IDeal {
	title: string;
	client: mongoose.Types.ObjectId;
	funnel: mongoose.Types.ObjectId;
	stage: string;
	status: (typeof DEAL_STATUSES)[number];
	position: number;
	value?: number | null;
	expectedClose?: Date | null;
	owner?: mongoose.Types.ObjectId | null;
	source?: string;
	nextAction: { text?: string; date?: Date | null };
	farm?: mongoose.Types.ObjectId | null;
	groveProject?: mongoose.Types.ObjectId | null;
	/** Dashboard project this deal was imported from (one deal per project). */
	importedFrom?: mongoose.Types.ObjectId | null;
	lostReason?: string;
	wonAt?: Date | null;
	lostAt?: Date | null;
	archived: boolean;
	notes?: string;
	history: IDealMove[];
	createdBy?: mongoose.Types.ObjectId;
}

const move = new mongoose.Schema<IDealMove>(
	{
		stage: { type: String, maxlength: 40 },
		funnel: { type: mongoose.Schema.Types.ObjectId, ref: "GroveFunnel" },
		status: { type: String, enum: DEAL_STATUSES },
		at: { type: Date, default: Date.now },
		by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		note: { type: String, maxlength: 200 },
	},
	{ _id: false },
);

const schema = new mongoose.Schema<IDeal>(
	{
		title: { type: String, required: true, trim: true, maxlength: 200 },
		client: { type: mongoose.Schema.Types.ObjectId, ref: "GroveClient", required: true },
		funnel: { type: mongoose.Schema.Types.ObjectId, ref: "GroveFunnel", required: true },
		stage: { type: String, required: true, maxlength: 40 },
		status: { type: String, enum: DEAL_STATUSES, default: "open" },
		position: { type: Number, default: 0 },
		value: { type: Number, min: 0, max: 1_000_000_000 },
		expectedClose: Date,
		owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		source: { type: String, maxlength: 100 },
		nextAction: {
			text: { type: String, maxlength: 500 },
			date: Date,
		},
		farm: { type: mongoose.Schema.Types.ObjectId, ref: "Parcel" },
		groveProject: { type: mongoose.Schema.Types.ObjectId, ref: "GroveProject" },
		importedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "GroveProject", unique: true, sparse: true },
		lostReason: { type: String, maxlength: 500 },
		wonAt: Date,
		lostAt: Date,
		archived: { type: Boolean, default: false },
		notes: { type: String, maxlength: 5000 },
		history: { type: [move], default: [] },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_deals", timestamps: true },
);
schema.index({ funnel: 1, archived: 1, stage: 1, position: 1 });
schema.index({ client: 1 });
schema.index({ groveProject: 1 });

const Deal = mongoose.models?.GroveDeal || mongoose.model("GroveDeal", schema);
export default Deal;
