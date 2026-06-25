/**
 * Unified Layout Service
 *
 * This service provides a single interface for layout generation that
 * automatically uses the best available backend:
 *
 * 1. Electron desktop: private native layout through the native addon
 * 2. Browser web: private Rust WASM layout by default, with selectable alternatives
 */

import { isElectron } from "./platform";

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

type GeometryKernelWasmModule =
  typeof import("@rw/modelling/layout-geometry-kernel/pkg/geometry_kernel_layout.js");
type GeosWasmGeoModule = typeof import("@rw/modelling/layout-geos-wasm-geo/pkg/gis_rs.js");
type TurfLayoutModule = typeof import("@rw/modelling/layout-turf-js/system_based_layout.ts");
type BrowserLayoutBackend = "turf-js" | "geos-wasm-geo" | "geometry-kernel";

let _geometryKernelWasmModule: Promise<GeometryKernelWasmModule> | null = null;
let _geosWasmGeoModule: Promise<GeosWasmGeoModule> | null = null;
let _turfLayoutModule: Promise<TurfLayoutModule> | null = null;
const requestedLayoutBackend = import.meta.env.VITE_LAYOUT_BACKEND;
const explicitBrowserLayoutBackend =
  requestedLayoutBackend === "geos-wasm-geo" ||
  requestedLayoutBackend === "geometry-kernel" ||
  requestedLayoutBackend === "turf-js" ||
  import.meta.env.VITE_USE_WASM_LAYOUT === "true";
const browserLayoutBackend: BrowserLayoutBackend =
  requestedLayoutBackend === "geos-wasm-geo" || import.meta.env.VITE_USE_WASM_LAYOUT === "true"
    ? "geos-wasm-geo"
    : requestedLayoutBackend === "turf-js"
      ? "turf-js"
      : "geometry-kernel";
const forceBrowserLayoutBackend =
  explicitBrowserLayoutBackend || import.meta.env.VITE_FORCE_BROWSER_LAYOUT === "true";
const browserLayoutFallbackEnabled = import.meta.env.VITE_LAYOUT_BACKEND_FALLBACK === "true";

function getGeometryKernelWasmModule(): Promise<GeometryKernelWasmModule> {
  if (!_geometryKernelWasmModule) {
    _geometryKernelWasmModule = import(
      "@rw/modelling/layout-geometry-kernel/pkg/geometry_kernel_layout.js"
    )
      .then(async (module) => {
        await module.default();
        return module;
      })
      .catch((error) => {
        _geometryKernelWasmModule = null;
        throw error;
      });
  }

  return _geometryKernelWasmModule;
}

function getGeosWasmGeoModule(): Promise<GeosWasmGeoModule> {
  if (!_geosWasmGeoModule) {
    _geosWasmGeoModule = import("@rw/modelling/layout-geos-wasm-geo/pkg/gis_rs.js")
      .then(async (module) => {
        await module.default();
        return module;
      })
      .catch((error) => {
        _geosWasmGeoModule = null;
        throw error;
      });
  }

  return _geosWasmGeoModule;
}

function getTurfLayoutModule(): Promise<TurfLayoutModule> {
  if (!_turfLayoutModule) {
    _turfLayoutModule = import("@rw/modelling/layout-turf-js/system_based_layout.ts").catch((error) => {
      _turfLayoutModule = null;
      throw error;
    });
  }

  return _turfLayoutModule;
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
  if (isElectron() && !forceBrowserLayoutBackend) {
    return generateLayoutElectron(systemDesign, fieldGeometry);
  }
  return generateLayoutBrowser(systemDesign, fieldGeometry);
}

/**
 * Generate layout using Electron (private native layout via napi-rs)
 */
async function generateLayoutElectron(systemDesign: any, fieldGeometry: any): Promise<any> {
  const geometryString =
    typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);

  const electronAPI = (
    window as unknown as { electronAPI: { invoke: (c: string, a: unknown) => Promise<string> } }
  ).electronAPI;

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
 * Generate layout using Browser
 */
async function generateLayoutBrowser(systemDesign: any, fieldGeometry: any): Promise<any> {
  const startTime = performance.now();

  if (browserLayoutBackend === "geos-wasm-geo") {
    try {
      return await generateLayoutBrowserGeosWasmGeo(systemDesign, fieldGeometry);
    } catch (error) {
      if (!browserLayoutFallbackEnabled) {
        throw error;
      }
      console.warn("[geos-wasm-geo] Failed, falling back to turf-js:", error);
    }
  } else if (browserLayoutBackend === "geometry-kernel") {
    try {
      return await generateLayoutBrowserGeometryKernel(systemDesign, fieldGeometry);
    } catch (error) {
      if (!browserLayoutFallbackEnabled) {
        throw error;
      }
      console.warn("[geometry-kernel] Failed, falling back to turf-js:", error);
    }
  }

  const geometryObj = typeof fieldGeometry === "string" ? JSON.parse(fieldGeometry) : fieldGeometry;

  const { systemBasedLayoutAsync } = await getTurfLayoutModule();
  const layout = await systemBasedLayoutAsync(systemDesign, geometryObj);

  console.log(`[turf-js] Layout generated in ${(performance.now() - startTime).toFixed(1)}ms`);
  return layout;
}

async function generateLayoutBrowserGeosWasmGeo(
  systemDesign: any,
  fieldGeometry: any,
): Promise<any> {
  if (typeof WebAssembly === "undefined") {
    throw new Error("WebAssembly is not available in this browser");
  }

  const startTime = performance.now();
  const geometryString =
    typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);
  const wasm = await getGeosWasmGeoModule();
  const resultJson = wasm.process_layout(
    JSON.stringify({
      systemdesign: systemDesign,
      fieldGeometry: geometryString,
    }),
  );
  const response: LayoutResponse = JSON.parse(resultJson);

  if (!response.success || !response.data) {
    throw new Error(response.error || "geos-wasm-geo layout generation failed");
  }

  const elapsed = performance.now() - startTime;
  const modelTime = response.timingMs?.toFixed(1) ?? "?";
  console.log(`[geos-wasm-geo] Layout generated in ${elapsed.toFixed(1)}ms (model ${modelTime}ms)`);

  return response.data;
}

async function generateLayoutBrowserGeometryKernel(
  systemDesign: any,
  fieldGeometry: any,
): Promise<any> {
  if (typeof WebAssembly === "undefined") {
    throw new Error("WebAssembly is not available in this browser");
  }

  const startTime = performance.now();
  const geometryString =
    typeof fieldGeometry === "string" ? fieldGeometry : JSON.stringify(fieldGeometry);
  const wasm = await getGeometryKernelWasmModule();
  const resultJson = wasm.process_layout(
    JSON.stringify({
      systemdesign: systemDesign,
      fieldGeometry: geometryString,
    }),
  );
  const response: LayoutResponse = JSON.parse(resultJson);

  if (!response.success || !response.data) {
    throw new Error(response.error || "geometry-kernel layout generation failed");
  }

  const elapsed = performance.now() - startTime;
  const modelTime = response.timingMs?.toFixed(1) ?? "?";
  console.log(
    `[geometry-kernel] Layout generated in ${elapsed.toFixed(1)}ms (model ${modelTime}ms)`,
  );

  return response.data;
}

/**
 * Check if fast native layout is available
 */
export function hasNativeLayout(): boolean {
  return isElectron();
}
