/**
 * Unified Layout Service
 *
 * This service provides a single interface for layout generation that
 * automatically uses the best available backend:
 *
 * 1. Electron (desktop): Native Rust + GEOS via napi-rs (~163ms release)
 * 2. Tauri (desktop): Native Rust + GEOS (~494ms debug, ~300ms release est.)
 * 3. Browser (web): TypeScript fallback
 */

import { isTauri, isElectron } from "./platform";
import { systemBasedLayoutAsync } from "@rw/modelling/gis-ts/system_based_layout.ts";

// Types that match the layout response structure
export interface LayoutResult {
  headlandPolygon: GeoJSON.Feature;
  marginPolygon: GeoJSON.Feature;
  treeRowLines: Array<{
    line: GeoJSON.Feature;
    systemDesignRowIndex: number;
  }>;
  groundCoverAreas: Array<{
    polygon: GeoJSON.Feature;
    species: unknown;
    systemDesignRowIndex: number;
  }>;
  treeMarkerArray: Array<{
    point: GeoJSON.Feature;
    circle: GeoJSON.Feature;
    species: unknown;
  }>;
  stripPolygons: Array<{
    polygon: GeoJSON.Feature;
    systemDesignRowIndex: number;
  }>;
  speciesCountArray: Array<{
    species: unknown;
    count: number;
  }>;
  headlandSides: GeoJSON.Feature[];
  sidesCloseToBearing: GeoJSON.Feature[];
  intersectionPoints: GeoJSON.Feature[];
  groundCoverAreasM2: Record<string, number>;
  stripAreasM2: number[];
}

export interface SystemDesign {
  rows: Array<{
    sequence: Array<{
      species: unknown;
      spacingAfter: number;
    }>;
    width: number;
    offset?: {
      before?: number;
      after?: number;
    };
    groundcover?: unknown;
  }>;
  bearing: number;
  margin: number;
  headland: number;
}

interface LayoutResponse {
  success: boolean;
  data?: LayoutResult;
  error?: string;
  timingMs?: number;
}

/**
 * Generate a layout using the best available backend
 *
 * @param systemDesign - The system design configuration
 * @param fieldGeometry - GeoJSON string of the field polygon
 * @param apiBaseUrl - Base URL for API fallback (required for web)
 * @returns Layout result
 */
export async function generateLayout(systemDesign: any, fieldGeometry: any): Promise<any> {
  if (isElectron()) {
    return generateLayoutElectron(systemDesign, fieldGeometry);
  }
  if (isTauri()) {
    return generateLayoutTauri(systemDesign, fieldGeometry);
  }
  return generateLayoutBrowser(systemDesign, fieldGeometry);
}

/**
 * Generate layout using Electron (native Rust + GEOS via napi-rs)
 */
async function generateLayoutElectron(systemDesign: any, fieldGeometry: any): Promise<any> {
  const geometryString =
    typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);

  const electronAPI = (window as unknown as { electronAPI: { invoke: (c: string, a: unknown) => Promise<string> } }).electronAPI;

  // Serialize to JSON string before IPC — strips reactive proxies / Mongoose docs.
  const systemDesignJson = JSON.stringify(systemDesign);

  const resultJson = await electronAPI.invoke("generate_layout", {
    systemdesign: systemDesignJson,
    fieldGeometry: geometryString,
  });

  const response: LayoutResponse = JSON.parse(resultJson);

  if (!response.success || !response.data) {
    throw new Error(response.error || "Layout generation failed");
  }

  return response.data;
}

/**
 * Generate layout using Tauri (native Rust + GEOS)
 */
// Cached Tauri invoke — loaded once on first use to avoid bundling in web builds
let _tauriInvoke: ((cmd: string, args: unknown) => Promise<unknown>) | null = null;
async function getTauriInvoke(): Promise<(cmd: string, args: unknown) => Promise<unknown>> {
  if (!_tauriInvoke) {
    const { invoke } = await import("@tauri-apps/api/core");
    _tauriInvoke = invoke;
  }
  return _tauriInvoke!;
}

async function generateLayoutTauri(systemDesign: any, fieldGeometry: any): Promise<any> {
  const invoke = await getTauriInvoke();

  const geometryString =
    typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);

  // Step 1: compute (invoke returns nothing — tiny IPC round-trip)
  await invoke("generate_layout", {
    systemdesign: systemDesign,
    fieldGeometry: geometryString,
  });

  // Step 2: fetch result via OS URL loading (not WKWebView IPC bridge) — ~10ms for 9.47MB
  const res = await fetch("rwlayout://localhost/layout");
  const resultJson = await res.text();

  const response: LayoutResponse = JSON.parse(resultJson);

  if (!response.success || !response.data) {
    throw new Error(response.error || "Layout generation failed");
  }

  return response.data;
}

/**
 * Generate layout using Browser (TypeScript model directly)
 */
async function generateLayoutBrowser(systemDesign: any, fieldGeometry: any): Promise<any> {
  const startTime = performance.now();

  // Parse if it's a string, as systemBasedLayoutAsync expects an object
  const geometryObj = typeof fieldGeometry === "string" ? JSON.parse(fieldGeometry) : fieldGeometry;

  const layout = await systemBasedLayoutAsync(systemDesign, geometryObj);

  console.log(`[Browser TS] Layout generated in ${(performance.now() - startTime).toFixed(1)}ms`);
  return layout;
}

/**
 * Check if fast native layout is available
 */
export function hasNativeLayout(): boolean {
  return isElectron() || isTauri();
}
