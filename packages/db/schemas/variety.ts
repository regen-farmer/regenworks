import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species.ts";
import type { IUserSchema } from "./user.ts";

/**
 * A cultivar. Belongs to exactly one species or hybrid group (`species`).
 *
 * `shared` cultivars form the catalogue curated by the Grove team and every
 * user can pick them; the rest are private to their owner.
 *
 * `hybrid` and `rootstock` are the old fields from before rootstocks and
 * hybrid groups had their own entries. They are kept so the one-off
 * migration (packages/db/migrations/plant-catalogue-2026-11.ts) can read
 * them; new code should not write them.
 */
export interface IVarietySchema {
	name: string;
	species: mongoose.HydratedDocument<ISpeciesSchema> | mongoose.Types.ObjectId | string;
	price: number;
	description: string;
	class: string;
	pollination: string;
	pedigree?: string;
	ripening?: string;
	vigour?: Vigour | null;
	shared?: boolean;
	/** @deprecated read only by the migration */
	rootstock: {
		name: string;
		species: mongoose.HydratedDocument<ISpeciesSchema>;
	};
	/** @deprecated read only by the migration */
	hybrid: mongoose.HydratedDocument<ISpeciesSchema>;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | mongoose.Types.ObjectId | string;
	};
}

export const VIGOUR = ["very-dwarfing", "dwarfing", "semi-dwarfing", "semi-vigorous", "vigorous", "very-vigorous"] as const;
export type Vigour = (typeof VIGOUR)[number];

// VARIETY SCHEMA SETUP
const varietySchema = new mongoose.Schema<IVarietySchema>({
	name: { type: String, trim: true },
	species: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
	},
	price: Number,
	description: String,
	class: String,
	pollination: String,
	pedigree: { type: String, trim: true, maxlength: 300 },
	ripening: { type: String, trim: true, maxlength: 100 },
	vigour: { type: String, enum: [...VIGOUR, null] },
	shared: { type: Boolean, default: false, index: true },
	rootstock: {
		name: String,
		species: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Species",
		},
	},
	hybrid: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Species",
	},
	owner: {
		id: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
	},
});

const Variety =
	mongoose.models?.Variety || mongoose.model("Variety", varietySchema);
export default Variety;
export type VarietyDocument = ReturnType<(typeof Variety)["hydrate"]>;
