import mongoose from "mongoose";

/**
 * One tree in a tree register (see treeRegister.ts): ID, position, what was
 * planted, and its current status with the history of every check, so
 * mortality and its causes can be followed per tree, row and field.
 */
export const TREE_STATUSES = ["alive", "weak", "dead", "missing"] as const;

export interface IGroveTree {
	register: mongoose.Types.ObjectId;
	project: mongoose.Types.ObjectId;
	name: string;
	row: number;
	tree: number;
	species: string;
	label: string;
	lon: number;
	lat: number;
	/** where the position comes from: the design, or an as-staked RTK point */
	positionSource: "design" | "rtk";
	status: (typeof TREE_STATUSES)[number];
	cause?: string;
	note?: string;
	checkedAt?: Date | null;
	checkedBy?: mongoose.Types.ObjectId | null;
	replanted: number;
	history: { at: Date; by?: mongoose.Types.ObjectId; status?: string; cause?: string; note?: string; replanted?: boolean }[];
}

const schema = new mongoose.Schema<IGroveTree>(
	{
		register: { type: mongoose.Schema.Types.ObjectId, ref: "GroveTreeRegister", required: true },
		project: { type: mongoose.Schema.Types.ObjectId, ref: "GroveProject", required: true },
		name: { type: String, required: true, maxlength: 40 },
		row: { type: Number, required: true },
		tree: { type: Number, required: true },
		species: { type: String, maxlength: 200 },
		label: { type: String, maxlength: 300 },
		lon: Number,
		lat: Number,
		positionSource: { type: String, enum: ["design", "rtk"], default: "design" },
		status: { type: String, enum: TREE_STATUSES, default: "alive" },
		cause: { type: String, maxlength: 40 },
		note: { type: String, maxlength: 1000 },
		checkedAt: Date,
		checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		replanted: { type: Number, default: 0 },
		history: [
			new mongoose.Schema(
				{
					at: Date,
					by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
					status: String,
					cause: String,
					note: String,
					replanted: Boolean,
				},
				{ _id: false },
			),
		],
	},
	{ collection: "grove_trees", timestamps: true },
);
schema.index({ register: 1, name: 1 }, { unique: true });
schema.index({ register: 1, row: 1, tree: 1 });
schema.index({ project: 1 });

const GroveTree = mongoose.models?.GroveTree || mongoose.model("GroveTree", schema);
export default GroveTree;
