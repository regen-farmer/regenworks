import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import initGeometryKernel, {
  process_layout as processGeometryKernelLayout,
} from "../layout-geometry-kernel/pkg/geometry_kernel_layout.js";
import {
  layoutRequest,
  type LayoutBackendInput,
  type LayoutBackendRun,
  type LayoutResponse,
} from "./types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let geometryKernelInitPromise: Promise<void> | null = null;

async function ensureGeometryKernelInitialized(): Promise<void> {
  if (!geometryKernelInitPromise) {
    const wasmPath = path.join(
      __dirname,
      "../layout-geometry-kernel/pkg/geometry_kernel_layout_bg.wasm",
    );
    geometryKernelInitPromise = initGeometryKernel({
      module_or_path: fs.readFileSync(wasmPath),
    }).then(() => undefined);
  }

  return geometryKernelInitPromise;
}

export async function runGeometryKernelLayout(input: LayoutBackendInput): Promise<LayoutBackendRun> {
  await ensureGeometryKernelInitialized();

  const started = Date.now();
  const response = JSON.parse(
    processGeometryKernelLayout(JSON.stringify(layoutRequest(input))),
  ) as LayoutResponse;

  if (!response.success || !response.data) {
    throw new Error(response.error || "geometry-kernel layout failed");
  }

  return {
    implementation: "geometry-kernel",
    layout: response.data,
    timingMs: Date.now() - started,
    engineTimingMs: response.timingMs,
  };
}
