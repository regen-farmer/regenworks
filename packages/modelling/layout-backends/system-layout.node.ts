import { runTurfJsLayout } from "./turf-js.ts";
import type {
  LayoutBackendName,
  LayoutBackendRun,
  LayoutBackendRunner,
} from "./types.ts";

const LAYOUT_BACKEND_ALIASES: Record<string, LayoutBackendName> = {
  turf: "turf-js",
  "turf-js": "turf-js",
  ts: "turf-js",
  "geos-wasm": "geos-wasm-geo",
  "geos-wasm-geo": "geos-wasm-geo",
  wasm: "geos-wasm-geo",
  geos: "native-geos",
  native: "native-geos",
  "native-geos": "native-geos",
  "geometry-kernel": "geometry-kernel",
  geometry: "geometry-kernel",
  kernel: "geometry-kernel",
};

function configuredLayoutBackendName(): LayoutBackendName {
  const requested =
    process.env.LAYOUT_BACKEND ||
    process.env.SYSTEM_LAYOUT_BACKEND ||
    process.env.MODELLING_LAYOUT_BACKEND ||
    "turf-js";
  const backend = LAYOUT_BACKEND_ALIASES[requested.toLowerCase()];

  if (!backend) {
    const validNames = Object.keys(LAYOUT_BACKEND_ALIASES).sort().join(", ");
    throw new Error(`Unknown layout backend "${requested}". Expected one of: ${validNames}`);
  }

  return backend;
}

async function layoutBackendRunner(name: LayoutBackendName): Promise<LayoutBackendRunner> {
  switch (name) {
    case "turf-js":
      return runTurfJsLayout;
    case "native-geos":
      return (await import("./native-geos.node.ts")).runNativeGeosLayout;
    case "geometry-kernel":
    case "geos-wasm-geo":
      throw new Error(`${name} is only available in the browser and comparison tooling`);
  }
}

function shouldFallBackToTurf(): boolean {
  return process.env.LAYOUT_BACKEND_FALLBACK !== "false";
}

function shouldLogLayoutBackend(): boolean {
  return process.env.LOG_LAYOUT_BACKEND === "1" || process.env.LOG_LAYOUT_BACKEND === "true";
}

async function runSelectedLayoutBackend(
  backendName: LayoutBackendName,
  systemDesign: any,
  fieldGeometry: any,
): Promise<LayoutBackendRun> {
  const runner = await layoutBackendRunner(backendName);
  return runner({ systemDesign, fieldGeometry });
}

export function getSystemLayoutBackendName(): LayoutBackendName {
  return configuredLayoutBackendName();
}

export async function runSystemBasedLayoutWithMetrics(
  systemDesign: any,
  fieldGeometry: any,
): Promise<LayoutBackendRun> {
  const backendName = configuredLayoutBackendName();

  try {
    const run = await runSelectedLayoutBackend(backendName, systemDesign, fieldGeometry);
    if (shouldLogLayoutBackend()) {
      const engineTime =
        run.engineTimingMs === undefined ? "" : ` (engine ${run.engineTimingMs.toFixed(1)}ms)`;
      console.log(`[${run.implementation}] Layout generated in ${run.timingMs.toFixed(1)}ms${engineTime}`);
    }
    return run;
  } catch (error) {
    if (backendName === "turf-js" || !shouldFallBackToTurf()) {
      throw error;
    }

    console.warn(`[${backendName}] Failed, falling back to turf-js:`, error);
    return runSelectedLayoutBackend("turf-js", systemDesign, fieldGeometry);
  }
}

export async function runSystemBasedLayout(systemDesign: any, fieldGeometry: any): Promise<any> {
  const run = await runSystemBasedLayoutWithMetrics(systemDesign, fieldGeometry);
  return run.layout;
}
