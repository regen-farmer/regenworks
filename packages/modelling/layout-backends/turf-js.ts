import { systemBasedLayout } from "../layout-turf-js/system_based_layout.ts";
import type { LayoutBackendInput, LayoutBackendRun, LayoutResult } from "./types.ts";

function normalizeSystemDesign(systemDesign: any) {
  return {
    ...systemDesign,
    rows: (systemDesign.rows ?? []).map((row: any) => ({
      ...row,
      sequence: (row.sequence ?? []).map((entry: any) => ({
        species: entry.species,
        spacingAfter: entry.spacingAfter,
      })),
    })),
  };
}

export async function runTurfJsLayout(input: LayoutBackendInput): Promise<LayoutBackendRun> {
  const started = Date.now();
  const layout = systemBasedLayout(
    normalizeSystemDesign(input.systemDesign) as any,
    input.fieldGeometry,
  ) as LayoutResult;

  return {
    implementation: "turf-js",
    layout,
    timingMs: Date.now() - started,
  };
}
