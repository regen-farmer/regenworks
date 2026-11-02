// Offer v2: services (tree protection, fencing, site preparation, planting,
// staking, design, irrigation, logistics). Pure functions, tested.
//
// The service list and its prices live in the private grove-pricebook repo
// (services.csv); this code only knows the columns. Each service has a unit
// on the offer (e.g. "stk.", "m", "ha", "sæt") and a rule for its quantity
// from the design: per tree, per metre of tree row, per metre of field
// boundary, per hectare of field or of tree cover, per row, or a fixed number.
import { round5, type SupplierPrice } from "./pricebook.ts";

export const SERVICE_SECTIONS = ["protection", "fencing", "site-prep", "planting", "staking", "design", "irrigation", "logistics", "other"] as const;
export type ServiceSection = (typeof SERVICE_SECTIONS)[number];

/** Section headings on the Danish offer sheet. */
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

/** What a service's quantity is counted from. */
export const SERVICE_BASES = ["tree", "row_m", "perimeter_m", "field_ha", "tree_ha", "row", "fixed"] as const;
export type ServiceBasis = (typeof SERVICE_BASES)[number];

export type Service = {
  serviceId: string;
  section: ServiceSection;
  nameDa: string;
  nameEn?: string;
  /** unit shown on the offer, e.g. "stk.", "m", "ha", "sæt", "dag" */
  unitDa: string;
  basis: ServiceBasis;
  /** units per basis, e.g. 1 guard per tree, 0.01 sets per tree, 1.1 m fence per m boundary */
  qtyPerBasis: number;
  /** whole units only (sets, rolls, days) */
  roundUp: boolean;
  /** Grove's client price per unit, excl. VAT (kr). Blank: cost + target margin. */
  priceExclVat?: number;
  /** internal cost per unit in kr: low / likely / high */
  costLow?: number;
  costLikely?: number;
  costHigh?: number;
  /** or the cost from a supplier row in supplier_prices.csv (x supplierQty items per unit) */
  supplierPriceId?: string;
  supplierQty?: number;
  targetMarginPct?: number;
  notes?: string;
};

/** Quantities a design knows, used to fill service quantities. */
export type DesignQuantities = {
  trees: number;
  rows: number;
  rowM: number;
  perimeterM: number;
  fieldHa: number;
  treeHa: number;
};

export const SERVICE_COLUMNS = [
  "service_id",
  "section",
  "name_da",
  "name_en",
  "unit_da",
  "basis",
  "qty_per_basis",
  "round_up",
  "price_excl_vat",
  "cost_low",
  "cost_likely",
  "cost_high",
  "supplier_price_id",
  "supplier_qty",
  "target_margin_pct",
  "notes",
];
export const SERVICE_REQUIRED = ["service_id", "section", "name_da", "unit_da", "basis"];

const num = (v: string | undefined) => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const opt = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** Rows of services.csv → services. Bad rows are reported, not guessed. */
export function buildServices(rows: Record<string, string>[], supplierPriceIds: Set<string>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const services: Service[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = opt(r.service_id);
    if (!id) {
      errors.push("services.csv: a row has no service_id");
      continue;
    }
    if (seen.has(id)) errors.push(`services.csv: duplicate service_id ${id}`);
    seen.add(id);
    const section = opt(r.section) as ServiceSection | undefined;
    const basis = opt(r.basis) as ServiceBasis | undefined;
    if (!section || !SERVICE_SECTIONS.includes(section)) errors.push(`services.csv: ${id} has section "${r.section ?? ""}" (use ${SERVICE_SECTIONS.join(", ")})`);
    if (!basis || !SERVICE_BASES.includes(basis)) errors.push(`services.csv: ${id} has basis "${r.basis ?? ""}" (use ${SERVICE_BASES.join(", ")})`);
    if (!opt(r.name_da) || !opt(r.unit_da)) errors.push(`services.csv: ${id} needs name_da and unit_da`);
    const qtyPerBasis = num(r.qty_per_basis) ?? 1;
    if (!(qtyPerBasis > 0) || qtyPerBasis > 100_000) errors.push(`services.csv: ${id} has qty_per_basis ${r.qty_per_basis}`);
    const money = (k: string) => {
      const v = num(r[k]);
      if (r[k]?.trim() && (v === undefined || v < 0 || v > 10_000_000)) errors.push(`services.csv: ${id} has ${k} "${r[k]}"`);
      return v;
    };
    const s: Service = {
      serviceId: id,
      section: section as ServiceSection,
      nameDa: opt(r.name_da) ?? id,
      nameEn: opt(r.name_en),
      unitDa: opt(r.unit_da) ?? "stk.",
      basis: basis as ServiceBasis,
      qtyPerBasis,
      roundUp: /^(yes|ja|true|1)$/i.test((r.round_up ?? "").trim()),
      priceExclVat: money("price_excl_vat"),
      costLow: money("cost_low"),
      costLikely: money("cost_likely"),
      costHigh: money("cost_high"),
      supplierPriceId: opt(r.supplier_price_id),
      supplierQty: num(r.supplier_qty),
      targetMarginPct: num(r.target_margin_pct),
      notes: opt(r.notes),
    };
    if (s.targetMarginPct !== undefined && (s.targetMarginPct < 0 || s.targetMarginPct > 500)) errors.push(`services.csv: ${id} has target_margin_pct ${r.target_margin_pct}`);
    if (s.supplierQty !== undefined && !(s.supplierQty > 0)) errors.push(`services.csv: ${id} has supplier_qty ${r.supplier_qty}`);
    if (s.costLow !== undefined && s.costHigh !== undefined && s.costLow > s.costHigh) warnings.push(`services.csv: ${id} has cost_low above cost_high`);
    if (s.priceExclVat === undefined && s.costLikely === undefined && !s.supplierPriceId) warnings.push(`services.csv: ${id} has no price and no cost yet; it shows as "no price" on offers`);
    if (s.supplierPriceId && !supplierPriceIds.has(s.supplierPriceId)) errors.push(`services.csv: ${id} names unknown supplier price ${s.supplierPriceId}`);
    services.push(s);
  }
  return { services, errors, warnings };
}

