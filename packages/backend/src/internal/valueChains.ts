// Value chains (Library): the equipment catalogue imported from the private
// grove-data repo (equipment/equipment.csv) and the processing lines drawn on
// the Value chains page. Both are kept in grove_settings; the flow itself is
// run in the browser (packages/modelling/valuechain/flow.ts).
import { parseCsvObjects } from "./csv.ts";

export const CATEGORIES = ["harvest", "clean-husk", "dry", "store", "grade", "crack", "press", "roast", "peel", "other"] as const;
export const MODES = ["rate", "batch", "area", "store"] as const;
export const CROPS = ["hazel", "walnut", "chestnut", "blackcurrant", "redcurrant"] as const;
const COLUMNS = [
  "equipment_id", "category", "name", "maker", "model", "crops", "input_form", "output_forms", "mode",
  "cap_low", "cap_high", "cap_unit", "batch_hours_low", "batch_hours_high", "power_kw",
  "price_low", "price_high", "currency", "price_vat", "price_basis", "observed_date", "source_title", "source_url", "notes",
] as const;
export const LIMITS = { items: 2000, lines: 100, nodes: 80, edges: 200, text: 200, notes: 1000 };

export type EquipmentItem = {
  id: string;
  category: (typeof CATEGORIES)[number];
  name: string;
  maker?: string;
  model?: string;
  crops: string[];
  inputForm?: string;
  outputForms: string[];
  mode: (typeof MODES)[number];
  capLow: number | null;
  capHigh: number | null;
  capUnit: string;
  batchHoursLow: number | null;
  batchHoursHigh: number | null;
  powerKw: number | null;
  priceLow: number | null;
  priceHigh: number | null;
  currency?: string;
  priceVat?: string;
  priceBasis?: string;
  observedDate?: string;
  sourceTitle: string;
  sourceUrl?: string;
  notes?: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const num = (s: string | undefined): number | null => {
  if (s == null || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const text = (s: unknown, max = LIMITS.text) => (typeof s === "string" ? s.trim().slice(0, max) : "");
/** Only http(s) links are kept, so a crafted row can't put a javascript: link on the page. */
export const safeUrl = (s: unknown): string | undefined => {
  const t = text(s, 500);
  return /^https?:\/\/[^\s]+$/i.test(t) ? t : undefined;
};

/** Parse equipment.csv. Rows with errors are refused with the row number, so a bad file changes nothing. */
export function parseEquipmentCsv(csv: string): Result<EquipmentItem[]> {
  let parsed;
  try {
    parsed = parseCsvObjects(csv, COLUMNS);
  } catch (e) {
    return { ok: false, error: `Can't read the file: ${(e as Error).message}` };
  }
  for (const c of ["equipment_id", "category", "name", "mode", "cap_unit", "source_title"]) {
    if (!parsed.header.includes(c)) return { ok: false, error: `equipment.csv needs a ${c} column` };
  }
  if (parsed.rows.length > LIMITS.items) return { ok: false, error: `More than ${LIMITS.items} rows` };
  const items: EquipmentItem[] = [];
  const seen = new Set<string>();
  for (const [i, r] of parsed.rows.entries()) {
    const at = `row ${i + 2}`;
    if (!r.equipment_id) continue; // blank line
    if (seen.has(r.equipment_id)) return { ok: false, error: `${at}: ${r.equipment_id} is listed twice` };
    seen.add(r.equipment_id);
    if (!(CATEGORIES as readonly string[]).includes(r.category)) return { ok: false, error: `${at}: unknown category "${r.category}"` };
    if (!(MODES as readonly string[]).includes(r.mode)) return { ok: false, error: `${at}: unknown mode "${r.mode}"` };
    if (!r.name || !r.source_title) return { ok: false, error: `${at}: name and source_title are required` };
    const nums = { capLow: num(r.cap_low), capHigh: num(r.cap_high), batchHoursLow: num(r.batch_hours_low), batchHoursHigh: num(r.batch_hours_high), powerKw: num(r.power_kw), priceLow: num(r.price_low), priceHigh: num(r.price_high) };
    for (const [k, v] of Object.entries(nums)) if (Number.isNaN(v) || (v != null && v < 0)) return { ok: false, error: `${at}: ${k} must be a number of 0 or more` };
    items.push({
      id: text(r.equipment_id, 80),
      category: r.category as EquipmentItem["category"],
      name: text(r.name),
      maker: text(r.maker) || undefined,
      model: text(r.model) || undefined,
      crops: r.crops.split(";").map((c) => c.trim()).filter((c) => (CROPS as readonly string[]).includes(c)),
      inputForm: text(r.input_form, 60) || undefined,
      outputForms: r.output_forms.split(";").map((c) => text(c, 60)).filter(Boolean).slice(0, 10),
      mode: r.mode as EquipmentItem["mode"],
      ...(nums as Record<keyof typeof nums, number | null>),
      capUnit: text(r.cap_unit, 20),
      currency: text(r.currency, 6) || undefined,
      priceVat: text(r.price_vat, 10) || undefined,
      priceBasis: text(r.price_basis, 20) || undefined,
      observedDate: /^\d{4}-\d{2}-\d{2}$/.test(r.observed_date) ? r.observed_date : undefined,
      sourceTitle: text(r.source_title, 300),
      sourceUrl: safeUrl(r.source_url),
      notes: text(r.notes, LIMITS.notes) || undefined,
    });
  }
  if (!items.length) return { ok: false, error: "No equipment rows in the file" };
  return { ok: true, value: items };
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const finite = (v: unknown, min = 0, max = 1e9): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export type SavedLine = { id: string; name: string; notes?: string; nodes: Record<string, unknown>[]; edges: Record<string, unknown>[]; updatedAt?: string };

/** Clean the lines sent by the page: known fields only, sizes capped, arrows only between existing boxes. */
export function cleanLines(body: unknown): Result<SavedLine[]> {
  const lines = (body as any)?.lines;
  if (!Array.isArray(lines)) return { ok: false, error: "lines must be a list" };
  if (lines.length > LIMITS.lines) return { ok: false, error: `At most ${LIMITS.lines} lines` };
  const out: SavedLine[] = [];
  const lineIds = new Set<string>();
  for (const l of lines) {
    if (!l || typeof l !== "object") return { ok: false, error: "A line must be an object" };
    const id = typeof l.id === "string" && ID.test(l.id) ? l.id : null;
    if (!id || lineIds.has(id)) return { ok: false, error: "Each line needs its own id" };
    lineIds.add(id);
    const name = text(l.name) || "Untitled line";
    if (!Array.isArray(l.nodes) || l.nodes.length > LIMITS.nodes) return { ok: false, error: `${name}: at most ${LIMITS.nodes} boxes` };
    if (!Array.isArray(l.edges) || l.edges.length > LIMITS.edges) return { ok: false, error: `${name}: at most ${LIMITS.edges} arrows` };
    const nodes: Record<string, unknown>[] = [];
    const nodeIds = new Set<string>();
    for (const n of l.nodes) {
      const nid = typeof n?.id === "string" && ID.test(n.id) ? n.id : null;
      if (!nid || nodeIds.has(nid)) return { ok: false, error: `${name}: each box needs its own id` };
      nodeIds.add(nid);
      const common = { id: nid, label: text(n.label) || "Box", x: finite(n.x, -1e5, 1e5) ?? 0, y: finite(n.y, -1e5, 1e5) ?? 0 };
      if (n.kind === "input") {
        if (!(CROPS as readonly string[]).includes(n.crop)) return { ok: false, error: `${name}: unknown crop on "${common.label}"` };
        nodes.push({ ...common, kind: "input", crop: n.crop, form: text(n.form, 60) || undefined, kg: finite(n.kg, 0, 1e9) ?? 0, weekFrom: finite(n.weekFrom, 1, 52) ?? 36, weekTo: finite(n.weekTo, 1, 52) ?? 40 });
      } else if (n.kind === "machine") {
        nodes.push({
          ...common,
          kind: "machine",
          equipmentId: text(n.equipmentId, 80) || undefined,
          mode: n.mode === "batch" ? "batch" : "rate",
          kgPerHour: finite(n.kgPerHour),
          kgPerBatch: finite(n.kgPerBatch),
          batchHours: finite(n.batchHours, 0, 10000),
          hoursPerDay: finite(n.hoursPerDay, 0, 24) ?? 8,
          daysPerWeek: finite(n.daysPerWeek, 0, 7) ?? 5,
          loss: finite(n.loss, 0, 1) ?? 0,
          count: Math.floor(finite(n.count, 1, 100) ?? 1),
        });
      } else if (n.kind === "store") {
        nodes.push({ ...common, kind: "store", equipmentId: text(n.equipmentId, 80) || undefined, capacityKg: finite(n.capacityKg), releaseKgPerWeek: finite(n.releaseKgPerWeek) });
      } else if (n.kind === "output") {
        nodes.push({ ...common, kind: "output", form: text(n.form, 60) || undefined });
      } else {
        return { ok: false, error: `${name}: unknown box type` };
      }
    }
    const edges: Record<string, unknown>[] = [];
    const edgeIds = new Set<string>();
    for (const e of l.edges) {
      const eid = typeof e?.id === "string" && ID.test(e.id) ? e.id : null;
      if (!eid || edgeIds.has(eid)) return { ok: false, error: `${name}: each arrow needs its own id` };
      if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) return { ok: false, error: `${name}: an arrow points at a box that isn't there` };
      edgeIds.add(eid);
      edges.push({ id: eid, from: e.from, to: e.to, share: finite(e.share, 0, 1) });
    }
    out.push({ id, name, notes: text(l.notes, LIMITS.notes) || undefined, nodes, edges, updatedAt: typeof l.updatedAt === "string" ? l.updatedAt.slice(0, 30) : undefined });
  }
  return { ok: true, value: out };
}
