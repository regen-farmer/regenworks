// Forward-order supply (pure, tested): plants promised in forward orders
// against what Grove can deliver, per exact product (species, cultivar,
// rootstock, propagation, organic, bare root/container, production years) and
// season: own production at the expected take rate plus supplier capacity.
// Stock is only looked at for orders (A); designs (B) ignore it. Grove team only.
import { cleanYears, compareSpecs, defaultYears, FORMS, missingFields, PROPAGATIONS, specKey, specLabel, type ProductSpec } from "@rw/db/productSpec.ts";
import { norm, rowPropagation } from "./pricebook.ts";
import { isService, type OfferLike } from "./offers.ts";
import { danishDay } from "./services.ts";

/**
 * One label for a season typed in Danish or English, any case: "efterår 2027",
 * "Autumn 2027", "høst 27" → "Autumn 2027"; "forår 2027" → "Spring 2027".
 * Undefined when it can't be read.
 */
export function seasonLabel(text: string | undefined): string | undefined {
  const t = (text ?? "").toLowerCase();
  const autumn = /(efter[aå]r|efteraar|autumn|fall|h[øo]st)/.test(t);
  const spring = /(for[aå]r|foraar|spring)/.test(t);
  const y = t.match(/\b(20\d{2}|\d{2})\b/);
  if (autumn === spring || !y) return undefined;
  const year = y[1].length === 2 ? 2000 + Number(y[1]) : Number(y[1]);
  return `${autumn ? "Autumn" : "Spring"} ${year}`;
}

/** A season from the delivery date (Jul–Dec: autumn; Jan–Jun: spring) or the season text. */
export function seasonOf(terms: { deliveryDate?: Date | string | null; deliverySeason?: string } | undefined): string {
  const d = terms?.deliveryDate ? new Date(terms.deliveryDate) : null;
  if (d && !Number.isNaN(d.getTime())) {
    const [y, m] = danishDay(d).split("-").map(Number);
    return `${m >= 7 ? "Autumn" : "Spring"} ${y}`;
  }
  const text = terms?.deliverySeason?.trim();
  return seasonLabel(text) ?? (text || "No season set");
}

/** Species key: genus + species, so cultivars and rootstocks of one species share supply ("x"/"×" hybrid marks skipped). */
export const speciesKey = (latin: string | undefined) =>
  norm(latin)
    .split(" ")
    .filter((w) => w && w !== "x" && w !== "×")
    .slice(0, 2)
    .join(" ");

export type SupplyRow = ProductSpec & {
  /** species, as Latin (genus species) */
  latin: string;
  season: string;
  /** own production: grafts made or seedlings sown */
  ownGrafts?: number;
  takePct?: number;
  suppliers?: { name: string; qty: number }[];
  note?: string;
};

type SupplyOffer = OfferLike & { _id?: unknown; title?: string; client?: { name?: string }; status: string };

/** The product a forward-order line sells (organic: what was matched, else what was asked for). */
const lineSpec = (l: any): ProductSpec => ({
  latin: l.latin,
  cultivar: l.cultivar,
  rootstock: l.rootstock,
  propagation: rowPropagation(l.propagation) ?? l.propagation,
  organic: typeof l.organic === "boolean" ? l.organic : typeof l.organicRequested === "boolean" ? l.organicRequested : undefined,
  form: l.form,
  years: cleanYears(l.years),
});

const rowKey = (spec: ProductSpec, season: string) => `${specKey(spec)}#${season}`;
const speciesSeason = (latin: string | undefined, season: string) => `${speciesKey(latin)}#${season}`;

/**
 * Forward-order demand per exact product and season (see @rw/db/productSpec.ts):
 * signed (accepted) and likely (sent or draft); declined offers left out.
 * Each row lists what its lines leave unspecified (e.g. rootstock), since
 * those can't be matched to supply exactly.
 */
export function forwardDemand(offers: SupplyOffer[]) {
  const groups = new Map<string, { key: string; spec: ProductSpec; latin: string; name?: string; season: string; signed: number; likely: number; missing: string[]; offers: any[] }>();
  for (const o of offers) {
    if (!o.terms?.forwardOrder || o.status === "declined") continue;
    const season = seasonOf(o.terms as any);
    for (const l of o.lines) {
      if (isService(l) || !(l.qty > 0) || !l.latin) continue;
      const spec = lineSpec(l);
      const key = rowKey(spec, season);
      const g = groups.get(key) ?? { key, spec, latin: l.latin, name: l.nameDa, season, signed: 0, likely: 0, missing: missingFields(spec), offers: [] };
      if (o.status === "accepted") g.signed += l.qty;
      else g.likely += l.qty;
      if (!g.offers.some((x) => String(x._id) === String(o._id))) g.offers.push({ _id: o._id, title: o.title, client: o.client?.name, status: o.status });
      g.name ??= l.nameDa;
      groups.set(key, g);
    }
  }
  return [...groups.values()];
}

