// Grove pricebook inside the app.
//
// The master copy is the private `grove-pricebook` repo (CSV files). The
// Grove team uploads those files here; each upload becomes a numbered
// version, stored in its own collection and only ever sent to grove-team.
// Pure functions (no database) so they can be tested.
import { CsvTooLargeError, parseCsvObjects } from "./csv.ts";

export const PRICEBOOK_FILES = {
  suppliers: "suppliers.csv",
  documents: "documents.csv",
  supplierPrices: "supplier_prices.csv",
  salesPrices: "sales_prices.csv",
} as const;

const REQUIRED_COLUMNS: Record<keyof typeof PRICEBOOK_FILES, string[]> = {
  suppliers: ["supplier_id", "name"],
  documents: ["doc_id", "supplier_id", "document_date"],
  supplierPrices: ["price_id", "doc_id", "supplier_id", "latin", "cultivar", "rootstock", "organic_status", "price", "currency"],
  salesPrices: ["sales_price_id", "latin", "cultivar", "rootstock", "organic_status", "price_excl_vat", "currency"],
};

/** Columns read from each file; anything else is ignored. */
const USED_COLUMNS: Record<keyof typeof PRICEBOOK_FILES, string[]> = {
  suppliers: ["supplier_id", "name", "country", "organic_certification", "price_basis", "vat_note", "order_discounts", "payment_terms"],
  documents: ["doc_id", "supplier_id", "title", "document_date", "date_basis", "season", "currency"],
  supplierPrices: ["price_id", "doc_id", "supplier_id", "latin", "common_name", "cultivar", "rootstock", "propagation", "size_raw", "container", "height_cm_min", "height_cm_max", "organic_status", "price", "currency", "vat", "unit", "available_qty", "notes"],
  salesPrices: ["sales_price_id", "season", "group", "latin", "common_name_da", "cultivar", "propagation", "rootstock", "organic_status", "height_cm_min", "height_cm_max", "form", "listed_supplier", "price_excl_vat", "price_incl_vat", "currency", "stock_status", "notes"],
};

export type Supplier = { supplierId: string; name: string; country?: string; organicCertification?: string; priceBasis?: string; vatNote?: string; orderDiscounts?: string; paymentTerms?: string };
export type PriceDocument = { docId: string; supplierId: string; title?: string; documentDate: string; dateBasis?: string; season?: string; currency?: string };
export type SupplierPrice = {
  priceId: string;
  docId: string;
  supplierId: string;
  latin: string;
  commonName?: string;
  cultivar?: string;
  rootstock?: string;
  propagation?: string;
  size?: string;
  container?: string;
  heightMin?: number;
  heightMax?: number;
  organicStatus: string;
  price: number;
  currency: string;
  vat?: string;
  unit?: string;
  availableQty?: string;
  notes?: string;
};
export type SalesPrice = {
  salesPriceId: string;
  season?: string;
  group?: string;
  latin: string;
  commonNameDa?: string;
  cultivar?: string;
  propagation?: string;
  rootstock?: string;
  organicStatus: string;
  heightMin?: number;
  heightMax?: number;
  form?: string;
  listedSupplier?: string;
  priceExclVat: number;
  priceInclVat?: number;
  currency: string;
  stockStatus?: string;
  notes?: string;
};

/** Optional settings.csv (key,value): default_margin_pct, eur_dkk. Kept in the private repo. */
export type PricebookSettings = { defaultMarginPct?: number; eurDkk?: number };

export type PricebookData = {
  settings?: PricebookSettings;
  suppliers: Supplier[];
  documents: PriceDocument[];
  supplierPrices: SupplierPrice[];
  salesPrices: SalesPrice[];
};

const CURRENCIES = ["EUR", "DKK"];

