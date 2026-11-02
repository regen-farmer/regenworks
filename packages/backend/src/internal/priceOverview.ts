// Price overview for the Pricebook page (pure, tested): per product, Grove's
// sales prices next to every supplier cost, each traced to its supplier,
// price list, date and source file. Grove team only.
import { isOutdated, norm, priceFromRow, rowPropagation, vatExcluded, type PricebookData, type SupplierPrice } from "./pricebook.ts";
import { priceService } from "./services.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A product: same species, cultivar, rootstock and plant type (sizes and organic status vary inside). */
export function productKey(r: { latin?: string; commonName?: string; cultivar?: string; rootstock?: string; propagation?: string }) {
  const name = norm(r.latin) || norm(r.commonName);
  return [name, norm(r.cultivar), norm(r.rootstock), rowPropagation(r.propagation) ?? ""].join("|");
}

/** Supplier price in DKK as printed (no VAT added or removed); NaN for unknown currencies. */
export const toDkk = (p: Pick<SupplierPrice, "price" | "currency">, eurDkk: number) =>
  p.currency === "DKK" ? p.price : p.currency === "EUR" ? p.price * eurDkk : Number.NaN;

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type OverviewSource = { docId?: string; title?: string; file?: string; documentDate?: string; outdated: boolean; supplierName?: string };

