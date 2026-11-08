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

/** What GroveWorks passes on from the service's answer (nothing else it might send). */
export function pickResult(body: any) {
  return {
    site: typeof body?.site === "string" ? body.site : "",
    name: typeof body?.name === "string" ? body.name : "",
    field_covered: typeof body?.field_covered === "number" ? body.field_covered : 0,
    species: body?.species && typeof body.species === "object" ? body.species : {},
    layers: Array.isArray(body?.layers) ? body.layers : [],
    model: typeof body?.model === "string" ? body.model : "",
  };
}

export const MAX_RESULT_BYTES = 8_000_000;
