// Regulatory map layers for B's screening page (Grove team only, 22 Nov 2026): Danish open data that
// says whether a field is inside, next to or clear of protected nature, protection lines, conservation
// orders, ancient monuments and drinking-water areas. Each layer answers a screening checklist item.
// Sources (checked 22 Nov 2026 from GitHub with grove-data's probe; both WMS send CORS: *):
//  - Danmarks Miljøportal, Danmarks Arealinformation (dai:*): §3, protection lines, fredninger, Natura 2000, BNBO
//  - Slots- og Kulturstyrelsen, Fund og Fortidsminder (public:*): protected monuments and their protection zone
// Strandbeskyttelse, klitfredning and OSD aren't in these services yet: checklist items say "check by hand".
import { booleanIntersects, buffer, distance, nearestPointOnLine, point, polygonToLine } from "@turf/turf";

export const MILJOEPORTAL = "https://arealeditering-dist-geo.miljoeportal.dk/geoserver/ows";
export const KULTURARV = "https://www.kulturarv.dk/ffpublic/wms";
/** How far around the field we look (m). */
export const NEAR_M = 300;

export type RegLayer = { id: string; title: string; base: string; typeName: string; checklist: string | null; kind: "area" | "line" | "point"; colour: string; note?: string };

export const REG_LAYERS: RegLayer[] = [
  { id: "p3-nature", title: "§3 protected nature", base: MILJOEPORTAL, typeName: "dai:bes_naturtyper", checklist: "regulatory-p3", kind: "area", colour: "#16a34a" },
  { id: "p3-streams", title: "§3 protected watercourses", base: MILJOEPORTAL, typeName: "dai:bes_vandloeb", checklist: "regulatory-p3", kind: "line", colour: "#0284c7" },
  { id: "p16-lake", title: "§16 lake protection line", base: MILJOEPORTAL, typeName: "dai:soe_bes_linjer", checklist: "regulatory-p16", kind: "area", colour: "#0ea5e9" },
  { id: "p16-river", title: "§16 river protection line", base: MILJOEPORTAL, typeName: "dai:aa_bes_linjer", checklist: "regulatory-p16", kind: "area", colour: "#38bdf8" },
  { id: "p17-forest", title: "§17 forest building line", base: MILJOEPORTAL, typeName: "dai:skovbyggelinjer", checklist: "regulatory-p17", kind: "area", colour: "#65a30d" },
  { id: "p18-monument-zone", title: "§18 ancient monument protection zone", base: KULTURARV, typeName: "public:fundogfortidsminder_areal_beskyttelse", checklist: "regulatory-p18", kind: "area", colour: "#b45309" },
  { id: "p18-monuments", title: "Protected ancient monuments", base: KULTURARV, typeName: "public:fundogfortidsminder_areal_fredet", checklist: "regulatory-p18", kind: "area", colour: "#92400e" },
  { id: "p19-church", title: "§19 church protection line", base: MILJOEPORTAL, typeName: "dai:kirkebyggelinjer", checklist: "regulatory-p19", kind: "area", colour: "#7c3aed" },
  { id: "fredning", title: "Fredninger (conservation orders)", base: MILJOEPORTAL, typeName: "dai:fredede_omr", checklist: "regulatory-fredning", kind: "area", colour: "#dc2626" },
  { id: "natura2000-habitat", title: "Natura 2000: habitat area", base: MILJOEPORTAL, typeName: "dai:habitat_omr", checklist: "regulatory-fredning", kind: "area", colour: "#be123c", note: "Natura 2000: planting can need an impact assessment" },
  { id: "natura2000-birds", title: "Natura 2000: bird protection area", base: MILJOEPORTAL, typeName: "dai:fugle_bes_omr", checklist: "regulatory-fredning", kind: "area", colour: "#e11d48" },
  { id: "dikes", title: "Protected stone and earth dikes", base: MILJOEPORTAL, typeName: "dai:bes_sten_jorddiger_2022", checklist: "landscape-features", kind: "line", colour: "#a16207", note: "Dikes may not be changed; keep tree rows and machines clear" },
  { id: "bnbo", title: "Drinking water: BNBO (near abstraction wells)", base: MILJOEPORTAL, typeName: "dai:status_bnbo", checklist: null, kind: "area", colour: "#4f46e5", note: "Restrictions on pesticides and fertiliser can apply" },
  { id: "groundwater-plans", title: "Drinking water: groundwater protection plans", base: MILJOEPORTAL, typeName: "dai:indsatsplaner", checklist: null, kind: "area", colour: "#6366f1" },
];
export const NOT_COVERED = [
  { checklist: "regulatory-p15", title: "§15 beach protection line", note: "Not in the open map services used here yet: check on arealinfo.dk" },
];

