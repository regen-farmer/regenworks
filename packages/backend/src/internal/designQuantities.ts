// Quantities a design knows, for the offer's services calculator (pure).
import { area, length, lineString } from "@turf/turf";
import type { DesignQuantities } from "./services.ts";

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** The field's polygons (feature, geometry, collection or JSON text), as Polygon coordinates. */
function fieldPolygons(g: unknown): number[][][][] {
  try {
    const x = typeof g === "string" ? JSON.parse(g) : g;
    const geoms = x?.type === "FeatureCollection" ? (x.features ?? []).map((f: any) => f?.geometry) : [x?.type === "Feature" ? x.geometry : x];
    const out: number[][][][] = [];
    for (const geom of geoms) {
      if (geom?.type === "Polygon") out.push(geom.coordinates);
      else if (geom?.type === "MultiPolygon") out.push(...geom.coordinates);
    }
    return out;
  } catch {
    return [];
  }
}

/** Trees, rows, metres of tree row, field boundary (m) and area (ha), tree-cover area (ha). */
export function designQuantities(
  layout: { treeRowLines?: any[]; plantCountArray?: { count?: number }[]; treeMarkerArray?: any[]; stripAreasM2?: number[] },
  field: unknown,
): DesignQuantities {
  const trees = layout.plantCountArray?.length
    ? layout.plantCountArray.reduce((n, p) => n + (p.count || 0), 0)
    : layout.treeMarkerArray?.length ?? 0;
  let rowM = 0;
  let rows = 0;
  for (const r of layout.treeRowLines ?? []) {
    const coords = r?.line?.geometry?.coordinates ?? r?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    rows += 1;
    rowM += length(lineString(coords), { units: "kilometers" }) * 1000;
  }
  // area of every part (holes excluded); boundary = outer rings only (where a fence goes)
  let fieldM2 = 0;
  let perimeterM = 0;
  for (const rings of fieldPolygons(field)) {
    if (!rings?.[0] || rings[0].length < 4) continue;
    fieldM2 += area({ type: "Polygon", coordinates: rings } as any);
    perimeterM += length(lineString(rings[0]), { units: "kilometers" }) * 1000;
  }
  const stripM2 = (layout.stripAreasM2 ?? []).reduce((n, a) => n + (Number.isFinite(a) ? a : 0), 0);
  return {
    trees,
    rows,
    rowM: round(rowM),
    perimeterM: round(perimeterM),
    fieldHa: round(fieldM2 / 10_000, 2),
    treeHa: round(stripM2 / 10_000, 2),
  };
}
