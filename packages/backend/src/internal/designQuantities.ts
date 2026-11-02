// Quantities a design knows, for the offer's services calculator (pure).
import { area, length, lineString, polygonToLine } from "@turf/turf";
import type { DesignQuantities } from "./services.ts";

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** The field boundary as a GeoJSON Polygon/MultiPolygon (feature, geometry or JSON text). */
function fieldGeometry(g: unknown): any | null {
  try {
    const x = typeof g === "string" ? JSON.parse(g) : g;
    const geom = x?.type === "Feature" ? x.geometry : x?.type === "FeatureCollection" ? x.features?.[0]?.geometry : x;
    return geom?.type === "Polygon" || geom?.type === "MultiPolygon" ? geom : null;
  } catch {
    return null;
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
  const geom = fieldGeometry(field);
  const feature = geom ? { type: "Feature" as const, properties: {}, geometry: geom } : null;
  const fieldM2 = feature ? area(feature as any) : 0;
  let perimeterM = 0;
  if (feature) {
    const outline: any = polygonToLine(feature as any);
    const parts = outline.type === "FeatureCollection" ? outline.features : [outline];
    for (const p of parts) perimeterM += length(p, { units: "kilometers" }) * 1000;
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
