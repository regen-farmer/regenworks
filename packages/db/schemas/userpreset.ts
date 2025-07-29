import mongoose from "mongoose";
import type { ISystemDesignSchema } from "./systemdesign.ts";
import type { IUserSchema } from "./user.ts";

export interface IUserPresetSchema {
	_id?: string;
	owner: mongoose.HydratedDocument<IUserSchema> | string;
	name: string;
	description: string;
	systemDesign: ISystemDesignSchema;
	thumbnail?: string; // Optional base64 or URL for custom thumbnail
	isPublic: boolean; // Whether this preset can be shared with others
	createdAt: Date;
	updatedAt: Date;
}

const userPresetSchema = new mongoose.Schema<IUserPresetSchema>({
	owner: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true,
	},
	name: {
		type: String,
		required: true,
		trim: true,
	},
	description: {
		type: String,
		required: true,
		trim: true,
	},
	systemDesign: {
		rows: [
			{
				sequence: [
					{
						species: {
							type: mongoose.Schema.Types.ObjectId,
							ref: "Species",
						},
						spacingAfter: Number,
					},
				],
				offset: {
					before: Number,
					after: Number,
				},
				groundcover: {
					type: mongoose.Schema.Types.ObjectId,
					ref: "Species",
				},
				width: Number,
			},
		],
		bearing: { type: Number, default: 0 },
		margin: { type: Number, default: 0 },
		headland: { type: Number, default: 0 },
	},
	thumbnail: {
		type: String,
		required: false,
	},
	isPublic: {
		type: Boolean,
		default: false,
	},
}, {
	timestamps: true, // Automatically adds createdAt and updatedAt
});

// Index for efficient queries
userPresetSchema.index({ owner: 1, createdAt: -1 });

const UserPreset = mongoose.models?.UserPreset || mongoose.model("UserPreset", userPresetSchema);
export default UserPreset;
export type UserPresetDocument = ReturnType<(typeof UserPreset)["hydrate"]>;