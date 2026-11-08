// Model screening (grove-twin's screening service): pure helpers for /internal/screening.
// GroveWorks sends a field outline (and, for a scenario, the trees in its design); the service
// answers with decision statements and map layers. Nothing is stored on either side.

/** The species the screening model knows, keyed by genus + species (lower case). */
const MODEL_SPECIES: Record<string, string> = {
  "juglans regia": "walnut",
  "castanea sativa": "sweet chestnut",
  "corylus avellana": "hazel",
  "aronia melanocarpa": "aronia",
  "aronia prunifolia": "aronia",
  "hippophae rhamnoides": "sea buckthorn",
  "ribes nigrum": "blackcurrant",
};
const BY_COMMON: Record<string, string> = {
  walnut: "walnut",
  "common walnut": "walnut",
  "sweet chestnut": "sweet chestnut",
  chestnut: "sweet chestnut",
  hazel: "hazel",
  hazelnut: "hazel",
  "common hazel": "hazel",
  aronia: "aronia",
  "black chokeberry": "aronia",
  "black chokeberries": "aronia",
  "sea buckthorn": "sea buckthorn",
  blackcurrant: "blackcurrant",
  "black currant": "blackcurrant",
};
export const ALL_MODEL_SPECIES = ["walnut", "sweet chestnut", "hazel", "aronia", "sea buckthorn", "blackcurrant"];

/** The screening model's name for a library species, or null if the model doesn't cover it. */
export function modelSpecies(sp: { genus?: string; species?: string; nameCommon?: string } | null | undefined): string | null {
  if (!sp) return null;
  const latin = `${sp.genus ?? ""} ${sp.species ?? ""}`.trim().toLowerCase();
  if (MODEL_SPECIES[latin]) return MODEL_SPECIES[latin];
  // hybrids and cultivated forms ("Juglans x intermedia", "Corylus maxima"): by genus
  const genus = (sp.genus ?? "").toLowerCase();
  if (genus === "juglans") return "walnut";
  if (genus === "castanea") return "sweet chestnut";
  if (genus === "corylus") return "hazel";
  return BY_COMMON[(sp.nameCommon ?? "").trim().toLowerCase()] ?? null;
}

/** The trees of a design as model species (unique, in design order) and the ones the model doesn't cover. */
export function designSpecies(rows: { sequence?: { species?: any }[] }[] | undefined): { covered: string[]; notCovered: string[] } {
  const covered: string[] = [];
  const notCovered: string[] = [];
  for (const r of rows ?? []) {
    for (const e of r.sequence ?? []) {
      const sp = e?.species;
      if (!sp || typeof sp !== "object") continue;
      const m = modelSpecies(sp);
      const label = sp.nameCommon || `${sp.genus ?? ""} ${sp.species ?? ""}`.trim();
      if (m) {
        if (!covered.includes(m)) covered.push(m);
      } else if (label && !notCovered.includes(label)) notCovered.push(label);
    }
  }
  return { covered, notCovered };
}

/** A field's stored geometry (a GeoJSON string, sometimes HTML-escaped; Feature or geometry) as a Polygon/MultiPolygon, or null. */
export function fieldGeometry(stored: unknown): { type: "Polygon" | "MultiPolygon"; coordinates: unknown } | null {
  if (typeof stored !== "string" || !stored) return null;
  let g: any;
  try {
    g = JSON.parse(stored.replace(/&#34;/g, '"'));
  } catch {
    return null;
  }
  if (g?.type === "Feature") g = g.geometry;
  if (g?.type === "FeatureCollection") g = g.features?.[0]?.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) return null;
  return { type: g.type, coordinates: g.coordinates };
}

/** Species asked for in a request: known model species only, at most all of them. */
export function cleanSpecies(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((s): s is string => typeof s === "string" && ALL_MODEL_SPECIES.includes(s)))];
}

export type ServiceConfig = { url: string; key: string } | null;

/** grove-twin's tree height curves by genus (alleycrop.TREES), so a row grows at its species' pace. */
const TWIN_TREE_BY_GENUS: Record<string, string> = {
  juglans: "walnut",
  castanea: "sweet chestnut",
  corylus: "hazel",
  malus: "apple",
  quercus: "oak",
  populus: "hybrid poplar",
  salix: "willow (coppiced)",
  alnus: "black alder",
  hippophae: "sea buckthorn",
  elaeagnus: "autumn olive",
};

const MAX_ROWS = 400;
const MAX_POINTS = 2000; // per line
const MAX_TOTAL_POINTS = 50_000; // per request

function lineParts(g: any, depth = 0): unknown[] {
  if (!g || typeof g !== "object" || depth > 3) return [];
  if (g.type === "Feature") return lineParts(g.geometry, depth + 1);
  if (g.type === "FeatureCollection") return Array.isArray(g.features) ? g.features.flatMap((f: unknown) => lineParts(f, depth + 1)) : [];
  if (g.type === "LineString") return [g.coordinates];
  if (g.type === "MultiLineString") return Array.isArray(g.coordinates) ? g.coordinates : [];
  return [];
}

