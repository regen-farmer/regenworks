import mongoose from "mongoose";

/**
 * Soil measured on a field (11 Nov 2026): the agroforestry check's soil check on the visit (auger,
 * finger test, pH kit), a lab analysis, or the farmer's own soil analyses. The screening uses it in
 * place of the national maps (soil class, pH, how wet it gets). One record per field (Layer).
 * Grove team only.
 */
export const FIELD_SOIL_SOURCES = ["visit", "lab", "farmer analysis"] as const;

export interface IFieldSoil {
	layer: mongoose.Types.ObjectId;
	/** Danish soil class JB1-12 */
	jb?: number | null;
	/** pH (Rt or a kit) */
	ph?: number | null;
	/** depth (m) to rust mottling or standing water in the auger hole; null: not reached */
	wetDepthM?: number | null;
	/** depth (m) roots can reach: to a hardpan, gravel or permanent water */
	rootDepthM?: number | null;
	source: (typeof FIELD_SOIL_SOURCES)[number];
	sampledOn?: Date | null;
	notes?: string;
	updatedBy?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<IFieldSoil>(
	{
		layer: { type: mongoose.Schema.Types.ObjectId, ref: "Layer", required: true, unique: true },
		jb: { type: Number, min: 1, max: 12 },
		ph: { type: Number, min: 3, max: 9.5 },
		wetDepthM: { type: Number, min: 0, max: 3 },
		rootDepthM: { type: Number, min: 0, max: 3 },
		source: { type: String, enum: FIELD_SOIL_SOURCES, default: "visit" },
		sampledOn: Date,
		notes: { type: String, maxlength: 2000 },
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_field_soil", timestamps: true },
);

const FieldSoil = mongoose.models?.FieldSoil || mongoose.model("FieldSoil", schema);
export default FieldSoil;
