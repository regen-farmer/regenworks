import mongoose from "mongoose";

/**
 * APCCO Uganda (section D, 20 Nov 2026): robusta coffee agroforestry sites, the field data
 * imported for them, named parameter sets per model, and model runs (SHAMBA now; DynACof
 * and CAF2021 next). Grove team only (requireRole("grove-team") on /internal/apcco).
 */

export const APCCO_MODELS = ["shamba", "dynacof", "caf2021"] as const;
export type ApccoModel = (typeof APCCO_MODELS)[number];

export const COFFEE_TYPES = ["robusta", "arabica"] as const;

/** Kinds of field data a site can hold; one dataset per kind per site. */
export const DATA_KINDS = ["shade-trees", "coffee-plots", "canopy", "soil", "weather-daily", "climate-monthly"] as const;
export type DataKind = (typeof DATA_KINDS)[number];

/**
 * How a parameter set came about:
 * - original: the model's own published defaults, unchanged
 * - literature: values taken from papers (named in `source`)
 * - calibrated: fitted to a named dataset (`dataset`, e.g. "ROBUST", "APCCO 2027")
 */
export const PARAM_STATUSES = ["original", "literature", "calibrated"] as const;

export interface IApccoSite {
	name: string;
	district?: string;
	lat: number;
	lon: number;
	/** Polygon or MultiPolygon (lon/lat), optional */
	boundary?: any;
	/** Area the plot data stands for (ha); from the boundary when there is one */
	areaHa?: number | null;
	coffeeType: (typeof COFFEE_TYPES)[number];
	notes?: string;
	archived?: boolean;
	createdBy?: mongoose.Types.ObjectId;
}

const siteSchema = new mongoose.Schema<IApccoSite>(
	{
		name: { type: String, required: true, maxlength: 200 },
		district: { type: String, maxlength: 200 },
		lat: { type: Number, required: true, min: -90, max: 90 },
		lon: { type: Number, required: true, min: -180, max: 180 },
		boundary: { type: mongoose.Schema.Types.Mixed },
		areaHa: { type: Number, min: 0, max: 100_000 },
		coffeeType: { type: String, enum: COFFEE_TYPES, default: "robusta" },
		notes: { type: String, maxlength: 5000 },
		archived: { type: Boolean, default: false },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_apcco_sites", timestamps: true },
);

export interface IApccoDataset {
	site: mongoose.Types.ObjectId;
	kind: DataKind;
	/** Cleaned rows, keyed by the template's column names */
	rows: Record<string, string | number | null>[];
	filename?: string;
	/** Who collected it, e.g. "APCCO field team", "ROBUST" */
	source?: string;
	warnings?: string[];
	importedBy?: mongoose.Types.ObjectId;
}

const datasetSchema = new mongoose.Schema<IApccoDataset>(
	{
		site: { type: mongoose.Schema.Types.ObjectId, ref: "ApccoSite", required: true },
		kind: { type: String, enum: DATA_KINDS, required: true },
		rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
		filename: { type: String, maxlength: 300 },
		source: { type: String, maxlength: 200 },
		warnings: { type: [String], default: [] },
		importedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_apcco_datasets", timestamps: true },
);
datasetSchema.index({ site: 1, kind: 1 }, { unique: true });

export interface IApccoParameterSet {
	model: ApccoModel;
	/** Short name, e.g. "Robusta Uganda". The label adds model, status, dataset and version. */
	name: string;
	status: (typeof PARAM_STATUSES)[number];
	coffeeType?: (typeof COFFEE_TYPES)[number] | null;
	/** The dataset it was calibrated on (calibrated sets) */
	dataset?: string;
	version: string;
	/** Papers or reports the values come from */
	source?: string;
	notes?: string;
	/** Model-specific values. SHAMBA: { tables: { tree, crop, litter, biomass_pool } as {columns, rows} } */
	values: any;
	/** A built-in set (the model's own defaults); can't be edited or deleted */
	builtIn?: boolean;
	archived?: boolean;
	createdBy?: mongoose.Types.ObjectId;
}

const paramSchema = new mongoose.Schema<IApccoParameterSet>(
	{
		model: { type: String, enum: APCCO_MODELS, required: true },
		name: { type: String, required: true, maxlength: 120 },
		status: { type: String, enum: PARAM_STATUSES, required: true },
		coffeeType: { type: String, enum: COFFEE_TYPES },
		dataset: { type: String, maxlength: 120 },
		version: { type: String, required: true, maxlength: 20 },
		source: { type: String, maxlength: 2000 },
		notes: { type: String, maxlength: 5000 },
		values: { type: mongoose.Schema.Types.Mixed, default: {} },
		builtIn: { type: Boolean, default: false },
		archived: { type: Boolean, default: false },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_apcco_parameter_sets", timestamps: true },
);
paramSchema.index({ model: 1, name: 1, status: 1, dataset: 1, version: 1 }, { unique: true });

export const RUN_STATUSES = ["running", "done", "failed"] as const;

export interface IApccoRun {
	site: mongoose.Types.ObjectId;
	model: ApccoModel;
	parameterSet: mongoose.Types.ObjectId;
	/** Label of the parameter set at run time (it can be renamed later) */
	parameterLabel: string;
	/** The scenario as entered (before translation to the model's input) */
	scenario: any;
	/** The exact request sent to the model runner */
	request: any;
	inputSha256: string;
	status: (typeof RUN_STATUSES)[number];
	outputs?: any;
	/** Provenance from the runner: model version, upstream commit, adapter version, duration, warnings */
	provenance?: any;
	error?: string;
	createdBy?: mongoose.Types.ObjectId;
	finishedAt?: Date;
}

const runSchema = new mongoose.Schema<IApccoRun>(
	{
		site: { type: mongoose.Schema.Types.ObjectId, ref: "ApccoSite", required: true },
		model: { type: String, enum: APCCO_MODELS, required: true },
		parameterSet: { type: mongoose.Schema.Types.ObjectId, ref: "ApccoParameterSet", required: true },
		parameterLabel: { type: String, required: true },
		scenario: { type: mongoose.Schema.Types.Mixed },
		request: { type: mongoose.Schema.Types.Mixed },
		inputSha256: { type: String, required: true },
		status: { type: String, enum: RUN_STATUSES, required: true },
		outputs: { type: mongoose.Schema.Types.Mixed },
		provenance: { type: mongoose.Schema.Types.Mixed },
		error: { type: String, maxlength: 5000 },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		finishedAt: Date,
	},
	{ collection: "grove_apcco_runs", timestamps: true },
);
runSchema.index({ site: 1, createdAt: -1 });

export const ApccoSite = mongoose.models?.ApccoSite || mongoose.model("ApccoSite", siteSchema);
export const ApccoDataset = mongoose.models?.ApccoDataset || mongoose.model("ApccoDataset", datasetSchema);
export const ApccoParameterSet =
	mongoose.models?.ApccoParameterSet || mongoose.model("ApccoParameterSet", paramSchema);
export const ApccoRun = mongoose.models?.ApccoRun || mongoose.model("ApccoRun", runSchema);