/** Cleaned supply plan: one row per exact product and season. */
export function cleanSupplyPlan(body: any): { ok: true; value: SupplyRow[] } | { ok: false; error: string } {
  if (!Array.isArray(body?.rows) || body.rows.length > 300) return { ok: false, error: "Send rows (max 300)" };
  const out: SupplyRow[] = [];
  const seen = new Map<string, number>();
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined) || undefined;
  for (const [i, r] of body.rows.entries()) {
    const latin = t(r?.latin, 100) ?? "";
    const typed = t(r?.season, 40) ?? "";
    if (!latin || !typed) return { ok: false, error: `Row ${i + 1}: species and season are needed` };
    const season = seasonLabel(typed);
    if (!season) return { ok: false, error: `Row ${i + 1}: write the season as e.g. "Autumn 2027" or "Forår 2028"` };
    if (r.propagation !== undefined && r.propagation !== "" && r.propagation !== null && !(PROPAGATIONS as readonly unknown[]).includes(r.propagation)) return { ok: false, error: `Row ${i + 1}: propagation` };
    if (r.form !== undefined && r.form !== "" && r.form !== null && !(FORMS as readonly unknown[]).includes(r.form)) return { ok: false, error: `Row ${i + 1}: bare root or container` };
    if (r.organic !== undefined && r.organic !== null && typeof r.organic !== "boolean") return { ok: false, error: `Row ${i + 1}: organic must be yes or no` };
    if (r.years !== undefined && r.years !== null && r.years !== "" && !cleanYears(r.years)) return { ok: false, error: `Row ${i + 1}: production years as e.g. 1+1 or 1` };
    const spec: ProductSpec = {
      latin,
      cultivar: t(r.cultivar, 100),
      rootstock: r.propagation === "grafted" || !r.propagation ? t(r.rootstock, 100) : undefined,
      propagation: (r.propagation || undefined) as ProductSpec["propagation"],
      organic: typeof r.organic === "boolean" ? r.organic : undefined,
      form: (r.form || undefined) as ProductSpec["form"],
      // Grove's own: grafted 1+1, seedlings 1, unless stated
      years: cleanYears(r.years) ?? defaultYears(r.propagation),
    };
    const key = rowKey(spec, season);
    if (seen.has(key)) return { ok: false, error: `Row ${i + 1}: ${specLabel(spec)}, ${season} is already in the plan (row ${seen.get(key)}); put both in one row` };
    seen.set(key, i + 1);
    const n = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : typeof v === "number" || typeof v === "string" ? Number(v) : Number.NaN);
    const ownGrafts = n(r.ownGrafts);
    const takePct = n(r.takePct);
    if (ownGrafts !== undefined && !(Number.isInteger(ownGrafts) && ownGrafts >= 0 && ownGrafts <= 10_000_000)) return { ok: false, error: `Row ${i + 1}: own production must be whole plants` };
    if (takePct !== undefined && !(takePct >= 0 && takePct <= 100)) return { ok: false, error: `Row ${i + 1}: take % must be 0-100` };
    if (r.suppliers !== undefined && (!Array.isArray(r.suppliers) || r.suppliers.length > 20)) return { ok: false, error: `Row ${i + 1}: suppliers` };
    const suppliers: { name: string; qty: number }[] = [];
    for (const s of r.suppliers ?? []) {
      const name = t(s?.name, 100) ?? "";
      const qty = typeof s?.qty === "number" || typeof s?.qty === "string" ? Number(s.qty) : Number.NaN;
      if (!name || !(Number.isInteger(qty) && qty >= 0 && qty <= 10_000_000)) return { ok: false, error: `Row ${i + 1}: each supplier needs a name and a whole number of plants` };
      suppliers.push({ name, qty });
    }
    out.push({ ...spec, latin, season, ownGrafts, takePct, suppliers, note: t(r.note, 500) });
  }
  return { ok: true, value: out };
}

/**
 * Demand against supply per product and season. An order counts against a
 * planned product when they could be the same product: every field both
 * state agrees, and a field only one of them states (e.g. an older order
 * line without production years) is allowed but listed as "not stated".
 * An order that fits several planned products isn't counted against any of
 * them (say which on the order line). Per species and season, the totals
 * show where one product is short and another has plants to spare (a
 * substitute is a decision made on the order, not here).
 */
