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
/** Safety caps so a tiny spacing on a big field can't hang the page or server. */
const MAX_TREES = 500_000;
const MAX_LATTICE_ROWS = 20_000;
/** Smallest row width (whole tile) and tree spacing the grid accepts (m). */
export const MIN_TILE_WIDTH = 0.5;
export const MIN_SPACING = 0.1;

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
  if (!rows.length || !rings.length) return empty;
  if (tileWidth < MIN_TILE_WIDTH) {
    throw new Error(`Grid rows must be at least ${MIN_TILE_WIDTH} m wide together.`);
  }

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

  if (((vMax - vMin) / tileWidth + 2) * rows.length > MAX_LATTICE_ROWS) {
    throw new Error(`The grid would have more than ${MAX_LATTICE_ROWS} rows; check the row widths.`);
  }

  // Each design row's sequence: period and where each entry sits in it.
  // Blank entries (no species yet) keep their spacing but get no tree, as in
  // the row layout.
  const seqs = rows.map((row) => {
    const seq = row.sequence ?? [];
    const offsets: number[] = [];
    let p = 0;
    for (const e of seq) {
      offsets.push(p);
      p += Math.max(0, finite(e?.spacingAfter));
    }
    const planted = seq.map((e, j) => (e && e.species ? j : -1)).filter((j) => j >= 0);
    // A row whose spacings add up to 0 has no trees (as in the row layout).
    if (planted.length && p > 0 && p < MIN_SPACING) {
      throw new Error(`Tree spacing along a grid row must be at least ${MIN_SPACING} m.`);
    }
    // Offset (triangular) pattern: every other row moves half a tree spacing.
    const halfStep = seq.length ? p / seq.length / 2 : 0;
    return { seq, offsets, period: p, planted, halfStep };
  });

  // Offset pattern counts tree rows only (alley rows without trees don't
  // take a turn), so "every other row" means every other tree row.
  const treeRowOrder = seqs.map(() => -1);
  let nTreeRows = 0;
  const treeRowsBefore = seqs.map(() => 0);
  seqs.forEach((q, r) => {
    treeRowsBefore[r] = nTreeRows;
    if (q.planted.length && q.period > EPS) treeRowOrder[r] = nTreeRows++;
  });

  const extentRows = Math.floor(finite(settings.extent?.rows, 0));
  const extentLength = finite(settings.extent?.length, 0);
  const offsetPattern = settings.pattern === "offset";

  // Tile repeats that can reach the field.
  const tFrom = Math.floor((vMin - vA - (tileWidth + widths[0])) / tileWidth);
  const tTo = Math.ceil((vMax - vA + tileWidth) / tileWidth);

  const treeRowLines: any[] = [];
  const treeMarkerArray: any[] = [];
  type StripOf = { strip: Feature<Polygon | MultiPolygon, Properties> | null; r: number };
  const rowStrips: StripOf[] = [];
  const extraStrips: StripOf[] = [];

  const clip = (a: any, b: any): Feature<Polygon | MultiPolygon, Properties> | null => {
    try {
      return intersect({ type: "FeatureCollection", features: [a, b] } as any) as any;
    } catch {
      return null;
    }
  };
  /** The field inside u ∈ [uLo, uHi], v ∈ [v − w/2, v + w/2]. */
  const cutBand = (uLo: number, uHi: number, v: number, w: number) =>
    clip(
      headlandPolygon,
      turf.polygon([
        [
          fromP(uLo, v - w / 2),
          fromP(uHi, v - w / 2),
          fromP(uHi, v + w / 2),
          fromP(uLo, v + w / 2),
          fromP(uLo, v - w / 2),
        ],
      ]),
    );

  for (let t = tFrom; t <= tTo; t++) {
    for (let r = 0; r < rows.length; r++) {
      const v = vA + t * tileWidth + rowCentre[r];
      const w = widths[r];
      // Tree rows are counted from the anchor's row (turn 0). An alley row
      // sits between tree turn − 1 and turn.
      const treeTurn = t * nTreeRows + (treeRowOrder[r] >= 0 ? treeRowOrder[r] : treeRowsBefore[r]);
      if (extentRows > 0) {
        const inside =
          treeRowOrder[r] >= 0
            ? treeTurn >= 0 && treeTurn < extentRows
            : treeTurn >= 1 && treeTurn <= extentRows - 1;
        if (!inside) continue;
      }

      // The band of this row (its strip), cut by the field.
      let band: Feature<Polygon | MultiPolygon, Properties> | null = null;
      if (w > 0 && v + w / 2 > vMin && v - w / 2 < vMax) {
        const uLo = extentLength > 0 ? Math.max(uMin - 1, uA) : uMin - 1;
        const uHi = extentLength > 0 ? Math.min(uMax + 1, uA + extentLength) : uMax + 1;
        if (uHi > uLo) band = cutBand(uLo, uHi, v, w);
      }

      // Tree row pieces (and the lattice trees on them).
      const pieces = v < vMin - EPS || v > vMax + EPS ? [] : piecesAtV(ringsP, v);
      const { seq, offsets, period, planted, halfStep } = seqs[r];
      const shift = offsetPattern && treeRowOrder[r] >= 0 && Math.abs(treeTurn) % 2 === 1 ? halfStep : 0;
      // Row offsets are at the start and end of the row in the field's own
      // direction, whichever corner the grid counts from.
      const off = rows[r].offset ?? {};
      const startOff = Math.max(0, finite(su === 1 ? off.before : off.after));
      const endOff = Math.max(0, finite(su === 1 ? off.after : off.before));

      const kept: { a0: number; b0: number; a: number; b: number }[] = [];
      for (const [a0, b0] of pieces) {
        let a = a0 + startOff;
        let b = b0 - endOff;
        if (extentLength > 0) {
          a = Math.max(a, uA);
          b = Math.min(b, uA + extentLength);
        }
        if (b - a > EPS) kept.push({ a0, b0, a, b });
      }

      if (!kept.length) {
        // No tree row here (the band only grazes the field): its strip still
        // counts for areas, after the strips that pair with tree rows.
        if (band) extraStrips.push({ strip: band, r });
        continue;
      }

      for (let k = 0; k < kept.length; k++) {
        const { a, b } = kept[k];
        const treeRowIndex = treeRowLines.length;
        treeRowLines.push({
          line: turf.lineString([fromP(a, v), fromP(b, v)], { name: `line-${treeRowIndex}` }),
          systemDesignRowIndex: r,
        });

        // This row piece's share of the band: split halfway between pieces,
        // so strips pair 1:1 with tree rows and still cover the whole band.
        let strip: Feature<Polygon | MultiPolygon, Properties> | null = band;
        if (band && kept.length > 1) {
          const lo = k === 0 ? uMin - 1 : (kept[k - 1].b0 + kept[k].a0) / 2;
          const hi = k === kept.length - 1 ? uMax + 1 : (kept[k].b0 + kept[k + 1].a0) / 2;
          strip = clip(band, cutBand(lo, hi, v, w + 2));
        }
        rowStrips.push({ strip, r });

        if (!(period > EPS) || !planted.length) continue;
        let count = 0;
        for (const j of planted) {
          const base = uA + shift + offsets[j];
          count += Math.max(0, Math.floor((b + EPS - base) / period) - Math.ceil((a - EPS - base) / period) + 1);
        }
        if (treeMarkerArray.length + count > MAX_TREES) {
          throw new Error(`The grid would have more than ${MAX_TREES} trees; check the spacings.`);
        }
        const positions: { u: number; j: number }[] = [];
        for (const j of planted) {
          const base = uA + shift + offsets[j];
          const mFrom = Math.ceil((a - EPS - base) / period);
          const mTo = Math.floor((b + EPS - base) / period);
          for (let m = mFrom; m <= mTo; m++) positions.push({ u: base + m * period, j });
        }
        positions.sort((p, q) => p.u - q.u);
        for (const { u, j } of positions) {
          const coords = fromP(u, v);
          treeMarkerArray.push({
            species: seq[j].species,
            point: turf.point(coords),
            circle: circle(coords, 1.4, { units: "meters", steps: 12 }),
            treeRowIndex,
            systemDesignRowIndex: r,
            sequenceIndex: j,
          });
        }
      }
    }
  }

  // Strips: first one per tree row (same index as treeRowLines, null when the
  // row has no width), then bands without a tree row. Ground cover per strip.
  const stripPolygons: any[] = [];
  const stripAreasM2: number[] = [];
  const groundCoverAreas: any[] = [];
  const groundCoverAreasM2: Record<string, number> = {};
  for (const { strip, r } of [...rowStrips, ...extraStrips]) {
    if (!strip) {
      stripPolygons.push(null);
      stripAreasM2.push(0);
      continue;
    }
    strip.properties = { name: `strip_${stripPolygons.length}`, rowIndex: r };
    const m2 = turfArea(strip);
    stripPolygons.push(strip);
    stripAreasM2.push(m2);
    const gc = rows[r].groundcover;
    const gcId = gc ? String(gc?._id ?? gc) : "";
    if (!gcId) continue;
    groundCoverAreasM2[gcId] = (groundCoverAreasM2[gcId] ?? 0) + m2;
    const parts =
      strip.geometry.type === "MultiPolygon" ? strip.geometry.coordinates : [strip.geometry.coordinates];
    for (const coords of parts) {
      groundCoverAreas.push(
        turf.polygon(coords as any, { name: `alleypoly${groundCoverAreas.length}`, speciesId: gcId }),
      );
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
