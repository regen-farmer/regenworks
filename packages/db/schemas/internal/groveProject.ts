import mongoose from "mongoose";

/**
 * A Grove project on the dashboard: one client engagement, one of Grove's
 * own sites, or a tree sale. Grove team only (field users see the projects
 * they are assigned to, without money).
 */
export const PROJECT_TYPES = ["client", "own", "tree-sale"] as const;
export const PROJECT_STAGES = ["prospect", "design-offer", "signed", "establishment", "management", "closed"] as const;
export const PROJECT_STATUSES = ["active", "on-hold", "archived"] as const;

export interface IGroveProject {
	name: string;
	type: (typeof PROJECT_TYPES)[number];
	stage: (typeof PROJECT_STAGES)[number];
	/** where in the stage, e.g. "Staking" in establishment */
	step?: string;
	status: (typeof PROJECT_STATUSES)[number];
	client: { name?: string; contactPerson?: string; email?: string; phone?: string };
	farm?: mongoose.Types.ObjectId | null;
	region?: string;
	responsible?: string;
	assignees: mongoose.Types.ObjectId[];
	nextAction: { text?: string; date?: Date | null };
	plantingDate?: Date | null;
	contractEnd?: Date | null;
	plannedHa?: number | null;
	trees?: number | null;
	notes?: string;
	createdBy?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<IGroveProject>(
	{
		name: { type: String, required: true, trim: true, maxlength: 200 },
		type: { type: String, enum: PROJECT_TYPES, default: "client" },
		stage: { type: String, enum: PROJECT_STAGES, default: "prospect" },
		step: { type: String, maxlength: 60 },
		status: { type: String, enum: PROJECT_STATUSES, default: "active" },
		client: {
			name: { type: String, maxlength: 200 },
			contactPerson: { type: String, maxlength: 200 },
			email: { type: String, maxlength: 200 },
			phone: { type: String, maxlength: 50 },
		},
		farm: { type: mongoose.Schema.Types.ObjectId, ref: "Parcel" },
		region: { type: String, maxlength: 100 },
		responsible: { type: String, maxlength: 100 },
		assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
		nextAction: {
			text: { type: String, maxlength: 500 },
			date: Date,
		},
		plantingDate: Date,
		contractEnd: Date,
		plannedHa: { type: Number, min: 0, max: 100000 },
		trees: { type: Number, min: 0, max: 10_000_000 },
		notes: { type: String, maxlength: 5000 },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_projects", timestamps: true },
);

const GroveProject = mongoose.models?.GroveProject || mongoose.model("GroveProject", schema);
export default GroveProject;
