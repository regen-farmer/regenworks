// Economics (B · Projects → Economics, Grove team only): pure helpers for /internal/economics.
// Grove Data's assumption files are parsed and checked here, and a scenario sent by the page is
// cleaned to what it may hold. The cash flow itself is @rw/modelling/economics/cashflow.ts.
import { parseCsvObjects } from "./csv.ts";
import type { Assumptions } from "@rw/modelling/economics/cashflow.ts";

export const ASSUMPTION_FILES = ["assumption_ranges.csv", "area_payments.csv", "frugt_baer_rules.csv", "crops.csv", "sources.csv"] as const;
export const LAND_USES = ["arable", "grass-clover", "permanent grass", "grazing", "other"] as const;
const EUR_DKK = 7.46;

type Built = { ok: true; data: { ranges: any[]; payments: any[]; fruitBerry: any[]; crops: any[]; sources: any[] }; warnings: string[] } | { ok: false; errors: string[] };

const num = (s: unknown): number | null => {
  if (typeof s !== "string" || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const text = (s: unknown, max = 300) => (typeof s === "string" ? s.trim().slice(0, max) : "");

function rows(name: string, csv: string | undefined, need: string[], errors: string[]): Record<string, string>[] {
  if (csv === undefined) return [];
  let out: Record<string, string>[];
  let header: string[];
  try {
    ({ header, rows: out } = parseCsvObjects(csv));
  } catch (e: any) {
    errors.push(`${name}: ${e?.message ?? "can't be read"}`);
    return [];
  }
  out = out.filter((r) => Object.values(r).some((v) => v !== ""));
  const missing = need.filter((c) => !header.includes(c));
  if (missing.length) errors.push(`${name}: missing column(s) ${missing.join(", ")}`);
  return out;
}

/** Grove Data's assumptions/ files → one version. A file with an error changes nothing. */
export function buildAssumptions(files: Partial<Record<(typeof ASSUMPTION_FILES)[number], string>>): Built {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!files["assumption_ranges.csv"]) errors.push("assumption_ranges.csv is needed");
  if (!files["area_payments.csv"]) errors.push("area_payments.csv is needed");
  const r = rows("assumption_ranges.csv", files["assumption_ranges.csv"], ["parameter", "crop_id", "age", "low", "likely", "high"], errors);
  const p = rows("area_payments.csv", files["area_payments.csv"], ["payment_id", "scheme", "rate", "currency"], errors);
  const f = rows("frugt_baer_rules.csv", files["frugt_baer_rules.csv"], ["crop_id", "min_plants_per_ha"], errors);
  const c = rows("crops.csv", files["crops.csv"], ["crop_id"], errors);
  const s = rows("sources.csv", files["sources.csv"], ["source_id"], errors);
  const ranges = r.flatMap((x, i) => {
    const v = [num(x.low), num(x.likely), num(x.high)];
    const age = num(x.age);
    if (!x.parameter || v.some((n) => n === null || Number.isNaN(n)) || Number.isNaN(age)) {
      errors.push(`assumption_ranges.csv row ${i + 2}: parameter and numbers low, likely, high are needed`);
      return [];
    }
    if (!(v[0]! <= v[1]! && v[1]! <= v[2]!)) warnings.push(`assumption_ranges.csv row ${i + 2} (${x.parameter} ${x.crop_id}): low ≤ likely ≤ high doesn't hold`);
    return [{ parameter: text(x.parameter, 40), crop_id: text(x.crop_id, 40), age, low: v[0], likely: v[1], high: v[2], unit: text(x.unit, 30), sources: text(x.sources, 300), note: text(x.note, 300), n_sources: num(x.n_sources) }];
  });
  const payments = p.flatMap((x, i) => {
    const rate = num(x.rate);
    if (!x.payment_id || rate === null || Number.isNaN(rate) || !["EUR", "DKK"].includes(x.currency)) {
      errors.push(`area_payments.csv row ${i + 2}: payment_id, a rate and EUR or DKK are needed`);
      return [];
    }
    return [{ payment_id: text(x.payment_id, 40), scheme: text(x.scheme, 120), scheme_da: text(x.scheme_da, 120), year: num(x.year), rate, currency: x.currency, unit: text(x.unit, 40), eligibility: text(x.eligibility, 600), source_id: text(x.source_id, 60) }];
  });
  const fruitBerry = f.flatMap((x, i) => {
    const m = num(x.min_plants_per_ha);
    if (!x.crop_id) return []; // a crop the economics doesn't model (e.g. rhubarb) has no crop id
    if (m === null || Number.isNaN(m)) {
      errors.push(`frugt_baer_rules.csv row ${i + 2}: min_plants_per_ha is needed`);
      return [];
    }
    return [{ crop_id: text(x.crop_id, 40), crop_da: text(x.crop_da, 60), min_plants_per_ha: m, grafted_required: text(x.grafted_required, 60) }];
  });
  const crops = c.map((x) => ({ crop_id: text(x.crop_id, 40), common_en: text(x.common_en, 60), common_da: text(x.common_da, 60), kind: text(x.kind, 20), product: text(x.product, 60), form_at_harvest: text(x.form_at_harvest, 40) })).filter((x) => x.crop_id);
  const sources = s.map((x) => ({ source_id: text(x.source_id, 60), type: text(x.type, 30), title: text(x.title, 300), year: num(x.year), quality: text(x.quality, 20), url: /^https?:\/\/\S+$/.test(text(x.url_or_file, 500)) ? text(x.url_or_file, 500) : "" })).filter((x) => x.source_id);
  if (errors.length) return { ok: false, errors: errors.slice(0, 30) };
  if (!files["frugt_baer_rules.csv"]) warnings.push("frugt_baer_rules.csv was not included: the fruit/berry supplement can't be checked");
  if (!ranges.some((x) => x.parameter === "opportunity_cost")) warnings.push("no opportunity_cost: what the land earns today must be set on each scenario");
  return { ok: true, data: { ranges, payments, fruitBerry, crops, sources }, warnings };
}

/** A stored version as the engine's input. */
export function toAssumptions(doc: any, eurDkk?: number | null): Assumptions {
  return {
    version: doc.version,
    eurDkk: Number.isFinite(eurDkk) && eurDkk! > 1 ? eurDkk! : EUR_DKK,
    ranges: (doc.ranges ?? []).map((x: any) => ({ ...x, age: x.age ?? null })),
    payments: doc.payments ?? [],
    fruitBerry: doc.fruitBerry ?? [],
  };
}

const nonNeg = (v: unknown, max = 1e9): number | null | undefined => {
  if (v === null || v === "") return null;
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
};
function band(v: unknown, max = 1e7): { low: number; likely: number; high: number } | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== "object") return undefined;
  const o = v as any;
  // nothing set (e.g. the stored empty band): "use the assumptions"
  if ([o.low, o.likely, o.high].every((x) => x === undefined || x === null || x === "")) return null;
  const b = [o.low, o.likely, o.high].map((x) => nonNeg(x, max));
  if (b.some((x) => x === undefined || x === null)) return undefined;
  const [low, likely, high] = b as number[];
  return low <= likely && likely <= high ? { low, likely, high } : undefined;
}
const ID = /^[a-f0-9]{24}$/i;
const CROP = /^[a-z_]{2,40}$/;
const PAY = /^[a-z0-9-]{2,40}$/;

