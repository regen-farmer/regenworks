// Regulatory map layers for B's screening page (Grove team only, 22 Nov 2026): Danish open data that
// says whether a field is inside, next to or clear of protected nature, protection lines, conservation
// orders, ancient monuments and drinking-water areas. Each layer answers a screening checklist item.
// Sources (checked 22 Nov 2026 from GitHub with grove-data's probe; both WMS send CORS: *):
//  - Danmarks Miljøportal, Danmarks Arealinformation (dai:*): §3, protection lines, fredninger, Natura 2000, BNBO
//  - Slots- og Kulturstyrelsen, Fund og Fortidsminder (public:*): protected monuments and their protection zone
// Strandbeskyttelse, klitfredning and OSD aren't in these services yet: checklist items say "check by hand".
import { buffer } from "@turf/turf";

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

type XY = [number, number];
/** Local flat metres around a reference point (equirectangular; < 0.1 % error within a few km in Denmark). */
export function projector(lon0: number, lat0: number) {
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_574;
  return (c: number[]): XY => [(c[0] - lon0) * kx, (c[1] - lat0) * ky];
}

/** A geometry as rings/paths of flat points: polygons give their rings (closed), lines their paths, points single points. */
function parts(g: any, P: (c: number[]) => XY): { rings: XY[][]; paths: XY[][]; pts: XY[] } {
  const rings: XY[][] = [], paths: XY[][] = [], pts: XY[] = [];
  const t = g?.type, c = g?.coordinates;
  if (!Array.isArray(c)) return { rings, paths, pts };
  if (t === "Polygon") rings.push(...c.map((r: number[][]) => r.map(P)));
  else if (t === "MultiPolygon") for (const poly of c) rings.push(...poly.map((r: number[][]) => r.map(P)));
  else if (t === "LineString") paths.push(c.map(P));
  else if (t === "MultiLineString") paths.push(...c.map((l: number[][]) => l.map(P)));
  else if (t === "Point") pts.push(P(c));
  else if (t === "MultiPoint") pts.push(...c.map(P));
  return { rings, paths, pts };
}

const segDist = (p: XY, a: XY, b: XY) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const onSeg = (p: XY, a: XY, b: XY) => Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
/** Do segments ab and cd touch or cross (collinear segments only when they overlap)? */
function segsCross(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSeg(c, a, b)) || (d2 === 0 && onSeg(d, a, b)) || (d3 === 0 && onSeg(a, c, d)) || (d4 === 0 && onSeg(b, c, d));
}
/** Even-odd rule over all rings (holes count as outside). */
function inside(p: XY, rings: XY[][]): boolean {
  let n = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (r[i][1] > p[1] !== r[j][1] > p[1] && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) n = !n;
  return n;
}
const bounds = (xs: XY[]) => xs.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
const boxGap = (a: number[], b: number[]) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));

/** Shortest distance (m) between the field and a feature, in flat metres; 0 when they touch or overlap.
 *  Features whose bounding box is more than `cutoff` m away are answered by that gap without the vertex work. */
export function distanceM(field: any, geom: any, P?: (c: number[]) => XY, cutoff = Infinity): number {
  if (!P) {
    const c = field?.coordinates?.flat?.(3) ?? [];
    P = projector(c[0] ?? 10, c[1] ?? 56);
  }
  const F = parts(field, P), G = parts(geom, P);
  const fAll = F.rings.flat(), gAll = [...G.rings.flat(), ...G.paths.flat(), ...G.pts];
  if (!fAll.length || !gAll.length) return Infinity;
  const gap = boxGap(bounds(fAll), bounds(gAll));
  if (gap > cutoff) return Math.round(gap);
  // overlap: a feature point inside the field, a field point inside a feature polygon, or crossing edges
  if (gAll.some((p) => inside(p, F.rings)) || (G.rings.length && fAll.some((p) => inside(p, G.rings)))) return 0;
  const fSegs: [XY, XY][] = F.rings.flatMap((r) => r.slice(1).map((p, i): [XY, XY] => [r[i], p]));
  const gSegs: [XY, XY][] = [...G.rings, ...G.paths].flatMap((r) => r.slice(1).map((p, i): [XY, XY] => [r[i], p]));
  let best = Infinity;
  for (const [a, b] of fSegs) {
    for (const [c, d] of gSegs) {
      if (segsCross(a, b, c, d)) return 0;
      best = Math.min(best, segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
    }
    for (const p of G.pts) best = Math.min(best, segDist(p, a, b));
  }
  return Math.round(best);
}

export type RegResult = { id: string; title: string; checklist: string | null; status: "inside" | "near" | "clear" | "unavailable"; distanceM: number | null; count: number; note?: string; error?: string };

/** The WFS answer as features, or null when it isn't a feature collection (counted as "couldn't be checked"). */
export function readFeatures(j: any): { features: any[]; truncated: boolean } | null {
  if (!j || j.type !== "FeatureCollection" || !Array.isArray(j.features)) return null;
  const matched = Number(j.numberMatched);
  return { features: j.features, truncated: Number.isFinite(matched) && matched > j.features.length };
}

/** The answer for one layer from the features found near the field. Stops at the first overlap; a cut-off
 *  answer with nothing within reach is "couldn't be checked" (a nearer feature may be among those left out). */
export function answer(l: RegLayer, field: any, features: any[], truncated = false, deadline = Infinity): RegResult {
  const base = { id: l.id, title: l.title, checklist: l.checklist, note: l.note };
  const geoms = features.map((f) => f?.geometry).filter((g) => g && typeof g.type === "string");
  const c = field?.coordinates?.flat?.(3) ?? [];
  const P = projector(c[0] ?? 10, c[1] ?? 56);
  let d: number | null = null;
  for (const g of geoms) {
    if (Date.now() > deadline) return { ...base, status: "unavailable", distanceM: null, count: geoms.length, error: "Too complex to check in time" };
    const x = distanceM(field, g, P, NEAR_M);
    d = d === null ? x : Math.min(d, x);
    if (d === 0) break;
  }
  if (d !== null && !Number.isFinite(d)) d = null;
  if (truncated && (d === null || d > NEAR_M)) return { ...base, status: "unavailable", distanceM: null, count: geoms.length, error: "Too many features near the field: check by hand" };
  const status = d === null || d > NEAR_M ? "clear" : d === 0 ? "inside" : "near";
  return { ...base, status, distanceM: d, count: geoms.length };
}

/** One line per checklist item: the most serious answer of its layers, in words. */
export function checklistWords(results: RegResult[]): Record<string, string> {
  const out: Record<string, string> = {};
  const by = new Map<string, RegResult[]>();
  for (const r of results) if (r.checklist) by.set(r.checklist, [...(by.get(r.checklist) ?? []), r]);
  for (const [key, rs] of by) {
    const parts = rs.filter((r) => r.status !== "clear").map((r) =>
      r.status === "unavailable" ? `${r.title}: couldn't be checked` : r.status === "inside" ? `${r.title}: on the field` : `${r.title}: ${r.distanceM} m away`);
    out[key] = parts.length ? parts.join("; ") : `Clear within ${NEAR_M} m (open data, checked ${new Date().toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen" })})`;
  }
  for (const n of NOT_COVERED) out[n.checklist] = n.note;
  return out;
}

