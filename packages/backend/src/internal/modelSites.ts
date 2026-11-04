// Model sites (grove-twin): checking what the web app sends, and the GeoJSON export.
// Kept free of the database so it can be tested on its own.
import { MODEL_SITE_STATUSES, MODEL_SITE_SYSTEMS } from "@rw/db/schemas/internal/modelSite.ts";
import { isPlainObject } from "../utils/mongoSafety.ts";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };

export type QueueItem = { name: string; lon: number; lat: number; source?: string; sourceRef?: string };
export type SiteUpdate = {
  name?: string;
  batch?: string;
  status?: (typeof MODEL_SITE_STATUSES)[number];
  geometry?: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } | null;
  fieldIds?: string[];
  system?: (typeof MODEL_SITE_SYSTEMS)[number] | null;
  species?: string[];
  rowBearingDeg?: number | null;
  alleyWidthM?: number | null;
  inRowSpacingM?: number | null;
  plantedYear?: number | null;
  notes?: string;
};

const MAX_QUEUE = 500;
const MAX_VERTICES = 20000;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function lonLat(lon: unknown, lat: unknown): [number, number] | null {
  const x = typeof lon === "string" ? Number(lon) : lon;
  const y = typeof lat === "string" ? Number(lat) : lat;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -180 || x > 180 || y < -90 || y > 90) return null;
  return [x, y];
}

/**
 * Lines of pasted coordinates → queue items. Accepts "lat, lon" as copied from Google Maps
 * (the usual order), optionally followed by a name; a line whose first number can't be a
 * latitude in Europe but whose second can is read as "lon, lat".
 */
export function parseCoordinateLines(text: string): { items: QueueItem[]; skipped: string[] } {
  const items: QueueItem[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().slice(0, 300);
    if (!line) continue;
    // the first two numbers on the line, then the rest as the name (a simple scan: no backtracking)
    const nums = [...line.matchAll(/-?\d+(?:[.,]\d+)?/g)].slice(0, 2);
    if (nums.length < 2 || nums[0].index !== 0) {
      skipped.push(line);
      continue;
    }
    const between = line.slice(nums[0].index! + nums[0][0].length, nums[1].index);
    if (!/^[\s,;]+$/.test(between)) {
      skipped.push(line);
      continue;
    }
    const rest = line.slice(nums[1].index! + nums[1][0].length).replace(/^[\s,;]+/, "");
    const m = [line, nums[0][0], nums[1][0], rest];
    const a = Number(m[1].replace(",", "."));
    const b = Number(m[2].replace(",", "."));
    // Europe: latitude 34-72, longitude -25-45
    const aIsLat = a >= 34 && a <= 72;
    const bIsLat = b >= 34 && b <= 72;
    const [lat, lon] = aIsLat || !bIsLat ? [a, b] : [b, a];
    const p = lonLat(lon, lat);
    if (!p) {
      skipped.push(line);
      continue;
    }
    items.push({ name: str(m[3], 200) || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lon: p[0], lat: p[1] });
  }
  return { items, skipped };
}

/** POST /queue body: { batch, items: [{ name, lon, lat, source?, sourceRef? }] } or { batch, text }. */
export function cleanQueue(body: unknown): Ok<{ batch: string; items: QueueItem[]; skipped: string[] }> | Err {
  if (!isPlainObject(body)) return { ok: false, error: "Send a batch name and the sites" };
  const batch = str(body.batch, 80);
  if (!batch) return { ok: false, error: "Give the batch a name" };
  let items: QueueItem[] = [];
  let skipped: string[] = [];
  if (typeof body.text === "string") {
    ({ items, skipped } = parseCoordinateLines(body.text));
  } else if (Array.isArray(body.items)) {
    for (const it of body.items) {
      if (!isPlainObject(it)) continue;
      const p = lonLat(it.lon, it.lat);
      if (!p) {
        skipped.push(JSON.stringify(it).slice(0, 80));
        continue;
      }
      items.push({
        name: str(it.name, 200) || `${p[1].toFixed(5)}, ${p[0].toFixed(5)}`,
        lon: p[0],
        lat: p[1],
        source: str(it.source, 60) || undefined,
        sourceRef: str(it.sourceRef, 200) || undefined,
      });
    }
  }
  if (items.length === 0) return { ok: false, error: "No coordinates found. Use one site per line, e.g. 56.3030, 8.5125 Hestbjerg" };
  if (items.length > MAX_QUEUE) return { ok: false, error: `At most ${MAX_QUEUE} sites at a time` };
  return { ok: true, value: { batch, items, skipped } };
}