/**
 * A scenario's rows for the screening service: each row's line (lon/lat), the mature height of its
 * tallest species (m, from the library) and the species names grove-twin knows a height curve for.
 */
export function designRows(rows: { geometry?: unknown; sequence?: { model?: { species?: any }[] } | null }[] | undefined) {
  const out: { line: number[][]; mature_height_m: number | null; species: string[] }[] = [];
  let points = 0;
  for (const r of rows ?? []) {
    if (out.length >= MAX_ROWS) break;
    if (typeof r?.geometry !== "string" || !r.geometry) continue;
    let g: any;
    try {
      g = JSON.parse(r.geometry.replace(/&#34;/g, '"'));
    } catch {
      continue;
    }
    const spp = (Array.isArray(r.sequence?.model) ? r.sequence!.model! : []).map((m) => m?.species).filter((sp) => sp && typeof sp === "object");
    const heights = spp.map((sp: any) => Number(sp.height)).filter((h) => Number.isFinite(h) && h > 0 && h < 100);
    const names = [...new Set(spp.map((sp: any) => TWIN_TREE_BY_GENUS[String(sp.genus ?? "").trim().toLowerCase()]).filter(Boolean))] as string[];
    for (const part of lineParts(g)) {
      if (out.length >= MAX_ROWS || points >= MAX_TOTAL_POINTS) break;
      const line = (Array.isArray(part) ? part : [])
        .slice(0, Math.min(MAX_POINTS, MAX_TOTAL_POINTS - points))
        .filter((p): p is number[] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)
        .map((p) => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]);
      if (line.length >= 2) {
        points += line.length;
        out.push({ line, mature_height_m: heights.length ? Math.max(...heights) : null, species: names });
      }
    }
  }
  return out;
}

/** The service's address and key from the environment (SCREENING_URL, SCREENING_KEY), or null when not set up. */
export function serviceConfig(env: Record<string, string | undefined> = process.env): ServiceConfig {
  const url = (env.SCREENING_URL ?? "").trim().replace(/\/+$/, "");
  // pasted values often carry a trailing space or line break, which is not a valid header value
  const key = (env.SCREENING_KEY ?? "").trim();
  if (key.length < 32) return null;
  // the key travels in a header: https only (plain http just for a service on this machine)
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  return { url, key };
}

const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function keyNumbers(v: unknown) {
  const o = obj(v) ? v : {};
  return { frost_share_median: num(o.frost_share_median), wind_growth_factor: num(o.wind_growth_factor), water_lost_median: num(o.water_lost_median), young_growth_index: num(o.young_growth_index) };
}

/** The design part of the service's answer, narrowed to what the Screening tab shows. */
export function pickDesign(d: unknown) {
  if (!obj(d)) return null;
  const r = obj(d.rows) ? d.rows : {};
  const h = Array.isArray(r.height_m) && r.height_m.length === 2 && r.height_m.every((x: unknown) => num(x) !== null) ? (r.height_m as [number, number]) : null;
  const compare: Record<string, { today: ReturnType<typeof keyNumbers>; with_design: ReturnType<typeof keyNumbers>; statement: string; verdict: string | null }> = {};
  if (obj(d.compare)) {
    for (const [sp, c] of Object.entries(d.compare)) {
      if (!obj(c) || !ALL_MODEL_SPECIES.includes(sp)) continue;
      compare[sp] = { today: keyNumbers(c.today), with_design: keyNumbers(c.with_design), statement: typeof c.statement === "string" ? c.statement.slice(0, 1000) : "", verdict: typeof c.verdict === "string" ? c.verdict.slice(0, 200) : null };
    }
  }
  const layers = (Array.isArray(d.layers) ? d.layers : []).filter(
    (l: unknown) => obj(l) && typeof l.id === "string" && typeof l.title === "string" && typeof l.png === "string" && l.png.startsWith("data:image/png;base64,") && Array.isArray(l.corners) && obj(l.legend),
  );
  return {
    rows: { rows: num(r.rows) ?? 0, area_ha: num(r.area_ha), height_m: h, age_years: num(r.age_years) },
    compare,
    layers,
    note: typeof d.note === "string" ? d.note.slice(0, 1000) : "",
  };
}

/** What GroveWorks passes on from the service's answer (nothing else it might send). */
export function pickResult(body: any) {
  return {
    site: typeof body?.site === "string" ? body.site : "",
    name: typeof body?.name === "string" ? body.name : "",
    field_covered: typeof body?.field_covered === "number" ? body.field_covered : 0,
    species: body?.species && typeof body.species === "object" ? body.species : {},
    layers: Array.isArray(body?.layers) ? body.layers : [],
    design: pickDesign(body?.design),
    model: typeof body?.model === "string" ? body.model : "",
  };
}

export const MAX_RESULT_BYTES = 8_000_000;
