// Offer sheet logic (pure, tested). Grove team only via /internal/offers.
import { round5, suggestPrice, type PlantQuery, type PricebookData, type Propagation } from "./pricebook.ts";

export const VAT_RATE = 0.25;
export const DEFAULT_VALID_DAYS = 14;

/** Shown on the offer for non-organic plants when the client is organic. */
export const DISPENSATION_TEXT =
  "Ikke økologisk. Kræver dispensation, som kunden selv søger og har ansvaret for.";

export const PROPAGATION_DA: Record<string, string> = {
  grafted: "podet",
  seedling: "frøformeret",
  "own-rooted": "egen rod",
  cutting: "stikling",
};

/** Kroner to 2 decimals, without floating-point surprises (1.005 -> 1.01). */
const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

export type OfferLine = {
  _id?: unknown;
  latin?: string;
  nameDa?: string;
  speciesId?: unknown;
  varietyId?: unknown;
  rootstockId?: unknown;
  cultivar?: string;
  rootstock?: string;
  propagation?: string;
  size?: string;
  heightMin?: number;
  heightMax?: number;
  organic?: boolean | null;
  /** organic as asked for by the design or the editor; null = open (client decides) */
  organicRequested?: boolean | null;
  qty: number;
  unitPrice: number;
  priceSource: "sales" | "cost+margin" | "manual" | "none";
  discountPct?: number;
  note?: string;
  pricing?: Record<string, any> | null;
};

export type OfferLike = {
  lines: OfferLine[];
  discountPct?: number;
  clientOrganic?: boolean;
};

export const lineTotal = (l: OfferLine) => round2((l.qty || 0) * (l.unitPrice || 0) * (1 - (l.discountPct || 0) / 100));

export function needsDispensation(l: OfferLine, clientOrganic: boolean | undefined) {
  return !!clientOrganic && l.organic !== true;
}

export function offerTotals(o: OfferLike) {
  const lines = o.lines.map((l) => ({ id: String(l._id ?? ""), total: lineTotal(l) }));
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const discount = round2(subtotal * ((o.discountPct || 0) / 100));
  const net = round2(subtotal - discount);
  const vat = round2(net * VAT_RATE);
  return { lines, subtotal, discount, net, vat, total: round2(net + vat) };
}

/** Margin per line from the pricebook cost (internal sheet). */
export function lineMargin(l: OfferLine) {
  const cost = l.pricing?.unitCostDkk;
  const sale = (l.unitPrice || 0) * (1 - (l.discountPct || 0) / 100);
  if (typeof cost !== "number" || !(sale > 0)) return null;
  return { unitCost: cost, unitMargin: round2(sale - cost), marginPct: round2(((sale - cost) / sale) * 100) };
}

const stk = (n: number) => n.toLocaleString("da-DK");
const pct = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 2 });

/**
 * One summary line per species and propagation for the Dinero tilbud,
 * e.g. "Hassel, podet, 3 sorter: 1.115 stk." with the amount excl. VAT.
 */
export function dineroLines(o: OfferLike) {
  const groups = new Map<string, { text: string; qty: number; amount: number; cultivars: Set<string>; unnamed: number }>();
  for (const l of o.lines) {
    if (!(l.qty > 0)) continue;
    const name = l.nameDa || l.latin || "Planter";
    const prop = l.propagation ? PROPAGATION_DA[l.propagation] ?? l.propagation : "";
    const key = `${name}|${prop}|${l.organic === true ? "øko" : ""}`;
    const g = groups.get(key) ?? { text: "", qty: 0, amount: 0, cultivars: new Set<string>(), unnamed: 0 };
    g.qty += l.qty;
    g.amount += lineTotal(l);
    if (l.cultivar) g.cultivars.add(l.cultivar);
    else g.unnamed += l.qty;
    g.text = [name, prop, l.organic === true ? "økologisk" : ""].filter(Boolean).join(", ");
    groups.set(key, g);
  }
  const out = [...groups.values()].map((g) => {
    const named = g.cultivars.size > 1 ? `${g.cultivars.size} sorter` : g.cultivars.size === 1 ? [...g.cultivars][0] : "";
    const sorter = named && g.unnamed ? `, ${named} + ${stk(g.unnamed)} usorteret` : named ? `, ${named}` : "";
    return { text: `${g.text}${sorter}: ${stk(g.qty)} stk.`, qty: g.qty, amount: round2(g.amount) };
  });
  const t = offerTotals(o);
  if (t.discount > 0) out.push({ text: `Rabat ${pct(o.discountPct ?? 0)} %`, qty: 1, amount: -t.discount });
  return out;
}

