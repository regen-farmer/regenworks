import mongoose from "mongoose";

/**
 * A site for Grove's landscape model (grove-twin): an agroforestry system, orchard
 * or trial whose outline and layout are traced here, so the data jobs in
 * grove-data can fetch its satellite, weather, soil and terrain records.
 * Starts as a point in the queue (e.g. from the EURAF map); becomes "traced"
 * once its outline is drawn or picked from the field map. Grove team only.
 */
export const MODEL_SITE_STATUSES = ["queued", "traced", "skipped"] as const;
export const MODEL_SITE_SYSTEMS = ["silvoarable", "silvopasture", "orchard", "hedgerow", "shelterbelt", "short-rotation", "food-forest", "other"] as const;

export interface IModelSite {
	name: string;
	batch: string;
	status: (typeof MODEL_SITE_STATUSES)[number];
	/** where the site came from: "euraf-map", "kris", "crop-map"... and its id there */
	source?: string;
	sourceRef?: string;
	lon: number;
	lat: number;
	/** outline, GeoJSON Polygon or MultiPolygon (WGS84) */
	geometry?: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
	/** field-map ids picked to make the outline */
	fieldIds: string[];
	system?: (typeof MODEL_SITE_SYSTEMS)[number];
	species: string[];
	/** row direction, degrees from north (0-180) */
	rowBearingDeg?: number | null;
	alleyWidthM?: number | null;
	inRowSpacingM?: number | null;
	plantedYear?: number | null;
	notes?: string;
	createdBy?: mongoose.Types.ObjectId;
	updatedBy?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<IModelSite>(
	{
		name: { type: String, required: true, maxlength: 200 },
		batch: { type: String, required: true, maxlength: 80, index: true },
		status: { type: String, enum: MODEL_SITE_STATUSES, default: "queued" },
		source: { type: String, maxlength: 60 },
		sourceRef: { type: String, maxlength: 200 },
		lon: { type: Number, required: true },
		lat: { type: Number, required: true },
		geometry: { type: mongoose.Schema.Types.Mixed },
		fieldIds: { type: [String], default: [] },
		system: { type: String, enum: MODEL_SITE_SYSTEMS },
		species: { type: [String], default: [] },
		rowBearingDeg: Number,
		alleyWidthM: Number,
		inRowSpacingM: Number,
		plantedYear: Number,
		notes: { type: String, maxlength: 4000 },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_model_sites", timestamps: true },
);

const ModelSite = mongoose.models?.ModelSite || mongoose.model("ModelSite", schema);
export default ModelSite;
