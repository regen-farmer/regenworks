/**
 * Grid layout: its own layout model, next to the row layout in layout-turf-js.
 *
 * The row layout runs every row from field edge to field edge and starts each
 * row's first tree where that row meets the headland. On a field whose edge is
 * not at right angles to the rows, each row starts a little further along, so
 * the trees form a parallelogram. The grid layout instead places one fixed
 * lattice over the field and keeps the lattice points that fall inside it:
 *
 *  1. Project the field to metres (Transverse Mercator centred on the field,
 *     scale 1) and turn it so the rows run along u (the design bearing) and v
 *     points to the right of that, across the rows.
 *  2. The design's rows are the pattern tile. Their widths repeat across
 *     (v), and each row's sequence repeats along (u) with period P = the sum
 *     of its spacings. Every row measures its trees from the same anchor, so
 *     trees and species line up in columns at right angles across the rows.
 *  3. The anchor is where the first tree of the first row sits: a point set on
 *     the map, or a corner of the field (+ shifts along and across).
 *  4. Each lattice row is cut by the headland polygon (all its pieces, so
 *     concave fields and holes work); a row's offsets trim its ends. Trees are
 *     the lattice points on those pieces. Strips and ground cover follow the
 *     lattice rows.
 *
 * The output has the same shape as the row layout, so the map, counts, tree
 * register, offers and the stake-out export use it unchanged. The row layout
 * itself is not touched: designs without `layout.mode = "grid"` never get here.
 */
import { area as turfArea, buffer, circle, helpers as turf, intersect } from "@turf/turf";
import type {
  Feature,
  MultiPolygon,
  Polygon,
  GeoJsonProperties as Properties,
} from "geojson";
import type { GridCorner, IGridSettings } from "@rw/db/schemas/systemdesign.ts";
import { applyHeadland } from "../layout-turf-js/headland.ts";
import { fromTm, toTm, type TmProjection } from "../planting/utm.ts";

/** True when a design asks for the grid layout model. */
export function isGridLayout(design: any): boolean {
  return design?.layout?.mode === "grid";
}

type Row = {
  sequence: { species: any; spacingAfter: number }[];
  offset?: { before?: number; after?: number };
  groundcover?: any;
  width: number;
};

/** Distances shorter than this count as equal (m): 1 mm. */
const EPS = 1e-3;
/** Safety cap so a tiny spacing on a big field can't hang the page. */
const MAX_TREES = 500_000;

export type GridInfo = {
  /** Where the first tree of the first row sits, [lng, lat]. */
  anchor: [number, number];
  /** Repeat of the row widths across (m). */
  tileWidth: number;
  /** Row spacing along each design row (m): the sum of its spacings. */
  periods: number[];
  /** Rotation of the rows (degrees clockwise from north). */
  bearing: number;
};

/** A frame in metres: u along the rows (bearing), v across to the right. */
function makeFrame(lon0: number, bearingDeg: number) {
  const proj: TmProjection = { lon0, k0: 1, fe: 0, fn: 0 };
  const t = (bearingDeg * Math.PI) / 180;
  const s = Math.sin(t);
  const c = Math.cos(t);
  return {
    toUV([lon, lat]: number[]): [number, number] {
      const { e, n } = toTm(lon, lat, proj);
      return [e * s + n * c, e * c - n * s];
    },
    fromUV(u: number, v: number): [number, number] {
      const e = u * s + v * c;
      const n = u * c - v * s;
      const { lon, lat } = fromTm(e, n, proj);
      return [lon, lat];
    },
  };
}

/** All rings (outer and holes) of a Polygon or MultiPolygon feature. */
function ringsOf(feature: any): number[][][] {
  const g = feature?.geometry ?? feature;
  if (!g) return [];
  if (g.type === "Polygon") return g.coordinates;
  if (g.type === "MultiPolygon") return g.coordinates.flat();
  return [];
}

/**
 * Pieces of the line v = const inside the polygon, as [uStart, uEnd] pairs.
 * Even-odd rule over all ring edges, so holes and separate parts work. An edge
 * counts when its ends are on different sides of the line (half-open), so a
 * vertex exactly on the line is counted once.
 */
function piecesAtV(ringsUV: [number, number][][], v: number): [number, number][] {
  const us: number[] = [];
  for (const ring of ringsUV) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [u1, v1] = ring[i];
      const [u2, v2] = ring[i + 1];
      if (v1 <= v !== v2 <= v) {
        us.push(u1 + ((v - v1) / (v2 - v1)) * (u2 - u1));
      }
    }
  }
  us.sort((a, b) => a - b);
  const pieces: [number, number][] = [];
  for (let i = 0; i + 1 < us.length; i += 2) {
    if (us[i + 1] - us[i] > EPS) pieces.push([us[i], us[i + 1]]);
  }
  return pieces;
}

function finite(x: unknown, fallback = 0): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

