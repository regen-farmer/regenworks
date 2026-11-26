// Guidance lines for auto-steer (26 Nov 2026): one line per tree row, for tractor terminals.
//
// Two formats, as Danish and other terminals read them:
//  - ISOXML (ISO 11783-10, version 4): a TASKDATA folder with TASKDATA.XML: one partfield with the field
//    boundary (PLN type 1) and one guidance group (GGP) with a guidance pattern (GPN) per row: an AB line
//    (type 1) for a straight row, a curve (type 3) when the row bends. ISOBUS terminals (CLAAS, Fendt,
//    Case IH/New Holland Pro 1200, Müller, Kverneland, Topcon) import it from a USB stick's root.
//  - Shapefile (WGS84 / EPSG:4326): <stem>_guidance_lines (one polyline per row, attributes NAME, ROW,
//    KIND, TREES, LENGTH_M) and <stem>_boundary (the field polygon). Trimble displays, John Deere
//    Operations Center, Fendt's field data converter, Topcon and Ag Leader read shapefiles.
//
// Row names follow the stake-out files: <prefix>R<row>. Each line runs from the first to the last tree,
// extended `extendM` metres at both ends on the row line, so the tractor is on line before the first tree.
// Rows are not propagated: each row is its own line (spacing between rows can differ in a design).
import { fromUtm32, toUtm32 } from "./utm.ts";
import { cleanPrefix, type StakeoutRow } from "./stakeout.ts";

export type GuidanceLine = { name: string; row: number; kind: "AB" | "CURVE"; trees: number; lengthM: number; points: { lon: number; lat: number }[] };

const pad = (v: number, width: number) => String(v).padStart(width, "0");