/** What to order from each nursery when the client signs (internal). */
export function purchaseList(o: OfferLike) {
  const bySupplier = new Map<string, { supplierId: string; lines: any[]; totalCostDkk: number }>();
  for (const l of o.lines) {
    if (!(l.qty > 0)) continue;
    const listed = l.priceSource === "sales" ? l.pricing?.listedSupplier : undefined;
    const ref = l.pricing?.supplierId;
    // Grove's listed nursery for sales-priced lines; say so when the cost
    // shown comes from a different nursery's price list.
    const supplierId =
      (listed && ref && listed !== ref ? `${listed} (Grove list; cost from ${ref})` : listed) ??
      ref ??
      (l.priceSource === "manual" ? "(price set by hand: choose a supplier)" : "(no supplier price found)");
    const s = bySupplier.get(supplierId) ?? { supplierId, lines: [], totalCostDkk: 0 };
    const cost = typeof l.pricing?.unitCostDkk === "number" ? l.pricing.unitCostDkk * l.qty : 0;
    s.lines.push({
      latin: l.latin,
      cultivar: l.cultivar,
      rootstock: l.rootstock,
      size: l.size,
      organic: l.organic,
      qty: l.qty,
      costPrice: l.pricing?.costPrice,
      costCurrency: l.pricing?.costCurrency,
      supplierPriceId: l.pricing?.supplierPriceId,
    });
    s.totalCostDkk = round2(s.totalCostDkk + cost);
    bySupplier.set(supplierId, s);
  }
  return [...bySupplier.values()];
}

/** Pricebook query for a line. */
export function lineQuery(l: OfferLine, hybrid?: PlantQuery["hybrid"]): PlantQuery {
  return {
    latin: l.latin ?? "",
    hybrid,
    cultivar: l.cultivar || undefined,
    rootstock: l.rootstock || undefined,
    propagation: (l.propagation as Propagation) || undefined,
    heightMin: l.heightMin,
    heightMax: l.heightMax,
    organic: typeof l.organicRequested === "boolean" ? l.organicRequested : undefined,
  };
}

/**
 * Price a line from the pricebook unless its price was set by hand.
 * Organic left open on the line: an organic client is offered organic plants
 * (falling back to non-organic, which then needs a dispensation), others
 * non-organic; the line then records what was matched. A line that had a
 * price keeps it when the pricebook no longer has a match (flagged).
 */
