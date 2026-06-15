export type LayoutBackendName =
  | "turf-js"
  | "geos-wasm-geo"
  | "native-geos"
  | "geometry-kernel";

export interface LayoutBackendInput {
  name?: string;
  systemDesign: any;
  fieldGeometry: any;
}

export interface LayoutResult {
  headlandPolygon: any;
  marginPolygon: any;
  treeRowLines: any[];
  groundCoverAreas: any[];
  treeMarkerArray: any[];
  stripPolygons?: any[];
  speciesCountArray?: any[];
  headlandSides?: any[];
  sidesCloseToBearing?: any[];
  intersectionPoints?: any[];
  groundCoverAreasM2?: Record<string, number>;
  stripAreasM2?: number[];
}

export interface LayoutResponse {
  success: boolean;
  data?: LayoutResult;
  error?: string;
  timingMs?: number;
}

export interface LayoutBackendRun {
  implementation: LayoutBackendName;
  layout: LayoutResult;
  timingMs: number;
  engineTimingMs?: number;
}

export type LayoutBackendRunner = (input: LayoutBackendInput) => Promise<LayoutBackendRun>;

export function fieldGeometryJson(fieldGeometry: any): string {
  return typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);
}

export function layoutRequest(input: LayoutBackendInput) {
  return {
    systemdesign: input.systemDesign,
    fieldGeometry: fieldGeometryJson(input.fieldGeometry),
  };
}