/** One line per row with at least two trees: straight (AB) unless a tree is more than `curveToleranceM` off the end-to-end line. */
export function guidanceLines(rows: StakeoutRow[], opts: { prefix?: string; extendM?: number; curveToleranceM?: number } = {}): GuidanceLine[] {
  const prefix = cleanPrefix(opts.prefix);
  const ext = Math.max(0, Math.min(50, Number(opts.extendM ?? 5) || 0));
  const tol = opts.curveToleranceM ?? 0.15;
  const width = Math.max(2, String(rows.length).length);
  const out: GuidanceLine[] = [];
  for (const r of rows) {
    if (r.trees.length < 2) continue;
    const pts = r.trees.map((t) => ({ e: t.e, n: t.n }));
    const a = pts[0], b = pts[pts.length - 1];
    const len = Math.hypot(b.e - a.e, b.n - a.n);
    if (!(len > 0)) continue;
    const off = (p: { e: number; n: number }) => Math.abs((b.e - a.e) * (a.n - p.n) - (a.e - p.e) * (b.n - a.n)) / len;
    const curved = pts.some((p) => off(p) > tol);
    // extend along the first and last segments
    const extend = (from: { e: number; n: number }, away: { e: number; n: number }) => {
      const d = Math.hypot(from.e - away.e, from.n - away.n) || 1;
      return { e: from.e + ((from.e - away.e) / d) * ext, n: from.n + ((from.n - away.n) / d) * ext };
    };
    const line = curved ? [extend(pts[0], pts[1]), ...pts, extend(pts[pts.length - 1], pts[pts.length - 2])] : [extend(a, b), extend(b, a)];
    const length = line.slice(1).reduce((s, p, i) => s + Math.hypot(p.e - line[i].e, p.n - line[i].n), 0);
    out.push({
      name: `${prefix}R${pad(r.row, width)}`,
      row: r.row,
      kind: curved ? "CURVE" : "AB",
      trees: r.trees.length,
      lengthM: Math.round(length * 100) / 100,
      points: line.map((p) => fromUtm32(p.e, p.n)),
    });
  }
  return out;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const deg = (v: number) => v.toFixed(9);

/** Exterior rings of a GeoJSON Polygon or MultiPolygon (lon/lat), closed. */
export function outerRings(geom: any): number[][][] {
  const polys = geom?.type === "Polygon" ? [geom.coordinates] : geom?.type === "MultiPolygon" ? geom.coordinates : [];
  return polys.map((p: number[][][]) => p?.[0]).filter((r: any) => Array.isArray(r) && r.length >= 4);
}

/** Area of the field's outer rings in m² (UTM 32N), for the partfield's area attribute. */
function areaM2(rings: number[][][]): number {
  let total = 0;
  for (const r of rings) {
    const p = r.map(([lon, lat]) => toUtm32(lon, lat));
    let s = 0;
    for (let i = 0; i < p.length - 1; i++) s += p[i].e * p[i + 1].n - p[i + 1].e * p[i].n;
    total += Math.abs(s) / 2;
  }
  return Math.round(total);
}

/** TASKDATA.XML (ISOXML v4.2): one partfield with the boundary and one guidance group with a pattern per row. */
export function isoxmlTaskdata(lines: GuidanceLine[], field: { name: string; boundary?: any }, version = "GroveWorks"): string {
  const rings = outerRings(field.boundary);
  const pnt = (type: number, p: { lon: number; lat: number }) => `<PNT A="${type}" C="${deg(p.lat)}" D="${deg(p.lon)}"/>`;
  const plns = rings
    .map((r) => `<PLN A="1" B="${xml(field.name.slice(0, 32))}"><LSG A="1">${r.map(([lon, lat]) => pnt(2, { lon, lat })).join("")}</LSG></PLN>`)
    .join("\n");
  const gpns = lines
    .map((l, i) => {
      const pts = l.points.map((p, j) => pnt(j === 0 ? 6 : j === l.points.length - 1 ? 7 : 9, p)).join("");
      // E="4": no parallel lines from this one (each row has its own); F="1": extend both ways
      return `<GPN A="GPN${i + 1}" B="${xml(l.name)}" C="${l.kind === "AB" ? 1 : 3}" E="4" F="1" I="16"><LSG A="5" B="${xml(l.name)}">${pts}</LSG></GPN>`;
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<ISO11783_TaskData VersionMajor="4" VersionMinor="2" ManagementSoftwareManufacturer="Grove" ManagementSoftwareVersion="${xml(version)}" DataTransferOrigin="1">`,
    `<PFD A="PFD1" C="${xml(field.name.slice(0, 32) || "Field")}" D="${areaM2(rings)}">`,
    plns,
    `<GGP A="GGP1" B="${xml(field.name.slice(0, 32) || "Tree rows")}">`,
    gpns,
    "</GGP>",
    "</PFD>",
    "</ISO11783_TaskData>",
    "",
  ].join("\n");
}

// --- shapefile (ESRI, 1998 spec): .shp + .shx + .dbf + .prj ---------------------------------------

export const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

type DbfField = { name: string; type: "C" | "N"; len: number; dec?: number };

function dbf(fields: DbfField[], records: (string | number)[][]): Uint8Array {
  const headerLen = 32 + 32 * fields.length + 1;
  const recLen = 1 + fields.reduce((s, f) => s + f.len, 0);
  const buf = new Uint8Array(headerLen + recLen * records.length + 1);
  const v = new DataView(buf.buffer);
  const now = new Date();
  buf[0] = 0x03;
  buf[1] = now.getFullYear() - 1900;
  buf[2] = now.getMonth() + 1;
  buf[3] = now.getDate();
  v.setUint32(4, records.length, true);
  v.setUint16(8, headerLen, true);
  v.setUint16(10, recLen, true);
  buf[29] = 0x57; // language driver: ANSI (Windows-1252)
  fields.forEach((f, i) => {
    const o = 32 + 32 * i;
    for (let k = 0; k < Math.min(10, f.name.length); k++) buf[o + k] = f.name.charCodeAt(k);
    buf[o + 11] = f.type.charCodeAt(0);
    buf[o + 16] = f.len;
    buf[o + 17] = f.dec ?? 0;
  });
  buf[headerLen - 1] = 0x0d;
  // Latin-1 only (names are letters, digits, - and _ ; field names may hold Danish letters)
  const put = (o: number, s: string, len: number, right: boolean) => {
    const t = s.length > len ? s.slice(0, len) : right ? s.padStart(len, " ") : s.padEnd(len, " ");
    for (let k = 0; k < len; k++) {
      const c = t.charCodeAt(k);
      buf[o + k] = c < 256 ? c : 0x3f;
    }
  };
  records.forEach((rec, r) => {
    let o = headerLen + r * recLen;
    buf[o++] = 0x20;
    fields.forEach((f, i) => {
      const val = rec[i];
      put(o, f.type === "N" ? (typeof val === "number" ? val.toFixed(f.dec ?? 0) : "") : String(val ?? ""), f.len, f.type === "N");
      o += f.len;
    });
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}

/** .shp and .shx for polylines (3) or polygons (5); each record is a list of parts of [lon, lat]. */
function shpShx(shapeType: 3 | 5, records: number[][][][]): { shp: Uint8Array; shx: Uint8Array } {
  const bboxOf = (pts: number[][]) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const contents = records.map((parts) => {
    const pts = parts.flat();
    const len = 4 + 32 + 4 + 4 + 4 * parts.length + 16 * pts.length;
    const b = new Uint8Array(len);
    const v = new DataView(b.buffer);
    v.setInt32(0, shapeType, true);
    const bb = bboxOf(pts);
    bb.forEach((x, i) => v.setFloat64(4 + 8 * i, x, true));
    v.setInt32(36, parts.length, true);
    v.setInt32(40, pts.length, true);
    let start = 0;
    parts.forEach((p, i) => {
      v.setInt32(44 + 4 * i, start, true);
      start += p.length;
    });
    let o = 44 + 4 * parts.length;
    for (const [x, y] of pts) {
      v.setFloat64(o, x, true);
      v.setFloat64(o + 8, y, true);
      o += 16;
    }
    return b;
  });
  const all = records.flat(2);
  const bb = all.length ? bboxOf(all) : [0, 0, 0, 0];
  const header = (totalBytes: number) => {
    const h = new Uint8Array(100);
    const v = new DataView(h.buffer);
    v.setInt32(0, 9994, false);
    v.setInt32(24, totalBytes / 2, false);
    v.setInt32(28, 1000, true);
    v.setInt32(32, shapeType, true);
    bb.forEach((x, i) => v.setFloat64(36 + 8 * i, x, true));
    return h;
  };
  const shpLen = 100 + contents.reduce((s, c) => s + 8 + c.length, 0);
  const shp = new Uint8Array(shpLen);
  shp.set(header(shpLen), 0);
  const shx = new Uint8Array(100 + 8 * contents.length);
  shx.set(header(shx.length), 0);
  let o = 100;
  contents.forEach((c, i) => {
    const sv = new DataView(shp.buffer);
    sv.setInt32(o, i + 1, false);
    sv.setInt32(o + 4, c.length / 2, false);
    shp.set(c, o + 8);
    const xv = new DataView(shx.buffer);
    xv.setInt32(100 + 8 * i, o / 2, false);
    xv.setInt32(104 + 8 * i, c.length / 2, false);
    o += 8 + c.length;
  });
  return { shp, shx };
}

/** Clockwise ring (shapefile outer rings are clockwise). */
function clockwise(ring: number[][]): number[][] {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  return s >= 0 ? ring : [...ring].reverse();
}

/** The two shapefiles as files keyed by name. */
export function guidanceShapefiles(lines: GuidanceLine[], field: { name: string; boundary?: any }, stem: string): Record<string, Uint8Array | string> {
  const out: Record<string, Uint8Array | string> = {};
  const l = shpShx(3, lines.map((g) => [g.points.map((p) => [p.lon, p.lat])]));
  out[`${stem}_guidance_lines.shp`] = l.shp;
  out[`${stem}_guidance_lines.shx`] = l.shx;
  out[`${stem}_guidance_lines.dbf`] = dbf(
    [{ name: "NAME", type: "C", len: 20 }, { name: "ROW", type: "N", len: 6 }, { name: "KIND", type: "C", len: 5 }, { name: "TREES", type: "N", len: 6 }, { name: "LENGTH_M", type: "N", len: 10, dec: 2 }],
    lines.map((g) => [g.name, g.row, g.kind, g.trees, g.lengthM]),
  );
  out[`${stem}_guidance_lines.prj`] = WGS84_PRJ;
  const rings = outerRings(field.boundary);
  if (rings.length) {
    const b = shpShx(5, [rings.map(clockwise)]);
    out[`${stem}_boundary.shp`] = b.shp;
    out[`${stem}_boundary.shx`] = b.shx;
    out[`${stem}_boundary.dbf`] = dbf([{ name: "NAME", type: "C", len: 40 }], [[field.name]]);
    out[`${stem}_boundary.prj`] = WGS84_PRJ;
  }
  return out;
}

/** The whole download: TASKDATA/ for ISOBUS terminals, Shapefile/ for the rest, and a short read-me. */
export function guidanceFiles(rows: StakeoutRow[], field: { name: string; boundary?: any }, stem: string, opts: { prefix?: string; extendM?: number } = {}): { lines: GuidanceLine[]; files: Record<string, Uint8Array | string> } {
  const lines = guidanceLines(rows, opts);
  if (!lines.length) throw new Error("No rows with two or more trees to make guidance lines from.");
  const safe = stem.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "design";
  const shp = guidanceShapefiles(lines, field, safe);
  const files: Record<string, Uint8Array | string> = { "TASKDATA/TASKDATA.XML": isoxmlTaskdata(lines, field) };
  for (const [k, v] of Object.entries(shp)) files[`Shapefile/${k}`] = v;
  const curves = lines.filter((x) => x.kind === "CURVE").length;
  files["README.txt"] = [
    `Guidance lines for auto-steer: ${field.name}`,
    `${lines.length} rows (${lines.length - curves} straight AB lines${curves ? `, ${curves} curves` : ""}), named ${lines[0].name}..${lines[lines.length - 1].name} like the stake-out files.`,
    `Each line runs from the first to the last tree, ${opts.extendM ?? 5} m longer at both ends. Coordinates: WGS84/ETRS89 degrees.`,
    "",
    "ISOBUS terminals (CLAAS, Fendt, Case IH / New Holland, Müller, Kverneland, Topcon): copy the TASKDATA folder to the root of a USB stick",
    "and import it on the terminal (ISOXML version 4). Each row is its own guidance line (no parallel lines from it).",
    "",
    "Shapefile (Trimble, John Deere via Operations Center, Fendt field data converter, Ag Leader): the files in Shapefile/,",
    "lines in *_guidance_lines, the field in *_boundary. Keep the .shp, .shx, .dbf and .prj of each together.",
    "",
    "Check one line against a stake or tree on site before driving the field.",
    "",
  ].join("\r\n");
  return { lines, files };
}
