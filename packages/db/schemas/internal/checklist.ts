import mongoose from "mongoose";

/**
 * A checklist on a Grove project, e.g. the screening (B, stage 1). The
 * wording lives in the backend's template; this stores the answers by item
 * key: a state (open, done, not relevant, issue found) and a note. One per
 * project and kind. No money: field users fill it in on projects they are
 * assigned to.
 */
export interface IChecklist {
	project: mongoose.Types.ObjectId;
	kind: string;
	templateVersion: number;
	items: Map<string, { state: string; note?: string; at?: Date; by?: mongoose.Types.ObjectId }>;
	sectionNotes: Map<string, string>;
	decision: { result?: string | null; conditions?: string; at?: Date | null; by?: mongoose.Types.ObjectId | null };
}

const answer = new mongoose.Schema(
	{
		state: { type: String, enum: ["open", "done", "na", "issue"], default: "open" },
		note: { type: String, maxlength: 2000 },
		at: Date,
		by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ _id: false },
);

const schema = new mongoose.Schema<IChecklist>(
	{
		project: { type: mongoose.Schema.Types.ObjectId, ref: "GroveProject", required: true },
		kind: { type: String, required: true, maxlength: 40 },
		templateVersion: { type: Number, default: 1 },
		items: { type: Map, of: answer, default: {} },
		sectionNotes: { type: Map, of: { type: String, maxlength: 3000 }, default: {} },
		decision: {
			result: { type: String, enum: ["go", "go-conditions", "no-go", null], default: null },
			conditions: { type: String, maxlength: 3000 },
			at: Date,
			by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		},
	},
	{ collection: "grove_checklists", timestamps: true },
);
schema.index({ project: 1, kind: 1 }, { unique: true });

const Checklist = mongoose.models?.GroveChecklist || mongoose.model("GroveChecklist", schema);
export default Checklist;