export function priceLine(
  l: OfferLine,
  data: PricebookData | null,
  rates: { marginPct: number; eurDkk: number } | null,
  hybrid?: PlantQuery["hybrid"],
  clientOrganic = false,
): OfferLine {
  if (l.priceSource === "manual") return l;
  if (!data || !rates || !l.latin) return { ...l, priceSource: l.unitPrice > 0 ? l.priceSource : "none" };
  const base = lineQuery(l, hybrid);
  // Open: the client's kind first, then the other (organic plants can be sold
  // to anyone; an organic client then needs a dispensation for the line).
  let s = suggestPrice(data, base.organic === undefined ? { ...base, organic: clientOrganic } : base, rates);
  if (!s && base.organic === undefined) s = suggestPrice(data, { ...base, organic: !clientOrganic }, rates);
  if (!s) {
    if (l.unitPrice > 0 && l.priceSource !== "none") {
      return { ...l, pricing: { ...(l.pricing ?? {}), stale: true, matchNote: "not found in this pricebook version; previous price kept" } };
    }
    return { ...l, priceSource: "none", unitPrice: 0, pricing: { matchNote: "no matching price in the pricebook" } };
  }
  const salesRow = s.salesPriceId ? data.salesPrices.find((p) => p.salesPriceId === s!.salesPriceId) : undefined;
  return {
    ...l,
    nameDa: l.nameDa || salesRow?.commonNameDa || danishName(data, l, hybrid),
    organic: s.organicStatus === "organic",
    unitPrice: round5(s.unitPrice),
    priceSource: s.source,
    size: l.size || s.size,
    pricing: { ...s },
  };
}

/** Danish name from Grove's sales list for the species (any cultivar). */
function danishName(data: PricebookData, l: OfferLine, hybrid?: PlantQuery["hybrid"]) {
  const latin = (l.latin ?? "").toLowerCase();
  const genus = (hybrid?.genus ?? latin.split(" ")[0]).toLowerCase();
  const hit =
    data.salesPrices.find((p) => p.latin.toLowerCase() === latin && p.commonNameDa) ??
    data.salesPrices.find((p) => p.latin.toLowerCase() === genus && p.commonNameDa);
  return hit?.commonNameDa;
}

/** What identifies the plant on a line; changing any of these needs a new price. */
const PLANT_FIELDS = ["latin", "cultivar", "rootstock", "propagation", "size", "heightMin", "heightMax", "organicRequested"] as const;
const same = (a: unknown, b: unknown) => {
  const n = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : typeof v === "string" ? v.trim() : v);
  return n(a) === n(b);
};

/**
 * Merge lines sent by the editor with the stored ones: server-side details
 * (ids, pricing) are kept for unchanged plants; a typed price becomes a
 * manual price; a changed plant loses its old pricing (needs repricing).
 * Duplicate line ids are dropped.
 */
export function mergeLines(stored: any[], incoming: any[]) {
  const before = new Map(stored.map((l) => [String(l._id), l]));
  const seen = new Set<string>();
  return incoming.flatMap((l) => {
    const id = l._id ? String(l._id) : undefined;
    if (id && seen.has(id)) return [];
    if (id) seen.add(id);
    const old = id ? before.get(id) : undefined;
    if (!old) {
      return [{ ...l, _id: undefined, pricing: null, priceSource: l.unitPrice > 0 ? "manual" : "none" }];
    }
    const priceTyped = old.unitPrice !== l.unitPrice;
    const plantChanged = PLANT_FIELDS.some((k) => !same(old[k], l[k]));
    if (plantChanged) {
      return [{ ...l, _id: old._id, speciesId: l.latin === old.latin ? old.speciesId : undefined, pricing: null, priceSource: priceTyped ? "manual" : "none", unitPrice: priceTyped ? l.unitPrice : 0 }];
    }
    return [{
      ...l,
      _id: old._id,
      speciesId: old.speciesId,
      varietyId: old.varietyId,
      rootstockId: old.rootstockId,
      pricing: old.pricing ?? null,
      // what was matched is the server's to say, not the editor's
      organic: old.organic ?? null,
      priceSource: priceTyped ? "manual" : old.priceSource,
    }];
  });
}

export function defaultValidUntil(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + DEFAULT_VALID_DAYS);
  return d;
}

// ---- input cleaning ---------------------------------------------------------