/** Units of a service for a design, e.g. 1,250 trees × 1 guard; rounded up when whole units. */
export function serviceQty(s: Pick<Service, "basis" | "qtyPerBasis" | "roundUp">, q: Partial<DesignQuantities>): number {
  const base =
    s.basis === "fixed"
      ? 1
      : s.basis === "tree"
        ? q.trees
        : s.basis === "row_m"
          ? q.rowM
          : s.basis === "perimeter_m"
            ? q.perimeterM
            : s.basis === "field_ha"
              ? q.fieldHa
              : s.basis === "tree_ha"
                ? q.treeHa
                : q.rows;
  const raw = (base ?? 0) * s.qtyPerBasis;
  if (!(raw > 0)) return 0;
  // hectares to 2 decimals, metres and pieces whole
  if (s.roundUp) return Math.ceil(raw - 1e-9);
  return s.basis === "field_ha" || s.basis === "tree_ha" ? Math.round(raw * 100) / 100 : Math.round(raw);
}

/** Client prices: nearest 5 kr from 50 kr, else nearest 0.50 kr (small items like nets). */
export const roundServicePrice = (kr: number) => (kr >= 50 ? round5(kr) : Math.round(kr * 2) / 2);

export type ServicePricing = {
  serviceId: string;
  unitPrice: number;
  source: "sales" | "cost+margin";
  unitCostDkk?: number;
  costLow?: number;
  costHigh?: number;
  targetMarginPct?: number;
  supplierPriceId?: string;
  singleSource: boolean;
};

/**
 * Price one service: Grove's listed price, else cost × (1 + target margin).
 * Cost: the likely cost in services.csv, else the supplier row. Null when
 * neither a price nor a cost is known.
 */
export function priceService(
  s: Service,
  opts: { eurDkk: number; supplierPrices: SupplierPrice[]; defaultMarginPct?: number },
): ServicePricing | null {
  let likely = s.costLikely;
  let low = s.costLow;
  let high = s.costHigh;
  let fromSupplier: SupplierPrice | undefined;
  if (likely === undefined && s.supplierPriceId) {
    fromSupplier = opts.supplierPrices.find((p) => p.priceId === s.supplierPriceId);
    if (fromSupplier) {
      const dkk = fromSupplier.currency === "DKK" ? fromSupplier.price : fromSupplier.currency === "EUR" ? fromSupplier.price * opts.eurDkk : NaN;
      if (Number.isFinite(dkk)) likely = Math.round(dkk * (s.supplierQty ?? 1) * 100) / 100;
    }
  }
  const margin = s.targetMarginPct ?? opts.defaultMarginPct;
  const base = {
    serviceId: s.serviceId,
    unitCostDkk: likely,
    costLow: low ?? likely,
    costHigh: high ?? likely,
    targetMarginPct: margin,
    supplierPriceId: fromSupplier?.priceId,
    singleSource: low === undefined && high === undefined,
  };
  if (s.priceExclVat !== undefined) return { ...base, unitPrice: s.priceExclVat, source: "sales" };
  if (likely === undefined || margin === undefined) return null;
  return { ...base, unitPrice: roundServicePrice(likely * (1 + margin / 100)), source: "cost+margin" };
}

/**
 * Margin of a line at the likely cost, and its range from the high and low
 * cost, as % of the (discounted) sales price. Null without a cost or price.
 */
export function marginRange(unitPrice: number, discountPct: number, cost: { likely?: number; low?: number; high?: number }) {
  const sale = unitPrice * (1 - (discountPct || 0) / 100);
  if (!(sale > 0) || cost.likely === undefined) return null;
  const pct = (c: number) => Math.round(((sale - c) / sale) * 1000) / 10;
  return { likely: pct(cost.likely), worst: pct(cost.high ?? cost.likely), best: pct(cost.low ?? cost.likely) };
}

// ---- deposit and delivery ---------------------------------------------------

/** Deposit rule (sales plan): 50 % if delivery is within 3 months of the offer date, else 20 %. */
export function depositPctFor(offerDate: Date, deliveryDate: Date | null | undefined): number {
  if (!deliveryDate) return 50;
  const limit = new Date(offerDate);
  limit.setMonth(limit.getMonth() + 3);
  return deliveryDate.getTime() <= limit.getTime() ? 50 : 20;
}

/** Deposit in kr incl. VAT, to 2 decimals. */
export const depositAmount = (totalInclVat: number, pct: number) => Math.round(totalInclVat * pct) / 100;