export function supplyBalance(offers: SupplyOffer[], plan: SupplyRow[]) {
  const demand = forwardDemand(offers);
  const planned = plan.map((p) => ({ key: rowKey(p, p.season), p, spec: { latin: p.latin, cultivar: p.cultivar, rootstock: p.rootstock, propagation: p.propagation, organic: p.organic, form: p.form, years: p.years } as ProductSpec, demand: [] as { d: (typeof demand)[number]; unknown: string[] }[] }));
  const loose: { d: (typeof demand)[number]; candidates: number }[] = [];
  for (const d of demand) {
    const fits = planned.filter((x) => x.p.season === d.season).map((x) => ({ x, cmp: compareSpecs(d.spec, x.spec) })).filter((f) => f.cmp.same);
    // the exact one wins when there is one
    const exact = fits.filter((f) => f.cmp.exact);
    const pick = exact.length === 1 ? exact : fits;
    // "not stated" means the order line doesn't say (not the plan row)
    const lineLacks = (f: string) => {
      const v = (d.spec as Record<string, unknown>)[f];
      return v === undefined || v === null || v === "";
    };
    if (pick.length === 1) pick[0].x.demand.push({ d, unknown: pick[0].cmp.unknown.filter(lineLacks) });
    else loose.push({ d, candidates: pick.length });
  }
  const supplyOf = (p?: SupplyRow) => {
    const own = Math.floor(((p?.ownGrafts ?? 0) * (p?.takePct ?? 0)) / 100);
    const bought = (p?.suppliers ?? []).reduce((n, x) => n + x.qty, 0);
    return { own, available: own + bought };
  };
  const rows = [
    ...planned.map(({ key, p, spec, demand: ds }) => {
      const { own, available } = supplyOf(p);
      const signed = ds.reduce((n, x) => n + x.d.signed, 0);
      const likely = ds.reduce((n, x) => n + x.d.likely, 0);
      return {
        key,
        group: speciesSeason(p.latin, p.season),
        spec,
        label: specLabel(spec),
        latin: p.latin,
        name: ds.find((x) => x.d.name)?.d.name,
        season: p.season,
        signed,
        likely,
        ownGrafts: p.ownGrafts ?? 0,
        takePct: p.takePct ?? null,
        ownExpected: own,
        suppliers: p.suppliers ?? [],
        available,
        afterSigned: available - signed,
        afterLikely: available - signed - likely,
        planned: true,
        // what the plan row itself leaves open (e.g. a row saved before products were specified)
        planMissing: missingFields(spec),
        // fields the matched orders don't state
        missing: [...new Set(ds.flatMap((x) => x.unknown))],
        candidates: 0,
        offers: dedupeOffers(ds.flatMap((x) => x.d.offers)),
        note: p.note,
      };
    }),
    ...loose.map(({ d, candidates }) => ({
      key: d.key,
      group: speciesSeason(d.latin, d.season),
      spec: d.spec,
      label: specLabel(d.spec),
      latin: d.latin,
      name: d.name,
      season: d.season,
      signed: d.signed,
      likely: d.likely,
      ownGrafts: 0,
      takePct: null as number | null,
      ownExpected: 0,
      suppliers: [] as { name: string; qty: number }[],
      available: 0,
      afterSigned: -d.signed,
      afterLikely: -d.signed - d.likely,
      planned: false,
      planMissing: [] as string[],
      missing: d.missing,
      candidates,
      offers: d.offers,
      note: undefined as string | undefined,
    })),
  ].sort((a, b) => a.season.localeCompare(b.season) || a.label.localeCompare(b.label));
  const species = new Map<string, { group: string; latin: string; season: string; signed: number; likely: number; available: number; products: number }>();
  for (const r of rows) {
    const k = r.group;
    const x = species.get(k) ?? { group: k, latin: r.latin.split(" ").slice(0, 2).join(" "), season: r.season, signed: 0, likely: 0, available: 0, products: 0 };
    x.signed += r.signed;
    x.likely += r.likely;
    x.available += r.available;
    x.products += 1;
    species.set(k, x);
  }
  return {
    rows,
    species: [...species.values()].map((x) => ({ ...x, afterSigned: x.available - x.signed, afterLikely: x.available - x.signed - x.likely })).sort((a, b) => a.season.localeCompare(b.season) || a.latin.localeCompare(b.latin)),
  };
}

function dedupeOffers(list: any[]) {
  const seen = new Set<string>();
  return list.filter((o) => {
    const k = String(o._id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
