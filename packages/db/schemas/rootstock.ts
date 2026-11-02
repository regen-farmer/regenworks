import mongoose from "mongoose";
import type { ISpeciesSchema } from "./species.ts";
import type { IUserSchema } from "./user.ts";
import { VIGOUR, type Vigour } from "./variety.ts";

/**
 * A rootstock, e.g. "Corylus colurna seedling" or "MM106". Its species is
 * often different from the cultivar grafted onto it.
 *
 * `shared` rootstocks are the Grove-curated catalogue every user can pick;
 * the rest are private to their owner.
 */
export interface IRootstockSchema {
	name: string;
	species?: mongoose.HydratedDocument<ISpeciesSchema> | mongoose.Types.ObjectId | string | null;
	/** Seedling rootstocks vary; clonal ones are uniform. */
	propagation?: "seedling" | "clonal" | null;
	vigour?: Vigour | null;
	notes?: string;
	shared?: boolean;
	owner: {
		id: mongoose.HydratedDocument<IUserSchema> | mongoose.Types.ObjectId | string;
	};
}

export const ROOTSTOCK_PROPAGATION = ["seedling", "clonal"] as const;

const rootstockSchema = new mongoose.Schema<IRootstockSchema>({
	name: { type: String, trim: true, required: true, maxlength: 120 },
	species: { type: mongoose.Schema.Types.ObjectId, ref: "Species" },
	propagation: { type: String, enum: [...ROOTSTOCK_PROPAGATION, null] },
	vigour: { type: String, enum: [...VIGOUR, null] },
	notes: { type: String, trim: true, maxlength: 1000 },
	shared: { type: Boolean, default: false, index: true },
	owner: {
		id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
});

const Rootstock =
	mongoose.models?.Rootstock || mongoose.model("Rootstock", rootstockSchema);
export default Rootstock;
export type RootstockDocument = ReturnType<(typeof Rootstock)["hydrate"]>;
