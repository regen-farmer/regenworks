import maplibregl from "maplibre-gl";
// Vite mangles maplibre's auto-bundled Blob worker, so GeoJSON sources fail in
// the worker with "<minified> is not defined" (via _dispatchWorkerUpdate) and
// overlay layers never render. Point maplibre at the standalone worker file,
// which Vite emits as a real asset via `?url`. (Same mechanism v6 makes
// mandatory via setWorkerUrl.)
// @ts-expect-error - Vite `?url` asset import
import workerUrl from "maplibre-gl/dist/maplibre-gl-csp-worker.js?url";

maplibregl.setWorkerUrl(workerUrl);
