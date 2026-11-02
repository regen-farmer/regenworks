import mongoose from "mongoose";

/**
 * A tree register: every tree of one designed field on a Grove project, with
 * its ID (<prefix>R<row>T<tree>, the same names as the RTK stake-out files),
 * its position and what was planted. Made from the design; as-staked RTK
 * positions can replace the design positions later. The trees themselves are
 * in grove_trees. No money: field users log trees on projects assigned to them.
 */
export interface ITreeRegister {
	project: mongoose.Types.ObjectId;
	/** the design scenario (Project) it was made from */
	design: mongoose.Types.ObjectId;
	name: string;
	prefix: string;
	trees: number;
	rows: number;
	/** when each row was last walked and checked: { "3": { at, by } } */
	rowChecks: Map<string, { at: Date; by?: mongoose.Types.ObjectId }>;
	createdBy?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<ITreeRegister>(
	{
		project: { type: mongoose.Schema.Types.ObjectId, ref: "GroveProject", required: true },
		design: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
		name: { type: String, required: true, maxlength: 200 },
		prefix: { type: String, maxlength: 8, default: "" },
		trees: { type: Number, default: 0 },
		rows: { type: Number, default: 0 },
		rowChecks: {
			type: Map,
			of: new mongoose.Schema({ at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" } }, { _id: false }),
			default: {},
		},
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_tree_registers", timestamps: true },
);
// one register per design on a project; tree names must not clash within a project
schema.index({ project: 1, design: 1 }, { unique: true });
schema.index({ project: 1, prefix: 1 }, { unique: true });

const TreeRegister = mongoose.models?.GroveTreeRegister || mongoose.model("GroveTreeRegister", schema);
export default TreeRegister;