type Cleaned<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const number = (v: unknown, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

const STATUSES = ["draft", "sent", "accepted", "declined"];

/** Fields a user may change on an offer; everything else is ignored. */
export function cleanOfferUpdate(body: any): Cleaned<Record<string, any>> {
  const errors: string[] = [];
  const out: Record<string, any> = {};
  if (body?.dineroNumber !== undefined) out.dineroNumber = text(body.dineroNumber, 50);
  if (body?.title !== undefined) out.title = text(body.title, 200);
  if (body?.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push("Unknown status");
    else out.status = body.status;
  }
  if (body?.client !== undefined) {
    const c = body.client ?? {};
    out.client = {
      name: text(c.name, 200),
      address: text(c.address, 500),
      cvr: text(c.cvr, 20),
      contactPerson: text(c.contactPerson, 200),
      email: text(c.email, 200),
      phone: text(c.phone, 50),
    };
  }
  if (body?.clientOrganic !== undefined) out.clientOrganic = body.clientOrganic === true;
  for (const k of ["offerDate", "validUntil"]) {
    if (body?.[k] !== undefined) {
      const d = new Date(body[k]);
      if (Number.isNaN(d.getTime())) errors.push(`${k} is not a date`);
      else out[k] = d;
    }
  }
  if (body?.marginPct !== undefined) {
    const m = number(body.marginPct, 0, 500);
    if (m === undefined) errors.push("Margin must be 0-500 %");
    else out.marginPct = m;
  }
  if (body?.eurDkk !== undefined) {
    const r = number(body.eurDkk, 1.01, 19.99);
    if (r === undefined) errors.push("EUR rate must be a number like 7.4");
    else out.eurDkk = r;
  }
  if (body?.discountPct !== undefined) {
    const d = number(body.discountPct, 0, 100);
    if (d === undefined) errors.push("Discount must be 0-100 %");
    else out.discountPct = d;
  }
  if (body?.terms !== undefined) {
    out.terms = {
      deliverySeason: text(body.terms?.deliverySeason, 200),
      deposit: text(body.terms?.deposit, 500),
      text: text(body.terms?.text, 5000),
    };
  }
  if (body?.notes !== undefined) out.notes = text(body.notes, 5000);
  if (body?.groveProject !== undefined) {
    if (body.groveProject === null || body.groveProject === "") out.groveProject = null;
    else if (typeof body.groveProject === "string" && /^[0-9a-f]{24}$/i.test(body.groveProject)) out.groveProject = body.groveProject;
    else errors.push("Dashboard project must be a project id");
  }
  if (body?.lines !== undefined) {
    if (!Array.isArray(body.lines) || body.lines.length > 500) errors.push("Lines must be a list (max 500)");
    else {
      out.lines = body.lines.map((l: any, i: number) => {
        const qty = number(l?.qty, 0, 10_000_000);
        const unitPrice = number(l?.unitPrice, 0, 10_000_000);
        if (qty === undefined) errors.push(`Line ${i + 1}: quantity`);
        if (unitPrice === undefined) errors.push(`Line ${i + 1}: unit price`);
        const source = ["sales", "cost+margin", "manual", "none"].includes(l?.priceSource) ? l.priceSource : "manual";
        return {
          _id: typeof l?._id === "string" && /^[0-9a-f]{24}$/i.test(l._id) ? l._id : undefined,
          latin: text(l?.latin, 200),
          nameDa: text(l?.nameDa, 200),
          cultivar: text(l?.cultivar, 200),
          rootstock: text(l?.rootstock, 200),
          propagation: text(l?.propagation, 40),
          size: text(l?.size, 100),
          heightMin: number(l?.heightMin, 0, 5000),
          heightMax: number(l?.heightMax, 0, 5000),
          organic: l?.organic === true ? true : l?.organic === false ? false : null,
          organicRequested: l?.organicRequested === true ? true : l?.organicRequested === false ? false : null,
          qty: qty ?? 0,
          unitPrice: unitPrice ?? 0,
          priceSource: source,
          discountPct: number(l?.discountPct, 0, 100) ?? 0,
          note: text(l?.note, 1000),
        };
      });
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}