/** The WFS request for one layer around a bounding box (lon/lat, already widened). */
export function wfsUrl(l: RegLayer, bbox: [number, number, number, number], count = 200): string {
  const [w, s, e, n] = bbox;
  const q = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: l.typeName, count: String(count),
    outputFormat: "application/json", srsName: "EPSG:4326", bbox: `${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`,
  });
  return `${l.base}?${q}`;
}

/** The WMS tile URL template for maplibre (EPSG:3857 tiles straight from the public service). */
export function wmsTiles(l: RegLayer): string {
  return `${l.base}?service=WMS&version=1.3.0&request=GetMap&layers=${encodeURIComponent(l.typeName)}&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true`;
}

/** The field's bounding box widened by `m` metres. */
export function widen(field: any, m = NEAR_M): [number, number, number, number] {
  const b = buffer(field, m / 1000, { units: "kilometers" });
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c: any): void => {
    if (typeof c?.[0] === "number") {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else c?.forEach(walk);
  };
  walk(b?.geometry?.coordinates);
  return [w, s, e, n];
}

function points(g: any): [number, number][] {
  const out: [number, number][] = [];
  const walk = (c: any): void => (typeof c?.[0] === "number" ? void out.push([c[0], c[1]]) : c?.forEach(walk));
  walk(g?.coordinates);
  return out;
}
function lines(g: any): any[] {
  if (!g) return [];
  if (g.type === "LineString" || g.type === "MultiLineString") return [{ type: "Feature", properties: {}, geometry: g }];
  if (g.type === "Polygon" || g.type === "MultiPolygon") {
    const l: any = polygonToLine({ type: "Feature", properties: {}, geometry: g } as any);
    return l.type === "FeatureCollection" ? l.features : [l];
  }
  return [];
}

/** Shortest distance (m) between the field and a feature; 0 when they touch or overlap. Thinned to keep it quick. */
export function distanceM(field: any, geom: any): number {
  const f = { type: "Feature", properties: {}, geometry: field } as any;
  const g = { type: "Feature", properties: {}, geometry: geom } as any;
  if (booleanIntersects(f, g)) return 0;
  const step = (arr: any[]) => arr.filter((_, i) => i % Math.max(1, Math.floor(arr.length / 400)) === 0);
  let best = Infinity;
  const near = (pts: [number, number][], ls: any[]) => {
    for (const p of step(pts)) for (const l of ls) {
      const q = nearestPointOnLine(l, point(p));
      best = Math.min(best, distance(point(p), q, { units: "kilometers" }) * 1000);
    }
  };
  near(points(field), lines(geom));
  if (geom.type === "Point" || geom.type === "MultiPoint") near(points(geom), lines(field));
  else near(points(geom), lines(field));
  return Math.round(best);
}

export type RegResult = { id: string; title: string; checklist: string | null; status: "inside" | "near" | "clear" | "unavailable"; distanceM: number | null; count: number; note?: string; error?: string };

/** The answer for one layer from the features found near the field. */
export function answer(l: RegLayer, field: any, features: any[]): RegResult {
  const geoms = features.map((f) => f?.geometry).filter((g) => g && typeof g.type === "string");
  let d: number | null = null;
  for (const g of geoms.slice(0, 200)) {
    const x = distanceM(field, g);
    d = d === null ? x : Math.min(d, x);
    if (d === 0) break;
  }
  const status = d === null || d > NEAR_M ? "clear" : d === 0 ? "inside" : "near";
  return { id: l.id, title: l.title, checklist: l.checklist, status, distanceM: d, count: geoms.length, note: l.note };
}

/** One line per checklist item: the most serious answer of its layers, in words. */
export function checklistWords(results: RegResult[]): Record<string, string> {
  const out: Record<string, string> = {};
  const by = new Map<string, RegResult[]>();
  for (const r of results) if (r.checklist) by.set(r.checklist, [...(by.get(r.checklist) ?? []), r]);
  for (const [key, rs] of by) {
    const parts = rs.filter((r) => r.status !== "clear").map((r) =>
      r.status === "unavailable" ? `${r.title}: couldn't be checked` : r.status === "inside" ? `${r.title}: on the field` : `${r.title}: ${r.distanceM} m away`);
    out[key] = parts.length ? parts.join("; ") : `Clear within ${NEAR_M} m (open data, ${new Date().toISOString().slice(0, 10)})`;
  }
  for (const n of NOT_COVERED) out[n.checklist] = n.note;
  return out;
}