/** Corner → which way rows (v) and trees (u) count from. */
function cornerSigns(corner: GridCorner | null | undefined): { su: 1 | -1; sv: 1 | -1 } {
  switch (corner) {
    case "start-right":
      return { su: 1, sv: -1 };
    case "end-left":
      return { su: -1, sv: 1 };
    case "end-right":
      return { su: -1, sv: -1 };
    default:
      return { su: 1, sv: 1 };
  }
}

function speciesKey(species: any): string {
  return String(species?._id ?? species?.id ?? species);
}

/** Margin polygon: the field shrunk by the margin, as in the row layout. */
function marginOf(polygon: any, margin: number) {
  if (!(margin > 0)) return polygon;
  try {
    return buffer(polygon, -margin, { units: "meters" }) ?? polygon;
  } catch {
    return polygon;
  }
}

/**
 * Lay out a design with the grid model. Same output shape as
 * `systemBasedLayoutSync`, plus `grid` (the effective anchor and periods).
 */
export function gridLayout(systemdesign: any, fieldGeometry: any) {
  const polygon = typeof fieldGeometry === "string" ? JSON.parse(fieldGeometry) : fieldGeometry;
  if (!polygon?.geometry) throw new Error("Invalid polygon structure");

  const rows: Row[] = (systemdesign?.rows ?? []) as Row[];
  const bearing = finite(systemdesign?.bearing);
  const margin = finite(systemdesign?.margin);
  const headland = finite(systemdesign?.headland);
  const settings: IGridSettings = systemdesign?.layout?.grid ?? {};

  // Same field shrinking as the row layout: margin all round, then headland
  // on the sides the rows run into.
  const marginPolygon = marginOf(polygon, margin);
  const { headlandSides, headlandPolygon, sidesCloseToBearing, intersectionPoints } =
    applyHeadland(marginPolygon, headland, bearing);

  const empty = {
    speciesCountArray: [] as any[],
    headlandSides,
    sidesCloseToBearing,
    treeRowLines: [] as any[],
    headlandPolygon,
    marginPolygon,
    groundCoverAreas: [] as any[],
    intersectionPoints,
    treeMarkerArray: [] as any[],
    groundCoverAreasM2: {} as Record<string, number>,
    stripPolygons: [] as any[],
    stripAreasM2: [] as number[],
    grid: undefined as GridInfo | undefined,
  };

  const widths = rows.map((r) => Math.max(0, finite(r.width)));
  const tileWidth = widths.reduce((a, b) => a + b, 0);
  const rings = ringsOf(headlandPolygon);
  if (!rows.length || !(tileWidth > EPS) || !rings.length) return empty;

  // Frame centred on the field; the corner signs flip u and/or v so the
  // algorithm below always counts from the low corner.
  const outer = rings[0];
  const lon0 = outer.reduce((a, p) => a + p[0], 0) / outer.length;
  const frame = makeFrame(lon0, bearing);
  const { su, sv } = cornerSigns(settings.corner);
  const toP = (lonlat: number[]): [number, number] => {
    const [u, v] = frame.toUV(lonlat);
    return [su * u, sv * v];
  };
  const fromP = (u: number, v: number) => frame.fromUV(su * u, sv * v);
  const ringsP = rings.map((ring) => ring.map(toP));

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const ring of ringsP) {
    for (const [u, v] of ring) {
      uMin = Math.min(uMin, u);
      uMax = Math.max(uMax, u);
      vMin = Math.min(vMin, v);
      vMax = Math.max(vMax, v);
    }
  }

  // Row centre lines within one tile, measured from the first row's centre
  // (as in the row layout, the first strip starts at the edge and its trees
  // sit half a row width in).
  const rowCentre: number[] = [];
  let acc = 0;
  for (const w of widths) {
    rowCentre.push(acc + w / 2 - widths[0] / 2);
    acc += w;
  }

  // Anchor: the first tree of the first row.
  const anchorPoint = Array.isArray(settings.anchor) && settings.anchor.length === 2
    && settings.anchor.every((x) => typeof x === "number" && Number.isFinite(x))
    ? (settings.anchor as [number, number])
    : null;
  let [uA, vA] = anchorPoint ? toP(anchorPoint) : [uMin, vMin + widths[0] / 2];
  uA += finite(settings.shiftAlong);
  vA += finite(settings.shiftAcross);

  // Each design row's sequence: period and where each entry sits in it.
  const seqs = rows.map((row) => {
    const seq = (row.sequence ?? []).filter((e) => e && e.species);
    const offsets: number[] = [];
    let p = 0;
    for (const e of seq) {
      offsets.push(p);
      p += Math.max(0, finite(e.spacingAfter));
    }
    return { seq, offsets, period: p };
  });

  const extentRows = finite(settings.extent?.rows, 0);
  const extentLength = finite(settings.extent?.length, 0);
  const offsetPattern = settings.pattern === "offset";

  // Tile repeats that can reach the field.
  const tFrom = Math.floor((vMin - vA - (tileWidth + widths[0])) / tileWidth);
  const tTo = Math.ceil((vMax - vA + tileWidth) / tileWidth);

  const treeRowLines: any[] = [];
  const treeMarkerArray: any[] = [];
  const stripPolygons: any[] = [];
  const stripAreasM2: number[] = [];
  const groundCoverAreas: any[] = [];
  const groundCoverAreasM2: Record<string, number> = {};

  for (let t = tFrom; t <= tTo; t++) {
    for (let r = 0; r < rows.length; r++) {
      const latticeRow = t * rows.length + r; // 0 = the anchor's row
      if (extentRows > 0 && (latticeRow < 0 || latticeRow >= extentRows)) continue;
      const v = vA + t * tileWidth + rowCentre[r];
      const w = widths[r];

      // Strip (and ground cover): the band of this row, cut by the field.
      if (w > 0 && v + w / 2 > vMin && v - w / 2 < vMax) {
        const uLo = extentLength > 0 ? Math.max(uMin, uA) - 1 : uMin - 1;
        const uHi = extentLength > 0 ? Math.min(uMax, uA + extentLength) + 1 : uMax + 1;
        const band = turf.polygon([
          [
            fromP(uLo, v - w / 2),
            fromP(uHi, v - w / 2),
            fromP(uHi, v + w / 2),
            fromP(uLo, v + w / 2),
            fromP(uLo, v - w / 2),
          ],
        ]);
        let strip: Feature<Polygon | MultiPolygon, Properties> | null = null;
        try {
          strip = intersect({
            type: "FeatureCollection",
            features: [headlandPolygon, band],
          } as any) as any;
        } catch {
          strip = null;
        }
        if (strip) {
          strip.properties = { name: `strip_${stripPolygons.length}`, rowIndex: r };
          const m2 = turfArea(strip);
          stripPolygons.push(strip);
          stripAreasM2.push(m2);
          const gc = rows[r].groundcover;
          const gcId = gc ? String(gc?._id ?? gc) : "";
          if (gcId) {
            groundCoverAreasM2[gcId] = (groundCoverAreasM2[gcId] ?? 0) + m2;
            const parts =
              strip.geometry.type === "MultiPolygon"
                ? strip.geometry.coordinates
                : [strip.geometry.coordinates];
            for (const coords of parts) {
              groundCoverAreas.push(
                turf.polygon(coords as any, {
                  name: `alleypoly${groundCoverAreas.length}`,
                  speciesId: gcId,
                }),
              );
            }
          }
        }
      }

      // Tree row pieces and the lattice trees on them.
      if (v < vMin - EPS || v > vMax + EPS) continue;
      const { before = 0, after = 0 } = rows[r].offset ?? {};
      const { seq, offsets, period } = seqs[r];
      const shift = offsetPattern && Math.abs(latticeRow) % 2 === 1 ? period / 2 : 0;

      for (let [a, b] of piecesAtV(ringsP, v)) {
        a += Math.max(0, finite(before));
        b -= Math.max(0, finite(after));
        if (extentLength > 0) {
          a = Math.max(a, uA);
          b = Math.min(b, uA + extentLength);
        }
        if (b - a <= EPS) continue;

        const treeRowIndex = treeRowLines.length;
        treeRowLines.push({
          line: turf.lineString([fromP(a, v), fromP(b, v)], { name: `line-${treeRowIndex}` }),
          systemDesignRowIndex: r,
        });

        if (!(period > EPS) || !seq.length) continue;
        const positions: { u: number; j: number }[] = [];
        for (let j = 0; j < seq.length; j++) {
          const base = uA + shift + offsets[j];
          const mFrom = Math.ceil((a - EPS - base) / period);
          const mTo = Math.floor((b + EPS - base) / period);
          for (let m = mFrom; m <= mTo; m++) positions.push({ u: base + m * period, j });
          if (treeMarkerArray.length + positions.length > MAX_TREES) {
            throw new Error(
              `The grid would have more than ${MAX_TREES} trees; check the spacings.`,
            );
          }
        }
        positions.sort((p, q) => p.u - q.u);
        for (const { u, j } of positions) {
          const coords = fromP(u, v);
          const point = turf.point(coords);
          treeMarkerArray.push({
            species: seq[j].species,
            point,
            circle: circle(coords, 1.4, { units: "meters", steps: 12 }),
            treeRowIndex,
            systemDesignRowIndex: r,
            // Index in the design's own sequence (blank entries skipped above).
            sequenceIndex: (rows[r].sequence ?? []).indexOf(seq[j]),
          });
        }
      }
    }
  }

  const counts = new Map<string, { species: any; count: number }>();
  for (const tree of treeMarkerArray) {
    const key = speciesKey(tree.species);
    const entry = counts.get(key) ?? { species: tree.species, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }

  const grid: GridInfo = {
    anchor: fromP(uA, vA),
    tileWidth,
    periods: seqs.map((s) => s.period),
    bearing,
  };

  return {
    ...empty,
    speciesCountArray: [...counts.values()],
    treeRowLines,
    treeMarkerArray,
    groundCoverAreas,
    groundCoverAreasM2,
    stripPolygons,
    stripAreasM2,
    grid,
  };
}
