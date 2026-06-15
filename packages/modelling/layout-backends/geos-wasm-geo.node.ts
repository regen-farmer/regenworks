import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import initGeosWasmGeo, {
  process_layout as processGeosWasmGeoLayout,
} from "../layout-geos-wasm-geo/pkg/gis_rs.js";
import {
  layoutRequest,
  type LayoutBackendInput,
  type LayoutBackendRun,
  type LayoutResponse,
} from "./types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let geosWasmGeoInitPromise: Promise<void> | null = null;

async function ensureGeosWasmGeoInitialized(): Promise<void> {
  if (!geosWasmGeoInitPromise) {
    const wasmPath = path.join(__dirname, "../layout-geos-wasm-geo/pkg/gis_rs_bg.wasm");
    geosWasmGeoInitPromise = initGeosWasmGeo({
      module_or_path: fs.readFileSync(wasmPath),
    }).then(() => undefined);
  }

  return geosWasmGeoInitPromise;
}

export async function runGeosWasmGeoLayout(input: LayoutBackendInput): Promise<LayoutBackendRun> {
  await ensureGeosWasmGeoInitialized();

  const started = Date.now();
  const response = JSON.parse(
    processGeosWasmGeoLayout(JSON.stringify(layoutRequest(input))),
  ) as LayoutResponse;

  if (!response.success || !response.data) {
    throw new Error(response.error || "geos-wasm-geo layout failed");
  }

  return {
    implementation: "geos-wasm-geo",
    layout: response.data,
    timingMs: Date.now() - started,
    engineTimingMs: response.timingMs,
  };
}
