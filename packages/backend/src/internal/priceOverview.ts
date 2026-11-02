// Price overview for the Pricebook page (pure, tested): per product, Grove's
// sales prices next to every supplier cost, each traced to its supplier,
// price list, date and source file. Grove team only.
import { compareSpecs, specKey, type ProductSpec } from "@rw/db/productSpec.ts";
import { isOutdated, isOwnProduct, norm, priceFromRow, rowPropagation, salesSpec, supplierSpec, vatExcluded, type PricebookData, type SupplierPrice } from "./pricebook.ts";
import { priceService } from "./services.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A group: same species (or name) and cultivar. Inside it, each product
 * (rootstock, propagation, organic, bare root/container, production years;
 * see @rw/db/productSpec.ts) is its own row, so a hazel on colurna is never
 * priced against an own-rooted one.
 */
export function productKey(r: { latin?: string; commonName?: string; cultivar?: string }) {
  const name = norm(r.latin) || norm(r.commonName);
  return [name, norm(r.cultivar)].join("|");
}

/** Do two sizes describe the same plants? Height ranges overlap, or the same size text. */
function sameSize(a: { heightMin?: number; heightMax?: number; size?: string }, b: { heightMin?: number; heightMax?: number; size?: string }) {
  if (a.heightMin !== undefined && a.heightMax !== undefined && b.heightMin !== undefined && b.heightMax !== undefined) return a.heightMin <= b.heightMax && b.heightMin <= a.heightMax;
  return !!a.size && !!b.size && norm(a.size) === norm(b.size);
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
    sales: any[];
    costs: any[];
  };
  const products = new Map<string, Product>();
  const get = (r: { latin?: string; commonName?: string; cultivar?: string }) => {
    const key = productKey(r);
    let p = products.get(key);
    if (!p) {
      p = { key, latin: r.latin || "", name: r.commonName, cultivar: r.cultivar, sales: [], costs: [] };
      products.set(key, p);
    }
    if (!p.name && r.commonName) p.name = r.commonName;
    return p;
  };

  for (const r of data.supplierPrices) {
    if (!matches(r.latin, r.commonName, r.cultivar, r.rootstock)) continue;
    const dkk = toDkk(r, opts.eurDkk);
    const spec = supplierSpec(r);
    get(r).costs.push({
      spec,
      specKey: specKey(spec),
      priceId: r.priceId,
      supplierId: r.supplierId,
      rootstock: r.rootstock,
      propagation: rowPropagation(r.propagation),
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
    const row = ref?.supplierPriceId ? data.supplierPrices.find((x) => x.priceId === ref.supplierPriceId) : undefined;
    const sizeOk = row ? sameSize({ heightMin: s.heightMin, heightMax: s.heightMax }, row) : false;
    const organicOk = row ? row.organicStatus === s.organicStatus : false;
    const spec = salesSpec(s);
    const vs = row ? compareSpecs(spec, supplierSpec(row)) : null;
    get({ ...s, commonName: s.commonNameDa }).sales.push({
      spec,
      specKey: specKey(spec),
      own: isOwnProduct(s),
      salesPriceId: s.salesPriceId,
      rootstock: s.rootstock,
      propagation: rowPropagation(s.propagation),
      size: s.heightMin && s.heightMax ? `${s.heightMin}-${s.heightMax} cm` : s.form,
      heightMin: s.heightMin,
      heightMax: s.heightMax,
      organicStatus: s.organicStatus,
      priceExclVat: s.priceExclVat,
      priceInclVat: s.priceInclVat,
      listedSupplier: s.listedSupplier,
      stockStatus: s.stockStatus,
      notes: s.notes,
      // the closest supplier price; it may differ in size or organic status, which makes the margin approximate
      costReference:
        typeof cost === "number" && row
          ? {
              unitCostDkk: cost,
              supplierPriceId: row.priceId,
              supplierName: suppliers.get(row.supplierId)?.name ?? row.supplierId,
              size: row.size,
              organicStatus: row.organicStatus,
              vatUnclear: !vatExcluded(row.vat),
              outdated: source(row.docId, row.supplierId).outdated,
              sameSize: sizeOk,
              sameOrganic: organicOk,
              // the product itself: rootstock, propagation, form, years
              sameProduct: !!vs?.same,
              differs: vs?.differs ?? [],
              unknown: vs?.unknown ?? [],
              exact: sizeOk && organicOk && vatExcluded(row.vat) && !!vs?.exact,
            }
          : null,
      marginPct: typeof cost === "number" && s.priceExclVat > 0 ? round2(((s.priceExclVat - cost) / s.priceExclVat) * 100) : null,
      source: source(s.docId, "grove"),
    });
  }

  /**
   * Products inside a group: one per distinct spec among its sales prices
   * and supplier prices. Each gets its own costs, and for its sales prices
   * the costs that could be the same product (fields both state agree), so
   * margins are only ever against the right rootstock, form and age.
   */
  const productsOf = (p: Product) => {
    const keys = new Map<string, ProductSpec>();
    for (const x of [...p.sales, ...p.costs]) if (!keys.has(x.specKey)) keys.set(x.specKey, x.spec);
    return [...keys.entries()].map(([key, spec]) => {
      const sales = p.sales.filter((x) => x.specKey === key);
      const own = p.costs.filter((x) => x.specKey === key);
      const compatible = p.costs.filter((c) => compareSpecs(spec, c.spec).same);
      const priced = (xs: any[]) => xs.map((c) => c.unitCostDkk).filter((n: unknown): n is number => typeof n === "number");
      const forMargin = priced(compatible);
      const cmin = forMargin.length ? Math.min(...forMargin) : undefined;
      const cmax = forMargin.length ? Math.max(...forMargin) : undefined;
      const exactCosts = compatible.filter((c) => compareSpecs(spec, c.spec).exact);
      return {
        key,
        spec,
        sales: sales.map((x) => x.salesPriceId),
        costs: own.map((x) => x.priceId),
        compatibleCosts: compatible.map((x) => x.priceId),
        summary: {
          costPoints: own.length,
          compatiblePoints: compatible.length,
          exactPoints: exactCosts.length,
          costMin: cmin,
          costMax: cmax,
          salesMin: sales.length ? Math.min(...sales.map((x) => x.priceExclVat)) : undefined,
          salesMax: sales.length ? Math.max(...sales.map((x) => x.priceExclVat)) : undefined,
          // worst and best margin of its sales prices against the costs that fit
          marginLow: sales.length && cmax !== undefined ? round2(Math.min(...sales.map((x) => ((x.priceExclVat - cmax) / x.priceExclVat) * 100))) : null,
          marginHigh: sales.length && cmin !== undefined ? round2(Math.max(...sales.map((x) => ((x.priceExclVat - cmin) / x.priceExclVat) * 100))) : null,
          approx: compatible.length > exactCosts.length,
        },
      };
    });
  };

  const list = [...products.values()].map((p) => {
    const costs = p.costs.map((c) => c.unitCostDkk).filter((x): x is number => typeof x === "number");
    const sales = p.sales.map((x) => x.priceExclVat);
    const min = costs.length ? Math.min(...costs) : undefined;
    const max = costs.length ? Math.max(...costs) : undefined;
    p.costs.sort((a, b) => (a.unitCostDkk ?? Infinity) - (b.unitCostDkk ?? Infinity));
    return {
      ...p,
      products: productsOf(p).sort((a, b) => b.sales.length - a.sales.length || b.costs.length - a.costs.length || a.key.localeCompare(b.key)),
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
