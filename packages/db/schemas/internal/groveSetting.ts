import mongoose from "mongoose";

/**
 * Grove-internal settings kept in the database (not in the public code),
 * e.g. the scorecard targets. One document per key. Grove team only.
 */
export interface IGroveSetting {
	key: string;
	value: Record<string, unknown>;
	updatedBy?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<IGroveSetting>(
	{
		key: { type: String, required: true, unique: true, maxlength: 60 },
		value: { type: mongoose.Schema.Types.Mixed, default: {} },
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_settings", timestamps: true, minimize: false },
);

const GroveSetting = mongoose.models?.GroveSetting || mongoose.model("GroveSetting", schema);
export default GroveSetting;