type Clean = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

/** What the page may change on a scenario; anything else is ignored. Farm and fields are checked by the route. */
export function cleanScenario(body: any): Clean {
  const out: Record<string, unknown> = {};
  if (body?.name !== undefined) {
    const n = text(body.name, 120);
    if (!n) return { ok: false, error: "A name is needed" };
    out.name = n;
  }
  if (body?.notes !== undefined) out.notes = text(body.notes, 4000);
  if (body?.farm !== undefined) {
    if (typeof body.farm !== "string" || !ID.test(body.farm)) return { ok: false, error: "Invalid farm" };
    out.farm = body.farm;
  }
  if (body?.groveProject !== undefined) out.groveProject = typeof body.groveProject === "string" && ID.test(body.groveProject) ? body.groveProject : null;
  if (body?.fields !== undefined) {
    if (!Array.isArray(body.fields) || body.fields.length > 50) return { ok: false, error: "Fields must be a list (at most 50)" };
    const seen = new Set<string>();
    const fields = [];
    for (const f of body.fields) {
      if (!f || typeof f.layer !== "string" || !ID.test(f.layer) || seen.has(f.layer)) return { ok: false, error: "Invalid or repeated field" };
      seen.add(f.layer);
      const sc = typeof f.scenario === "string" && ID.test(f.scenario) ? f.scenario : null;
      const y = Number(f.plantingYear);
      fields.push({ layer: f.layer, scenario: sc, plantingYear: Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : null });
    }
    out.fields = fields;
  }
  if (body?.horizonYears !== undefined) {
    const h = Number(body.horizonYears);
    if (!Number.isInteger(h) || h < 1 || h > 60) return { ok: false, error: "Horizon: 1-60 years" };
    out.horizonYears = h;
  }
  if (body?.discountRate !== undefined) {
    const r = nonNeg(body.discountRate, 0.3);
    if (r === undefined) return { ok: false, error: "Discount rate: 0-0.3" };
    out.discountRate = r;
  }
  if (body?.crops !== undefined) {
    if (!Array.isArray(body.crops) || body.crops.length > 40) return { ok: false, error: "Crops must be a list" };
    const crops = [];
    for (const c of body.crops) {
      if (!c || typeof c.crop_id !== "string" || !CROP.test(c.crop_id)) return { ok: false, error: "Invalid crop" };
      const x: Record<string, unknown> = { crop_id: c.crop_id };
      for (const k of ["processingPerKg", "plantCost", "pruningPerPlant", "harvestPerKg", "postharvestPerKg"]) {
        const v = nonNeg(c[k], 1e5);
        if (v === undefined && c[k] !== undefined) return { ok: false, error: `${c.crop_id}: ${k} must be a number ≥ 0` };
        if (v !== undefined) x[k] = v;
      }
      for (const k of ["replacementRate", "processingLoss"]) {
        const v = nonNeg(c[k], 1);
        if (v === undefined && c[k] !== undefined) return { ok: false, error: `${c.crop_id}: ${k} must be 0-1` };
        if (v !== undefined) x[k] = v;
      }
      if (c.price !== undefined) {
        const b = band(c.price, 1e5);
        if (b === undefined) return { ok: false, error: `${c.crop_id}: price needs low ≤ likely ≤ high` };
        x.price = b;
      }
      x.form = text(c.form, 60);
      x.channel = text(c.channel, 80);
      if (typeof c.valueChainLine === "string") x.valueChainLine = text(c.valueChainLine, 60);
      crops.push(x);
    }
    out.crops = crops;
  }
  for (const k of ["establishment", "management"] as const) {
    if (body?.[k] === undefined) continue;
    const keys = k === "establishment" ? ["sitePrepPerHa", "plantingPerPlant", "protectionPerPlant", "irrigationPerHa", "fencingTotal", "other"] : ["mowingPerHa", "otherPerYear"];
    const o: Record<string, number | null> = {};
    for (const key of keys) {
      const v = nonNeg(body[k]?.[key], 1e8);
      if (v === undefined && body[k]?.[key] !== undefined) return { ok: false, error: `${k}: ${key} must be a number ≥ 0` };
      if (v !== undefined) o[key] = v;
    }
    out[k] = o;
  }
  if (body?.baseline !== undefined) {
    const b = body.baseline ?? {};
    const opp = b.opportunityPerHa === undefined ? null : band(b.opportunityPerHa, 1e6);
    if (opp === undefined) return { ok: false, error: "What the land earns today needs low ≤ likely ≤ high" };
    const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && PAY.test(x)))].slice(0, 20) : []);
    out.baseline = {
      landUse: (LAND_USES as readonly string[]).includes(b.landUse) ? b.landUse : "other",
      opportunityPerHa: opp,
      organic: b.organic === true,
      paymentsToday: ids(b.paymentsToday),
      paymentsWithTrees: Array.isArray(b.paymentsWithTrees) ? ids(b.paymentsWithTrees) : null,
    };
  }
  return { ok: true, value: out };
}

/** The widest distance between neighbouring tree rows in a design (m), centre to centre: the layout puts
 *  row i+1 (w_i + w_i+1)/2 from row i and repeats the pattern. Offsets run along the row (field edge to
 *  the first and last tree), so they don't count. */
export function maxRowSpacing(design: { rows?: { width?: number }[] } | null | undefined): number | null {
  const w = (design?.rows ?? []).map((r) => Number(r.width) || 0).filter((x) => x > 0);
  if (!w.length) return null;
  if (w.length === 1) return w[0];
  return Math.max(...w.map((x, i) => (x + w[(i + 1) % w.length]) / 2));
}
