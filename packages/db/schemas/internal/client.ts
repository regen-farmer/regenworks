import mongoose from "mongoose";

/**
 * A Grove client: a person or a company. One client can have many deals
 * over the years (re-purchases, phase 2, care renewals). Grove team only;
 * holds contact details, so never shown outside /internal.
 */
export const CLIENT_KINDS = ["person", "company"] as const;

export interface IClient {
	name: string;
	kind: (typeof CLIENT_KINDS)[number];
	contactPerson?: string;
	email?: string;
	phone?: string;
	address?: string;
	region?: string;
	source?: string;
	notes?: string;
	archived: boolean;
	createdBy?: mongoose.Types.ObjectId;
}

const schema = new mongoose.Schema<IClient>(
	{
		name: { type: String, required: true, trim: true, maxlength: 200 },
		kind: { type: String, enum: CLIENT_KINDS, default: "person" },
		contactPerson: { type: String, maxlength: 200 },
		email: { type: String, maxlength: 200 },
		phone: { type: String, maxlength: 50 },
		address: { type: String, maxlength: 300 },
		region: { type: String, maxlength: 100 },
		source: { type: String, maxlength: 100 },
		notes: { type: String, maxlength: 5000 },
		archived: { type: Boolean, default: false },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_clients", timestamps: true },
);
schema.index({ name: 1 });

const Client = mongoose.models?.GroveClient || mongoose.model("GroveClient", schema);
export default Client;
