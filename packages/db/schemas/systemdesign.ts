import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species.ts";

/**
 * One position in a row's repeating tree sequence: the plant to put there.
 *
 * Species is what the layout engine needs and stays required. Cultivar
 * (`variety`), rootstock and organic describe the actual plant and are
 * optional; blank means "not decided yet". `ownRoots: true` says on purpose
 * that there is no rootstock (own-rooted or seedling). A cultivar must belong
 * to the entry's species or hybrid group; a rootstock can be any species.
 */
export interface ISequenceEntry {
	species: mongoose.HydratedDocument<ISpeciesSchema> | string;
	spacingAfter: number;
	variety?: string | null;
	rootstock?: string | null;
	ownRoots?: boolean | null;
	organic?: boolean | null;
}

/** Mongoose fields for a sequence entry; shared with saved presets. */
export const sequenceEntryFields = {
	species: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
	},
	spacingAfter: Number,
	variety: { type: mongoose.Schema.Types.ObjectId, ref: "Variety" },
	rootstock: { type: mongoose.Schema.Types.ObjectId, ref: "Rootstock" },
	ownRoots: Boolean,
	organic: Boolean,
};

export interface ISystemDesignSchema {
	rows: {
		sequence: ISequenceEntry[];
		offset?: {
			before?: number;
			after?: number;
		};
		groundcover?: mongoose.HydratedDocument<ISpeciesSchema>;
		width: number;
	}[];
	bearing: number;
	margin: number;
	headland: number;
}

const systemdesignSchema = new mongoose.Schema<ISystemDesignSchema>({
	rows: [
		{
			sequence: [sequenceEntryFields],
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
});

const SystemDesign = mongoose.models?.SystemDesign || mongoose.model("SystemDesign", systemdesignSchema);
export default SystemDesign;
export type SystemDesignDocument = ReturnType<(typeof SystemDesign)["hydrate"]>;
