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

/**
 * Which layout model lays the trees out.
 *
 * - "rows" (or no `layout` at all): the original row layout. Every row runs
 *   from field edge to field edge and starts its first tree where it meets
 *   the headland. Existing designs keep exactly this.
 * - "grid": its own layout model (modelling/layout-grid). One fixed lattice
 *   anchored at a point and turned to the design bearing, so trees line up
 *   at right angles across the rows; then cut by the field and headland. The
 *   rows in the design are the pattern tile: their widths repeat across, each
 *   row's sequence repeats along.
 */
export type LayoutMode = "rows" | "grid";

/** Corner of the field the grid starts from when no anchor point is set. */
export type GridCorner = "start-left" | "start-right" | "end-left" | "end-right";

export interface IGridSettings {
	/**
	 * Where the first tree of the first row sits, [longitude, latitude].
	 * Set when the grid is placed on the map or locked; overrides `corner`.
	 */
	anchor?: [number, number] | null;
	/** Start the grid from this corner of the field (default "start-left"). */
	corner?: GridCorner | null;
	/** Slide the grid along the rows (m). */
	shiftAlong?: number | null;
	/** Slide the grid across the rows (m). */
	shiftAcross?: number | null;
	/** "offset" moves every other row half a spacing (triangular planting). */
	pattern?: "rectangular" | "offset" | null;
	/** A locked grid keeps its anchor when the field or settings change. */
	locked?: boolean | null;
	/** Fixed size: number of rows and row length (m) from the anchor; blank = whole field. */
	extent?: { rows?: number | null; length?: number | null } | null;
}

export interface ILayoutSettings {
	mode?: LayoutMode | null;
	grid?: IGridSettings | null;
}

/** Mongoose fields for the layout model choice; shared with saved presets. */
export const layoutFields = {
	mode: { type: String, enum: ["rows", "grid"] },
	grid: {
		anchor: { type: [Number], default: undefined },
		corner: { type: String, enum: ["start-left", "start-right", "end-left", "end-right"] },
		shiftAlong: Number,
		shiftAcross: Number,
		pattern: { type: String, enum: ["rectangular", "offset"] },
		locked: Boolean,
		extent: { rows: Number, length: Number },
	},
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
	/** Missing = the original row layout. */
	layout?: ILayoutSettings | null;
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
	layout: layoutFields,
});

const SystemDesign = mongoose.models?.SystemDesign || mongoose.model("SystemDesign", systemdesignSchema);
export default SystemDesign;
export type SystemDesignDocument = ReturnType<(typeof SystemDesign)["hydrate"]>;