/** YYYY-MM-DD that is a real calendar date. */
export function isRealDate(v: string | undefined): boolean {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export type BuildResult = { ok: true; data: PricebookData; warnings: string[] } | { ok: false; errors: string[] };

const num = (v: string | undefined) => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const opt = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/** Parse and check the uploaded CSV files. Nothing is saved here. */
export function buildPricebook(
  files: Partial<Record<keyof typeof PRICEBOOK_FILES, string>> & { settings?: string },
): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed: Partial<Record<keyof typeof PRICEBOOK_FILES, Record<string, string>[]>> = {};

  for (const key of Object.keys(PRICEBOOK_FILES) as (keyof typeof PRICEBOOK_FILES)[]) {
    const text = files[key];
    if (typeof text !== "string" || !text.trim()) {
      errors.push(`${PRICEBOOK_FILES[key]} is missing`);
      continue;
    }
    let parsedFile: ReturnType<typeof parseCsvObjects>;
    try {
      parsedFile = parseCsvObjects(text, USED_COLUMNS[key]);
    } catch (err) {
      if (err instanceof CsvTooLargeError) {
        errors.push(`${PRICEBOOK_FILES[key]}: file too large (${err.message})`);
        continue;
      }
      throw err;
    }
    const { header, rows } = parsedFile;
    const missing = REQUIRED_COLUMNS[key].filter((c) => !header.includes(c));
    if (missing.length) errors.push(`${PRICEBOOK_FILES[key]}: missing column(s) ${missing.join(", ")}`);
    parsed[key] = rows;
  }
  if (errors.length) return { ok: false, errors };

  const suppliers: Supplier[] = parsed.suppliers!.map((r) => ({
    supplierId: r.supplier_id,
    name: r.name,
    country: opt(r.country),
    organicCertification: opt(r.organic_certification),
    priceBasis: opt(r.price_basis),
    vatNote: opt(r.vat_note),
    orderDiscounts: opt(r.order_discounts),
    paymentTerms: opt(r.payment_terms),
  }));
  const documents: PriceDocument[] = parsed.documents!.map((r) => ({
    docId: r.doc_id,
    supplierId: r.supplier_id,
    title: opt(r.title),
    documentDate: r.document_date,
    dateBasis: opt(r.date_basis),
    season: opt(r.season),
    currency: opt(r.currency),
  }));
  const supplierIds = new Set(suppliers.map((s) => s.supplierId));
  const docIds = new Set(documents.map((d) => d.docId));
  for (const d of documents) {
    if (!isRealDate(d.documentDate)) errors.push(`documents.csv: ${d.docId} has no valid document_date (YYYY-MM-DD)`);
    if (!supplierIds.has(d.supplierId)) errors.push(`documents.csv: ${d.docId} names unknown supplier ${d.supplierId}`);
  }

  const supplierPrices: SupplierPrice[] = [];
  for (const r of parsed.supplierPrices!) {
    const price = num(r.price);
    if (price === undefined) {
      warnings.push(`supplier_prices.csv: ${r.price_id} has no price; skipped`);
      continue;
    }
    if (!docIds.has(r.doc_id)) errors.push(`supplier_prices.csv: ${r.price_id} names unknown document ${r.doc_id}`);
    supplierPrices.push({
      priceId: r.price_id,
      docId: r.doc_id,
      supplierId: r.supplier_id,
      latin: r.latin,
      commonName: opt(r.common_name),
      cultivar: opt(r.cultivar),
      rootstock: opt(r.rootstock),
      propagation: opt(r.propagation),
      size: opt(r.size_raw),
      container: opt(r.container),
      heightMin: num(r.height_cm_min),
      heightMax: num(r.height_cm_max),
      organicStatus: r.organic_status || "unknown",
      price,
      currency: (r.currency || "").toUpperCase(),
      vat: opt(r.vat),
      unit: opt(r.unit),
      availableQty: opt(r.available_qty),
      notes: opt(r.notes),
    });
  }

  const salesPrices: SalesPrice[] = [];
  for (const r of parsed.salesPrices!) {
    const price = num(r.price_excl_vat);
    if (price === undefined) {
      warnings.push(`sales_prices.csv: ${r.sales_price_id} has no price; skipped`);
      continue;
    }
    if (price % 5 !== 0) warnings.push(`sales_prices.csv: ${r.sales_price_id} (${price} kr) doesn't end in 0 or 5`);
    salesPrices.push({
      salesPriceId: r.sales_price_id,
      season: opt(r.season),
      group: opt(r.group),
      latin: r.latin,
      commonNameDa: opt(r.common_name_da),
      cultivar: opt(r.cultivar),
      propagation: opt(r.propagation),
      rootstock: opt(r.rootstock),
      organicStatus: r.organic_status || "unknown",
      heightMin: num(r.height_cm_min),
      heightMax: num(r.height_cm_max),
      form: opt(r.form),
      listedSupplier: opt(r.listed_supplier),
      priceExclVat: price,
      priceInclVat: num(r.price_incl_vat),
      currency: (r.currency || "").toUpperCase(),
      stockStatus: opt(r.stock_status),
      notes: opt(r.notes),
    });
  }

  for (const p of supplierPrices) {
    if (!CURRENCIES.includes(p.currency)) errors.push(`supplier_prices.csv: ${p.priceId} has currency "${p.currency}" (use EUR or DKK)`);
  }
  for (const p of salesPrices) {
    if (p.currency !== "DKK") errors.push(`sales_prices.csv: ${p.salesPriceId} must be in DKK (is "${p.currency}")`);
  }
  const ids = new Set<string>();
  for (const p of supplierPrices) {
    if (ids.has(p.priceId)) errors.push(`supplier_prices.csv: duplicate price_id ${p.priceId}`);
    ids.add(p.priceId);
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };
  const settings: PricebookSettings = {};
  if (files.settings?.trim()) {
    try {
      for (const r of parseCsvObjects(files.settings, ["key", "value"]).rows) {
        const v = num(r.value);
        if (r.key === "default_margin_pct" && v !== undefined && v >= 0 && v <= 500) settings.defaultMarginPct = v;
        else if (r.key === "eur_dkk" && v !== undefined && v > 1 && v < 20) settings.eurDkk = v;
        else warnings.push(`settings.csv: ignored ${r.key}=${r.value}`);
      }
    } catch (err) {
      if (!(err instanceof CsvTooLargeError)) throw err;
      return { ok: false, errors: ["settings.csv: file too large"] };
    }
  }
  return {
    ok: true,
    data: { settings, suppliers, documents, supplierPrices, salesPrices },
    warnings: warnings.slice(0, 100),
  };
}

