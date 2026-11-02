import mongoose from "mongoose";

/**
 * A Grove offer (tilbud) to a client. Grove team only: prices, costs and
 * margins live here and are never returned by public routes.
 */
export const OFFER_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export const PRICE_SOURCES = ["sales", "cost+margin", "manual", "none"] as const;

export const LINE_KINDS = ["plant", "service"] as const;

const lineSchema = new mongoose.Schema(
	{
		// a plant (default) or a service (protection, planting, staking, ...)
		kind: { type: String, enum: LINE_KINDS, default: "plant" },
		serviceId: { type: String, maxlength: 100 },
		section: { type: String, maxlength: 40 },
		unitDa: { type: String, maxlength: 20 },
		latin: { type: String, maxlength: 200 },
		nameDa: { type: String, maxlength: 200 },
		speciesId: { type: mongoose.Schema.Types.ObjectId, ref: "Species" },
		varietyId: { type: mongoose.Schema.Types.ObjectId, ref: "Variety" },
		rootstockId: { type: mongoose.Schema.Types.ObjectId, ref: "Rootstock" },
		cultivar: { type: String, maxlength: 200 },
		rootstock: { type: String, maxlength: 200 },
		propagation: { type: String, maxlength: 40 },
		size: { type: String, maxlength: 100 },
		heightMin: Number,
		heightMax: Number,
		// what was asked for (design or editor; null = open) and what was matched
		organicRequested: { type: Boolean, default: null },
		organic: { type: Boolean, default: null },
		// a product picked in the pricebook (priced from exactly that row)
		pricebookRef: {
			type: new mongoose.Schema({ kind: { type: String, enum: ["sales", "supplier"] }, id: { type: String, maxlength: 100 } }, { _id: false }),
			default: null,
		},
		qty: { type: Number, min: 0, max: 10_000_000 },
		unitPrice: { type: Number, min: 0, max: 10_000_000 },
		priceSource: { type: String, enum: PRICE_SOURCES, default: "none" },
		discountPct: { type: Number, min: 0, max: 100, default: 0 },
		note: { type: String, maxlength: 1000 },
		// What the pricebook said (internal sheet only)
		pricing: { type: mongoose.Schema.Types.Mixed },
	},
	{ _id: true },
);

export interface IOffer {
	dineroNumber?: string;
	title?: string;
	status: (typeof OFFER_STATUSES)[number];
	project?: mongoose.Types.ObjectId | null;
	groveProject?: mongoose.Types.ObjectId | null;
	/** The deal in A · Clients & deals this offer belongs to. */
	deal?: mongoose.Types.ObjectId | null;
	client: { name?: string; address?: string; cvr?: string; contactPerson?: string; email?: string; phone?: string };
	clientOrganic: boolean;
	offerDate: Date;
	validUntil: Date;
	pricebookVersion?: number | null;
	marginPct?: number | null;
	eurDkk?: number | null;
	lines: any[];
	discountPct: number;
	terms: {
		deliverySeason?: string;
		deposit?: string;
		text?: string;
		/** a forward order: plants for a later season, 20 % deposit and a later-delivery clause */
		forwardOrder?: boolean;
		/** expected delivery/planting date: decides the deposit rule */
		deliveryDate?: Date | null;
		/** deposit % set by hand; null = the rule (50 % within 3 months, else 20 %) */
		depositPct?: number | null;
		guarantee?: boolean;
		guaranteeText?: string;
	};
	notes?: string;
	/** when the offer was marked accepted (for the scorecard) */
	acceptedAt?: Date | null;
	createdBy?: mongoose.Types.ObjectId;
	updatedBy?: mongoose.Types.ObjectId;
}

const offerSchema = new mongoose.Schema<IOffer>(
	{
		dineroNumber: { type: String, maxlength: 50 },
		title: { type: String, maxlength: 200 },
		status: { type: String, enum: OFFER_STATUSES, default: "draft" },
		project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
		groveProject: { type: mongoose.Schema.Types.ObjectId, ref: "GroveProject" },
		deal: { type: mongoose.Schema.Types.ObjectId, ref: "GroveDeal", index: true },
		client: {
			name: { type: String, maxlength: 200 },
			address: { type: String, maxlength: 500 },
			cvr: { type: String, maxlength: 20 },
			contactPerson: { type: String, maxlength: 200 },
			email: { type: String, maxlength: 200 },
			phone: { type: String, maxlength: 50 },
		},
		clientOrganic: { type: Boolean, default: false },
		offerDate: { type: Date, default: Date.now },
		validUntil: { type: Date },
		pricebookVersion: Number,
		marginPct: Number,
		eurDkk: Number,
		lines: [lineSchema],
		discountPct: { type: Number, min: 0, max: 100, default: 0 },
		terms: {
			deliverySeason: { type: String, maxlength: 200 },
			deposit: { type: String, maxlength: 500 },
			text: { type: String, maxlength: 5000 },
			forwardOrder: { type: Boolean, default: false },
			deliveryDate: { type: Date, default: null },
			depositPct: { type: Number, min: 0, max: 100, default: null },
			guarantee: { type: Boolean, default: false },
			guaranteeText: { type: String, maxlength: 3000 },
		},
		notes: { type: String, maxlength: 5000 },
		acceptedAt: { type: Date, default: null },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ collection: "grove_offers", timestamps: true },
);

const Offer = mongoose.models?.Offer || mongoose.model("Offer", offerSchema);
export default Offer;
