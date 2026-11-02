export type ServiceSection = "protection" | "fencing" | "site-prep" | "planting" | "staking" | "design" | "irrigation" | "logistics" | "other";

export type OfferLine = {
  _id?: string;
  /** a plant (default) or a service */
  kind?: "plant" | "service";
  serviceId?: string;
  section?: ServiceSection;
  unitDa?: string;
  latin?: string;
  nameDa?: string;
  cultivar?: string;
  rootstock?: string;
  propagation?: string;
  size?: string;
  organic?: boolean | null;
  organicRequested?: boolean | null;
  pricebookRef?: { kind: "sales" | "supplier"; id: string } | null;
  heightMin?: number;
  heightMax?: number;
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
  deal?: string | null;
  client: { name?: string; address?: string; cvr?: string; contactPerson?: string; email?: string; phone?: string };
  clientOrganic: boolean;
  offerDate: string;
  validUntil: string;
  pricebookVersion?: number | null;
  marginPct?: number | null;
  eurDkk?: number | null;
  lines: OfferLine[];
  discountPct: number;
  terms: {
    deliverySeason?: string;
    deposit?: string;
    text?: string;
    deliveryDate?: string | null;
    depositPct?: number | null;
    guarantee?: boolean;
    guaranteeText?: string;
  };
  notes?: string;
  updatedAt?: string;
};

export type Totals = {
  lines: { id: string; total: number }[];
  subtotal: number;
  plants: number;
  services: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
  deposit: { pct: number; fromRule: boolean; amount: number };
};

export type LineMargin = { unitCost: number; unitMargin: number; marginPct: number; worstPct: number; bestPct: number; targetPct?: number; belowTarget: boolean };

export type Presented = {
  offer: Offer;
  totals: Totals;
  dinero: { text: string; qty: number; amount: number }[];
  internal: {
    lines: { id: string; margin: LineMargin | null; singleSource?: boolean; documentDate?: string; dispensation: boolean; outdated: boolean; vatUnclear: boolean; ambiguous: boolean; unpriced: boolean; stale?: boolean; pickedMissing?: boolean; costReferenceOutdated?: boolean }[];
    purchaseList: { supplierId: string; totalCostDkk: number; lines: any[] }[];
    margin: { sale: number; margin: number; marginPct: number | null; worstPct: number | null; bestPct: number | null; withoutCost: number };
  };
  warning?: string;
};

export const STATUS_DA: Record<Offer["status"], string> = {
  draft: "Kladde",
  sent: "Sendt",
  accepted: "Accepteret",
  declined: "Afvist",
};

/** Labels in the app (English). The client's offer sheet uses the Danish ones. */
export const PROPAGATION_EN: Record<string, string> = {
  grafted: "Grafted",
  seedling: "Seedling",
  "own-rooted": "Own roots",
  cutting: "Cutting",
};

export const STATUS_EN: Record<Offer["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

/** Pricebook wording ("podet", "vegetatively propagated", ...) to our types. */
export function propagationFrom(raw: string | undefined): string | undefined {
  const x = (raw ?? "").toLowerCase();
  if (!x) return undefined;
  if (/graft|podet|veredel/.test(x)) return "grafted";
  if (/seed|frø|zaai/.test(x)) return "seedling";
  if (/cutting|stikling|stek/.test(x)) return "cutting";
  if (/own|layer|vegetativ|tissue|meristem|egen rod/.test(x)) return "own-rooted";
  return undefined;
}

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

export const isService = (l: OfferLine) => l.kind === "service";

export const SECTIONS: ServiceSection[] = ["protection", "fencing", "site-prep", "planting", "staking", "design", "irrigation", "logistics", "other"];
export const SECTION_EN: Record<ServiceSection, string> = {
  protection: "Tree protection",
  fencing: "Fencing",
  "site-prep": "Site preparation",
  planting: "Planting",
  staking: "Setting out (RTK)",
  design: "Design",
  irrigation: "Irrigation",
  logistics: "Logistics",
  other: "Other",
};
export const SECTION_DA: Record<ServiceSection, string> = {
  protection: "Beskyttelse af træer",
  fencing: "Hegn",
  "site-prep": "Jordbearbejdning",
  planting: "Plantning",
  staking: "Afsætning",
  design: "Design",
  irrigation: "Vanding",
  logistics: "Logistik",
  other: "Øvrigt",
};

export type ServiceBasis = "tree" | "row_m" | "perimeter_m" | "field_ha" | "tree_ha" | "row" | "fixed";
export type Service = {
  serviceId: string;
  section: ServiceSection;
  nameDa: string;
  nameEn?: string;
  unitDa: string;
  basis: ServiceBasis;
  qtyPerBasis: number;
  roundUp: boolean;
  unitPrice: number | null;
  priceSource: "sales" | "cost+margin" | "none";
  notes?: string;
};
export type DesignQuantities = { trees: number; rows: number; rowM: number; perimeterM: number; fieldHa: number; treeHa: number };

export const BASIS_EN: Record<ServiceBasis, string> = {
  tree: "per tree",
  row_m: "per m of tree row",
  perimeter_m: "per m of field boundary",
  field_ha: "per ha of field",
  tree_ha: "per ha of tree cover",
  row: "per row",
  fixed: "fixed",
};

/** Same rule as the server: units of a service for the given quantities. */
export function serviceQty(s: Pick<Service, "basis" | "qtyPerBasis" | "roundUp">, q: Partial<DesignQuantities>): number {
  const base = { fixed: 1, tree: q.trees, row_m: q.rowM, perimeter_m: q.perimeterM, field_ha: q.fieldHa, tree_ha: q.treeHa, row: q.rows }[s.basis];
  const raw = (base ?? 0) * s.qtyPerBasis;
  if (!(raw > 0)) return 0;
  if (s.roundUp) return Math.ceil(raw - 1e-9);
  return s.basis === "field_ha" || s.basis === "tree_ha" ? Math.round(raw * 100) / 100 : Math.round(raw);
}

/** The calendar day in Denmark as YYYY-MM-DD (same as the server). */
export function danishDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** YYYY-MM-DD plus whole months, capped at the month's end (same as the server). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Deposit rule (same as the server): 50 % if delivery within 3 months of the offer date, else 20 %. */
export function depositRule(offerDate: string | undefined, deliveryDate: string | null | undefined) {
  if (!deliveryDate) return 50;
  return danishDay(new Date(deliveryDate)) <= addMonths(danishDay(new Date(offerDate ?? Date.now())), 3) ? 50 : 20;
}