/**
 * A price from a document more than 3 years old "may be outdated". Compared
 * by calendar date: a document dated exactly 3 years ago is not outdated yet.
 */
export function isOutdated(documentDate: string | undefined, now = new Date()): boolean {
  if (!isRealDate(documentDate)) return true;
  const today = now.toISOString().slice(0, 10);
  const limit = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`;
  return documentDate! < limit;
}

// ---- matching a plant to prices --------------------------------------------

export type Propagation = "grafted" | "seedling" | "own-rooted" | "cutting";

export type PlantQuery = {
  latin: string;
  /**
   * For hybrid groups: genus and parent epithets, e.g. Castanea + [crenata,
   * sativa]. Matches pricebook names like "Castanea sativa x crenata" in any
   * order, as long as every listed parent is one of these.
   */
  hybrid?: { genus: string; parents: string[] };
  cultivar?: string;
  rootstock?: string;
  /** grafted (has a rootstock), seedling/own-rooted, or unknown. Must match when both sides say. */
  propagation?: Propagation;
  /** wanted plant height in cm; closer sizes rank higher */
  heightMin?: number;
  heightMax?: number;
  /** true: organic only; false: anything not organic; undefined: either. */
  organic?: boolean;
};

export const norm = (s: string | undefined) =>
  (s ?? "")
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[åÅ]/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const SEEDLING_WORDS = /\b(seedling|seedlings|froformeret|kimplante|zaailing)\b/g;
const rootstockName = (s: string) => norm(s).replace(SEEDLING_WORDS, "").replace(/\s+/g, " ").trim();

/**
 * Whole-name rootstock match, after dropping words like "seedling":
 * "Corylus colurna seedling" = "Corylus colurna". A list such as
 * "M106, M111, M25" matches any of its names. "Corylus" alone does not
 * match "Corylus colurna", and M111 is not MM111.
 */
export function rootstockMatches(row: string | undefined, wanted: string | undefined): boolean {
  const w = rootstockName(wanted ?? "");
  if (!w || !row) return false;
  return row
    .split(/[,;/]|\bor\b|\bog\b/i)
    .map(rootstockName)
    .some((name) => name === w);
}

/** "Castanea crenata x sativa" against genus Castanea, parents [sativa, crenata, ...]. */
export function hybridMatches(rowLatin: string, hybrid: PlantQuery["hybrid"]): boolean {
  if (!hybrid) return false;
  const parts = rowLatin.split(/\s+(?:x|×)\s+/i).map((p) => norm(p).split(" "));
  if (parts.length < 2) return false;
  const genus = norm(hybrid.genus);
  const allowed = new Set(hybrid.parents.map((p) => norm(p).split(" ").pop()!));
  const [first, ...rest] = parts;
  if (first[0] !== genus || first.length < 2) return false;
  // later parts are "sativa", "c sativa" or "castanea sativa"
  const epithets = [first[1], ...rest.map((p) => p[p.length - 1])];
  return epithets.every((e) => allowed.has(e));
}

/** How the row's species name relates to the query: 2 exact/hybrid, 1 genus-only row, 0 none. */
function latinMatch(rowLatin: string, q: PlantQuery): 0 | 1 | 2 {
  const row = norm(rowLatin);
  if (row === norm(q.latin) || hybridMatches(rowLatin, q.hybrid)) return 2;
  // Rows listed by genus only (e.g. "Castanea") fit any species of that genus.
  const genus = norm(q.hybrid?.genus ?? q.latin.split(/\s+/)[0]);
  if (row === genus && !row.includes(" ")) return 1;
  return 0;
}

const organicOk = (status: string, organic: boolean | undefined) =>
  organic === undefined ? true : organic ? status === "organic" : status !== "organic";

/** Row propagation in pricebook words → our categories. */
function rowPropagation(p: string | undefined): Propagation | undefined {
  const x = norm(p);
  if (!x) return undefined;
  if (/graft|podet|veredeld/.test(x)) return "grafted";
  if (/seed|\bfro|zaai/.test(x)) return "seedling";
  if (/cutting|stikling|stek/.test(x)) return "cutting";
  if (/own|layer|vegetativ|tissue|meristem/.test(x)) return "own-rooted";
  return undefined;
}

function propagationOk(row: Propagation | undefined, wanted: Propagation | undefined) {
  if (!row || !wanted) return true;
  if (wanted === "grafted") return row === "grafted";
  return row !== "grafted"; // seedling / own-rooted / cutting are all "not grafted"
}

/** 0 when the height ranges overlap, else the gap in cm; unknown sizes get a middling penalty. */
function heightGap(row: { heightMin?: number; heightMax?: number }, q: PlantQuery): number {
  if (q.heightMin === undefined && q.heightMax === undefined) return 0;
  const qa = q.heightMin ?? q.heightMax!;
  const qb = q.heightMax ?? q.heightMin!;
  const ra = row.heightMin ?? row.heightMax;
  const rb = row.heightMax ?? row.heightMin;
  if (ra === undefined || rb === undefined) return 50;
  if (rb < qa) return qa - rb;
  if (ra > qb) return ra - qb;
  // ranges that only touch (60-100 vs 100-150) are close, not the same size
  if ((rb === qa && ra < rb) || (ra === qb && rb > ra)) return 1;
  return 0;
}

export type Scored<T> = {
  item: T;
  score: number;
  exactCultivar: boolean;
  rootstockMatch: boolean;
  heightGap: number;
};

type Matchable = {
  latin: string;
  cultivar?: string;
  rootstock?: string;
  propagation?: string;
  organicStatus: string;
  heightMin?: number;
  heightMax?: number;
  unit?: string;
};

function matchRows<T extends Matchable>(rows: T[], q: PlantQuery): Scored<T>[] {
  const cultivar = norm(q.cultivar);
  const out: Scored<T>[] = [];
  for (const r of rows) {
    if (r.unit && r.unit !== "plant") continue; // guards, mulch and other items
    const lm = latinMatch(r.latin, q);
    if (!lm || !organicOk(r.organicStatus, q.organic)) continue;
    if (!propagationOk(rowPropagation(r.propagation), q.propagation)) continue;
    const rowCultivar = norm(r.cultivar);
    const exactCultivar = !!cultivar && rowCultivar === cultivar;
    // A named cultivar only matches rows of that cultivar; no cultivar only
    // matches rows without one (a species price, not some cultivar's).
    if (cultivar ? !exactCultivar : !!rowCultivar) continue;
    const rootstockMatch = rootstockMatches(r.rootstock, q.rootstock);
    let score = lm === 2 ? 2 : 1;
    if (exactCultivar) score += 4;
    if (rootstockMatch) score += 2;
    else if (q.rootstock && r.rootstock && rowPropagation(r.propagation) === "grafted") score -= 1;
    if (q.organic !== undefined) score += 1;
    out.push({ item: r, score, exactCultivar, rootstockMatch, heightGap: heightGap(r, q) });
  }
  return out.sort((a, b) => b.score - a.score || a.heightGap - b.heightGap || tieBreak(a.item, b.item, q));
}

/**
 * Fixed order for equally good matches, so a price never depends on the row
 * order in the files: grafted first when a cultivar or rootstock is asked
 * for (cultivars are normally grafted), else not grafted; then organic rows
 * when organic wasn't specified; then by id.
 */
function tieBreak(a: Matchable & { salesPriceId?: string; priceId?: string }, b: typeof a, q: PlantQuery): number {
  const wantGrafted = !q.propagation && !!(q.cultivar || q.rootstock);
  const g = (r: Matchable) => (rowPropagation(r.propagation) === "grafted") === wantGrafted ? 0 : 1;
  if (!q.propagation && g(a) !== g(b)) return g(a) - g(b);
  const o = (r: Matchable) => (r.organicStatus === "organic" ? 0 : 1);
  if (q.organic === undefined && o(a) !== o(b)) return o(a) - o(b);
  return String(a.salesPriceId ?? a.priceId ?? "").localeCompare(String(b.salesPriceId ?? b.priceId ?? ""));
}

export function matchSalesPrices(data: Pick<PricebookData, "salesPrices">, q: PlantQuery) {
  return matchRows(data.salesPrices, q);
}

export function matchSupplierPrices(data: Pick<PricebookData, "supplierPrices">, q: PlantQuery) {
  return matchRows(data.supplierPrices, q);
}

/** Nearest 5 kr. */
export const round5 = (kr: number) => Math.round(kr / 5) * 5;

export type PriceSuggestion = {
  unitPrice: number; // DKK excl. VAT, rounded to 5 kr
  source: "sales" | "cost+margin";
  salesPriceId?: string;
  supplierPriceId?: string;
  supplierId?: string;
  docId?: string;
  documentDate?: string;
  outdated?: boolean;
  unitCostDkk?: number;
  costCurrency?: string;
  costPrice?: number;
  /** VAT basis as printed by the supplier; vatUnclear when not clearly excl. VAT */
  vat?: string;
  vatUnclear?: boolean;
  size?: string;
  organicStatus: string;
  /** other prices that matched equally well (e.g. other sizes), so the user can check */
  alternatives: number;
  /** equally good matches have different prices: check grafted/seedling, organic or size */
  ambiguous: boolean;
  matchNote: string;
};

const vatExcluded = (vat: string | undefined) => /excl|ex\.?\s*(vat|btw|moms)|\bht\b|hors taxe|ekskl/i.test(vat ?? "");

/**
 * Price for one plant: Grove's sales price where one exists, otherwise the
 * best matching supplier price plus margin, rounded to the nearest 5 kr.
 * Among supplier prices: best match first, then current lists before ones
 * over 3 years old, then closest size, then cheapest. Supplier prices are in
 * their own currency, as printed.
 */
export function suggestPrice(
  data: PricebookData,
  q: PlantQuery,
  opts: { marginPct: number; eurDkk: number; now?: Date },
): PriceSuggestion | null {
  const sales = matchSalesPrices(data, q);
  if (sales.length) {
    const best = sales[0];
    const s = best.item;
    return {
      unitPrice: round5(s.priceExclVat),
      source: "sales",
      salesPriceId: s.salesPriceId,
      organicStatus: s.organicStatus,
      size: s.heightMin && s.heightMax ? `${s.heightMin}-${s.heightMax} cm` : undefined,
      alternatives: sales.filter((m) => m.score === best.score && m.heightGap === best.heightGap).length - 1,
      ambiguous: sales.some((m) => m.score === best.score && m.heightGap === best.heightGap && m.item.priceExclVat !== s.priceExclVat),
      matchNote: describeMatch(best, q),
    };
  }
  const docs = new Map(data.documents.map((d) => [d.docId, d]));
  const toDkk = (p: SupplierPrice) => (p.currency === "DKK" ? p.price : p.currency === "EUR" ? p.price * opts.eurDkk : NaN);
  const old = (p: SupplierPrice) => (isOutdated(docs.get(p.docId)?.documentDate, opts.now) ? 1 : 0);
  const ranked = matchSupplierPrices(data, q)
    .filter((m) => Number.isFinite(toDkk(m.item)))
    .sort(
      (a, b) =>
        b.score - a.score ||
        old(a.item) - old(b.item) ||
        a.heightGap - b.heightGap ||
        toDkk(a.item) - toDkk(b.item),
    );
  const best = ranked[0];
  if (!best) return null;
  const p = best.item;
  const cost = toDkk(p);
  const doc = docs.get(p.docId);
  return {
    unitPrice: round5(cost * (1 + opts.marginPct / 100)),
    source: "cost+margin",
    supplierPriceId: p.priceId,
    supplierId: p.supplierId,
    docId: p.docId,
    documentDate: doc?.documentDate,
    outdated: isOutdated(doc?.documentDate, opts.now),
    unitCostDkk: Math.round(cost * 100) / 100,
    costCurrency: p.currency,
    costPrice: p.price,
    vat: p.vat,
    vatUnclear: !vatExcluded(p.vat),
    size: p.size,
    organicStatus: p.organicStatus,
    alternatives: ranked.filter((m) => m.score === best.score && old(m.item) === old(p)).length - 1,
    ambiguous: ranked.some(
      (m) => m.score === best.score && old(m.item) === old(p) && m.heightGap === best.heightGap && toDkk(m.item) !== cost,
    ),
    matchNote: describeMatch(best, q),
  };
}

function describeMatch(m: Scored<{ rootstock?: string }>, q: PlantQuery) {
  const parts: string[] = [];
  parts.push(q.cultivar ? "cultivar matches" : "no cultivar (species price)");
  if (q.rootstock) parts.push(m.rootstockMatch ? "rootstock matches" : m.item.rootstock ? `listed on ${m.item.rootstock}` : "rootstock not listed");
  if (q.heightMin !== undefined || q.heightMax !== undefined) parts.push(m.heightGap === 0 ? "size matches" : "size differs");
  return parts.join(", ");
}
