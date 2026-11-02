export type OfferLine = {
  _id?: string;
  latin?: string;
  nameDa?: string;
  cultivar?: string;
  rootstock?: string;
  propagation?: string;
  size?: string;
  organic?: boolean | null;
  organicRequested?: boolean | null;
  qty: number;
  unitPrice: number;
  priceSource: "sales" | "cost+margin" | "manual" | "none";
  discountPct?: number;
  note?: string;
  pricing?: Record<string, any> | null;
};

export type Offer = {
  _id: string;
  dineroNumber?: string;
  title?: string;
  status: "draft" | "sent" | "accepted" | "declined";
  project?: string;
  groveProject?: string | null;
  client: { name?: string; address?: string; cvr?: string; contactPerson?: string; email?: string; phone?: string };
  clientOrganic: boolean;
  offerDate: string;
  validUntil: string;
  pricebookVersion?: number | null;
  marginPct?: number | null;
  eurDkk?: number | null;
  lines: OfferLine[];
  discountPct: number;
  terms: { deliverySeason?: string; deposit?: string; text?: string };
  notes?: string;
  updatedAt?: string;
};

export type Totals = { lines: { id: string; total: number }[]; subtotal: number; discount: number; net: number; vat: number; total: number };

export type Presented = {
  offer: Offer;
  totals: Totals;
  dinero: { text: string; qty: number; amount: number }[];
  internal: {
    lines: { id: string; margin: { unitCost: number; unitMargin: number; marginPct: number } | null; dispensation: boolean; outdated: boolean; vatUnclear: boolean; ambiguous: boolean; unpriced: boolean; stale?: boolean; costReferenceOutdated?: boolean }[];
    purchaseList: { supplierId: string; totalCostDkk: number; lines: any[] }[];
  };
  warning?: string;
};

export const STATUS_DA: Record<Offer["status"], string> = {
  draft: "Kladde",
  sent: "Sendt",
  accepted: "Accepteret",
  declined: "Afvist",
};

export const PROPAGATION_DA: Record<string, string> = {
  grafted: "podet",
  seedling: "frøformeret",
  "own-rooted": "egen rod",
  cutting: "stikling",
};

export const DISPENSATION_TEXT = "Ikke økologisk. Kræver dispensation, som kunden selv søger og har ansvaret for.";

export const dkk = (n: number | undefined | null) =>
  n === undefined || n === null || !Number.isFinite(n)
    ? "–"
    : `${n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;

export const dato = (d: string | undefined) => (d ? new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" }) : "");
