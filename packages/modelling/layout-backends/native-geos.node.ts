import {
  layoutRequest,
  type LayoutBackendInput,
  type LayoutBackendRun,
  type LayoutResponse,
} from "./types.ts";

const DEFAULT_NATIVE_GEOS_URL = "http://localhost:3002";

export async function runNativeGeosLayout(input: LayoutBackendInput): Promise<LayoutBackendRun> {
  const serverUrl =
    process.env.NATIVE_GEOS_URL || process.env.RUST_MODEL_URL || DEFAULT_NATIVE_GEOS_URL;
  const started = Date.now();
  const response = await fetch(`${serverUrl}/layout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layoutRequest(input)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`native-geos HTTP ${response.status}: ${text.substring(0, 300)}`);
  }

  const result = (await response.json()) as LayoutResponse;
  if (!result.success || !result.data) {
    throw new Error(result.error || "native-geos layout failed");
  }

  return {
    implementation: "native-geos",
    layout: result.data,
    timingMs: Date.now() - started,
    engineTimingMs: result.timingMs,
  };
}