function cleanRing(ring: unknown): number[][] | null {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const out: number[][] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) return null;
    const p = lonLat(pt[0], pt[1]);
    if (!p) return null;
    out.push(p);
  }
  const [f, l] = [out[0], out[out.length - 1]];
  if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
  return out;
}

/** A GeoJSON Polygon or MultiPolygon with sane coordinates, or null. */
export function cleanGeometry(g: unknown): SiteUpdate["geometry"] | null {
  if (!isPlainObject(g)) return null;
  let vertices = 0;
  const poly = (rings: unknown): number[][][] | null => {
    if (!Array.isArray(rings) || rings.length === 0) return null;
    const out: number[][][] = [];
    for (const r of rings) {
      const c = cleanRing(r);
      if (!c) return null;
      vertices += c.length;
      out.push(c);
    }
    return out;
  };
  if (g.type === "Polygon") {
    const p = poly(g.coordinates);
    return p && vertices <= MAX_VERTICES ? { type: "Polygon", coordinates: p } : null;
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
    const ps: number[][][][] = [];
    for (const c of g.coordinates) {
      const p = poly(c);
      if (!p) return null;
      ps.push(p);
    }
    return vertices <= MAX_VERTICES ? { type: "MultiPolygon", coordinates: ps } : null;
  }
  return null;
}

function num(v: unknown, lo: number, hi: number): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const x = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (typeof x !== "number" || !Number.isFinite(x) || x < lo || x > hi) return undefined;
  return x;
}

/** PUT /:id body → the fields that may change. Unknown fields are ignored. */
export function cleanSiteUpdate(body: unknown): Ok<SiteUpdate> | Err {
  if (!isPlainObject(body)) return { ok: false, error: "Nothing to save" };
  const out: SiteUpdate = {};
  if (body.name !== undefined) {
    const n = str(body.name, 200);
    if (!n) return { ok: false, error: "The site needs a name" };
    out.name = n;
  }
  if (body.batch !== undefined) {
    const b = str(body.batch, 80);
    if (!b) return { ok: false, error: "The batch needs a name" };
    out.batch = b;
  }
  if (body.status !== undefined) {
    if (!(MODEL_SITE_STATUSES as readonly unknown[]).includes(body.status)) return { ok: false, error: "Unknown status" };
    out.status = body.status as SiteUpdate["status"];
  }
  if (body.geometry !== undefined) {
    if (body.geometry === null) out.geometry = null;
    else {
      const g = cleanGeometry(body.geometry);
      if (!g) return { ok: false, error: "The outline isn't a valid polygon" };
      out.geometry = g;
    }
  }
  if (body.fieldIds !== undefined) {
    if (!Array.isArray(body.fieldIds)) return { ok: false, error: "fieldIds must be a list" };
    out.fieldIds = body.fieldIds
      .filter((x) => typeof x === "string" || typeof x === "number")
      .map((x) => str(String(x), 80))
      .filter(Boolean)
      .slice(0, 200);
  }
  if (body.system !== undefined) {
    if (body.system === null || body.system === "") out.system = null;
    else if ((MODEL_SITE_SYSTEMS as readonly unknown[]).includes(body.system)) out.system = body.system as SiteUpdate["system"];
    else return { ok: false, error: "Unknown system type" };
  }
  if (body.species !== undefined) {
    const list = Array.isArray(body.species) ? body.species : typeof body.species === "string" ? body.species.split(",") : null;
    if (!list) return { ok: false, error: "Species must be a list" };
    out.species = list.map((s) => str(String(s), 80)).filter(Boolean).slice(0, 50);
  }
  const ranges: [keyof SiteUpdate, number, number, string][] = [
    ["rowBearingDeg", 0, 180, "Row direction is 0–180° from north"],
    ["alleyWidthM", 0, 500, "Alley width is 0–500 m"],
    ["inRowSpacingM", 0, 100, "In-row spacing is 0–100 m"],
    ["plantedYear", 1800, 2100, "Planting year looks wrong"],
  ];
  for (const [k, lo, hi, msg] of ranges) {
    const v = (body as Record<string, unknown>)[k];
    if (v === undefined) continue;
    const x = num(v, lo, hi);
    if (x === undefined || (k === "plantedYear" && x !== null && !Number.isInteger(x))) return { ok: false, error: msg };
    (out as Record<string, unknown>)[k] = x;
  }
  if (body.notes !== undefined) out.notes = str(body.notes, 4000);
  // drawing an outline marks the site traced, unless the caller says otherwise
  if (out.geometry && out.status === undefined) out.status = "traced";
  return { ok: true, value: out };
}

/**
 * Traced sites as a GeoJSON FeatureCollection for grove-data: outline and layout only.
 * No user ids and no notes (notes stay in GroveWorks; they may name people).
 */
