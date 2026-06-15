import { runGeosWasmGeoLayout } from "./geos-wasm-geo.node.ts";
import { runGeometryKernelLayout } from "./geometry-kernel.node.ts";
import { runNativeGeosLayout } from "./native-geos.node.ts";
import { runTurfJsLayout } from "./turf-js.ts";
import type { LayoutBackendName, LayoutBackendRunner } from "./types.ts";

export * from "./types.ts";
export { runGeosWasmGeoLayout } from "./geos-wasm-geo.node.ts";
export { runGeometryKernelLayout } from "./geometry-kernel.node.ts";
export { runNativeGeosLayout } from "./native-geos.node.ts";
export { runTurfJsLayout } from "./turf-js.ts";

export const layoutBackends: Record<LayoutBackendName, LayoutBackendRunner> = {
  "turf-js": runTurfJsLayout,
  "geos-wasm-geo": runGeosWasmGeoLayout,
  "native-geos": runNativeGeosLayout,
  "geometry-kernel": runGeometryKernelLayout,
};

export function getLayoutBackend(name: LayoutBackendName): LayoutBackendRunner {
  return layoutBackends[name];
}