export function priceOverview(data: PricebookData, opts: { eurDkk: number; q?: string; now?: Date }) {
  const docs = new Map(data.documents.map((d) => [d.docId, d]));
  const suppliers = new Map(data.suppliers.map((s) => [s.supplierId, s]));
  const source = (docId: string | undefined, supplierId?: string): OverviewSource => {
    const d = docId ? docs.get(docId) : undefined;
    return {
      docId,
      title: d?.title,
      file: d?.file,
      documentDate: d?.documentDate,
      outdated: isOutdated(d?.documentDate, opts.now),
      supplierName: suppliers.get(supplierId ?? d?.supplierId ?? "")?.name ?? supplierId,
    };
  };
  const words = norm(opts.q).split(" ").filter(Boolean);
  const matches = (...texts: (string | undefined)[]) => {
    if (!words.length) return true;
    const hay = norm(texts.filter(Boolean).join(" "));
    return words.every((w) => hay.includes(w));
  };

  type Product = {
    key: string;
    latin: string;
    name?: string;
    cultivar?: string;
    rootstock?: string;
    propagation?: string;
    sales: any[];
    costs: any[];
  };
  const products = new Map<string, Product>();
  const get = (r: { latin?: string; commonName?: string; cultivar?: string; rootstock?: string; propagation?: string }) => {
    const key = productKey(r);
    let p = products.get(key);
    if (!p) {
      p = { key, latin: r.latin || "", name: r.commonName, cultivar: r.cultivar, rootstock: r.rootstock, propagation: rowPropagation(r.propagation), sales: [], costs: [] };
      products.set(key, p);
    }
    if (!p.name && r.commonName) p.name = r.commonName;
    return p;
  };

  for (const r of data.supplierPrices) {
    if (!matches(r.latin, r.commonName, r.cultivar, r.rootstock)) continue;
    const dkk = toDkk(r, opts.eurDkk);
    get(r).costs.push({
      priceId: r.priceId,
      supplierId: r.supplierId,
      size: r.size,
      heightMin: r.heightMin,
      heightMax: r.heightMax,
      organicStatus: r.organicStatus,
      unit: r.unit,
      price: r.price,
      currency: r.currency,
      vat: r.vat,
      vatUnclear: !vatExcluded(r.vat),
      unitCostDkk: Number.isFinite(dkk) ? round2(dkk) : null,
      availableQty: r.availableQty,
      notes: r.notes,
      source: source(r.docId, r.supplierId),
    });
  }
  for (const s of data.salesPrices) {
    if (!matches(s.latin, s.commonNameDa, s.cultivar, s.rootstock)) continue;
    // the cost the offer builder uses for this sales price (closest size, organic as listed)
    const ref = priceFromRow(data, { kind: "sales", id: s.salesPriceId }, { marginPct: 0, eurDkk: opts.eurDkk, now: opts.now });
    const cost = ref?.unitCostDkk;
    get({ ...s, commonName: s.commonNameDa }).sales.push({
      salesPriceId: s.salesPriceId,
      size: s.heightMin && s.heightMax ? `${s.heightMin}-${s.heightMax} cm` : s.form,
      heightMin: s.heightMin,
      heightMax: s.heightMax,
      organicStatus: s.organicStatus,
      priceExclVat: s.priceExclVat,
      priceInclVat: s.priceInclVat,
      listedSupplier: s.listedSupplier,
      stockStatus: s.stockStatus,
      notes: s.notes,
      costReference: typeof cost === "number" ? { unitCostDkk: cost, supplierPriceId: ref?.supplierPriceId, supplierId: ref?.supplierId, size: ref?.size } : null,
      marginPct: typeof cost === "number" && s.priceExclVat > 0 ? round2(((s.priceExclVat - cost) / s.priceExclVat) * 100) : null,
      source: source(s.docId, "grove"),
    });
  }

  const list = [...products.values()].map((p) => {
    const costs = p.costs.map((c) => c.unitCostDkk).filter((x): x is number => typeof x === "number");
    const sales = p.sales.map((x) => x.priceExclVat);
    const min = costs.length ? Math.min(...costs) : undefined;
    const max = costs.length ? Math.max(...costs) : undefined;
    p.costs.sort((a, b) => (a.unitCostDkk ?? Infinity) - (b.unitCostDkk ?? Infinity));
    return {
      ...p,
      summary: {
        costPoints: p.costs.length,
        suppliers: new Set(p.costs.map((c) => c.supplierId)).size,
        costMin: min,
        costMedian: costs.length ? round2(median(costs)!) : undefined,
        costMax: max,
        salesMin: sales.length ? Math.min(...sales) : undefined,
        salesMax: sales.length ? Math.max(...sales) : undefined,
        outdated: p.costs.filter((c) => c.source.outdated).length,
        vatUnclear: p.costs.filter((c) => c.vatUnclear).length,
      },
    };
  });
  list.sort((a, b) => (a.latin || a.name || "").localeCompare(b.latin || b.name || "") || (a.cultivar ?? "").localeCompare(b.cultivar ?? ""));

  const settings = data.settings ?? {};
  const services = (data.services ?? [])
    .filter((s) => matches(s.nameDa, s.nameEn, s.section, s.serviceId))
    .map((s) => {
      const p = priceService(s, { eurDkk: opts.eurDkk, supplierPrices: data.supplierPrices, documents: data.documents, defaultMarginPct: settings.targetMarginServices, now: opts.now });
      const sup = p?.supplierPriceId ? data.supplierPrices.find((x) => x.priceId === p.supplierPriceId) : undefined;
      const margin = (c: number | undefined) => (p && typeof c === "number" && p.unitPrice > 0 ? round2(((p.unitPrice - c) / p.unitPrice) * 100) : null);
      return {
        ...s,
        unitPrice: p?.unitPrice ?? null,
        priceSource: p?.source ?? "none",
        costLow: p?.costLow,
        costLikely: p?.unitCostDkk,
        costHigh: p?.costHigh,
        marginPct: margin(p?.unitCostDkk),
        worstMarginPct: margin(p?.costHigh),
        targetMarginPct: p?.targetMarginPct,
        vatUnclear: p?.vatUnclear,
        // where the cost comes from: a supplier row (with its price list) or services.csv itself
        source: sup ? { ...source(sup.docId, sup.supplierId), priceId: sup.priceId, price: sup.price, currency: sup.currency } : { title: "services.csv (Grove's own figures)", outdated: false },
      };
    });

  return { products: list, services, eurDkk: opts.eurDkk, targets: { trees: settings.targetMarginTrees, services: settings.targetMarginServices } };
}