export function toFeatureCollection(sites: any[]) {
  return {
    type: "FeatureCollection",
    features: sites
      .filter((s) => s.geometry && s.status === "traced")
      .map((s) => ({
        type: "Feature",
        geometry: s.geometry,
        properties: {
          site: `model-${String(s._id)}`,
          name: s.name,
          batch: s.batch,
          zone: "inner",
          kind: s.system ? `${s.system} (model site)` : "model site",
          system: s.system ?? null,
          species: s.species ?? [],
          row_bearing_deg: s.rowBearingDeg ?? null,
          alley_width_m: s.alleyWidthM ?? null,
          in_row_spacing_m: s.inRowSpacingM ?? null,
          planted: s.plantedYear ?? null,
          source: s.source ?? null,
          updated: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        },
      })),
  };
}

/** POST /rename-batch body: { from, to } (both 1-80 characters, different). */
export function cleanBatchRename(body: unknown): Ok<{ from: string; to: string }> | Err {
  if (!isPlainObject(body)) return { ok: false, error: "Say which batch and its new name" };
  const from = str(body.from, 80);
  const to = str(body.to, 80);
  if (!from || !to) return { ok: false, error: "Give the batch a new name" };
  if (from === to) return { ok: false, error: "That's already its name" };
  return { ok: true, value: { from, to } };
}

export type ImportItem = Omit<SiteUpdate, "status" | "geometry" | "notes" | "fieldIds"> & {
  name: string;
  batch: string;
  status: "traced";
  geometry: NonNullable<SiteUpdate["geometry"]>;
  lon: number;
  lat: number;
  source: string;
  sourceRef?: string;
};

const MAX_IMPORT = 2000;

/** Mean of the outer ring's vertices of the first polygon: a point inside or near the outline. */
function centre(g: NonNullable<SiteUpdate["geometry"]>): [number, number] {
  const ring = (g.type === "Polygon" ? (g.coordinates as number[][][])[0] : (g.coordinates as number[][][][])[0][0]).slice(0, -1);
  const n = Math.max(ring.length, 1);
  return [ring.reduce((a, p) => a + p[0], 0) / n, ring.reduce((a, p) => a + p[1], 0) / n];
}

/**
 * POST /import body: a GeoJSON FeatureCollection of traced sites, as GroveWorks's own export or
 * grove-data's model_sites.geojson write it (properties: name, batch, system, species,
 * row_bearing_deg, alley_width_m, in_row_spacing_m, planted, site). Optional `batch` puts them
 * all in one batch. Features without a valid outline, or with an unknown system type, are skipped.
 */
export function cleanImport(body: unknown): Ok<{ items: ImportItem[]; skipped: string[] }> | Err {
  if (!isPlainObject(body)) return { ok: false, error: "Send a GeoJSON file of sites" };
  const fc = isPlainObject(body.collection) ? body.collection : body;
  if (!Array.isArray(fc.features)) return { ok: false, error: "That isn't a GeoJSON FeatureCollection" };
  if (fc.features.length > MAX_IMPORT) return { ok: false, error: `At most ${MAX_IMPORT} sites at a time` };
  const batchAll = str(body.batch, 80);
  const items: ImportItem[] = [];
  const skipped: string[] = [];
  for (const f of fc.features) {
    const props = isPlainObject(f) && isPlainObject(f.properties) ? f.properties : {};
    const label = str(props.name, 80) || str(props.site, 80) || "a site";
    const geometry = isPlainObject(f) ? cleanGeometry(f.geometry) : null;
    if (!geometry) {
      skipped.push(`${label}: no valid outline`);
      continue;
    }
    const u = cleanSiteUpdate({
      system: props.system ?? undefined,
      species: Array.isArray(props.species) || typeof props.species === "string" ? props.species : undefined,
      rowBearingDeg: props.row_bearing_deg ?? undefined,
      alleyWidthM: props.alley_width_m ?? undefined,
      inRowSpacingM: props.in_row_spacing_m ?? undefined,
      plantedYear: props.planted ?? undefined,
    });
    if (!u.ok) {
      skipped.push(`${label}: ${u.error}`);
      continue;
    }
    const [lon, lat] = centre(geometry);
    const { status: _s, geometry: _g, notes: _n, fieldIds: _f, ...layout } = u.value;
    items.push({
      ...layout,
      name: str(props.name, 200) || label,
      batch: batchAll || str(props.batch, 80) || "Imported",
      status: "traced",
      geometry,
      lon,
      lat,
      source: "import",
      sourceRef: str(props.site, 200) || undefined,
    });
  }
  if (!items.length) return { ok: false, error: skipped.length ? `No site could be read (${skipped.slice(0, 3).join("; ")})` : "The file has no sites" };
  return { ok: true, value: { items, skipped } };
}
