/**
 * Visual comparison of turf-js, native-geos, geos-wasm-geo, and geometry-kernel layout implementations
 *
 * Generates SVG images for both implementations in each fixture folder.
 *
 * Run with: pnpm tsx packages/modelling/tests/visual-compare.ts [fixture-name]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  runGeosWasmGeoLayout,
  runGeometryKernelLayout,
  runNativeGeosLayout,
  runTurfJsLayout,
  type LayoutBackendRun,
  type LayoutResult,
} from "../layout-backends/index.node.ts";
import { Resvg } from "@resvg/resvg-js";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "fixtures");

const TURF_JS_OUTPUT = "output-turf-js.svg";
const GEOS_WASM_GEO_OUTPUT = "output-geos-wasm-geo.svg";
const GEOS_WASM_GEO_DIFF = "output-geos-wasm-geo-vs-turf-js-diff.png";
const NATIVE_GEOS_OUTPUT = "output-native-geos.svg";
const NATIVE_GEOS_DIFF = "output-native-geos-vs-turf-js-diff.png";
const GEOMETRY_KERNEL_OUTPUT = "output-geometry-kernel.svg";
const GEOMETRY_KERNEL_DIFF = "output-geometry-kernel-vs-turf-js-diff.png";
const SVG_WIDTH = 800;
const SVG_HEIGHT = 600;
const GEOS_WASM_GEO_DIFF_PIXEL_TOLERANCE = 100;
const GEOMETRY_KERNEL_DIFF_PIXEL_TOLERANCE = 100;
const GENERATED_OUTPUTS = [
  TURF_JS_OUTPUT,
  GEOS_WASM_GEO_OUTPUT,
  GEOS_WASM_GEO_DIFF,
  NATIVE_GEOS_OUTPUT,
  NATIVE_GEOS_DIFF,
  GEOMETRY_KERNEL_OUTPUT,
  GEOMETRY_KERNEL_DIFF,
];
const LEGACY_OUTPUTS = [
  "output-ts.svg",
  "output-rs.svg",
  "output-diff.png",
  "output-geos-wasm-geo-diff.png",
  "output-native-geos-diff.png",
  "output-geometry-kernel-diff.png",
];
const COMPARE_NATIVE_GEOS =
  process.env.COMPARE_NATIVE_GEOS === "1" || process.env.COMPARE_RUST === "1";
const COMPARE_GEOMETRY_KERNEL = process.env.COMPARE_GEOMETRY_KERNEL !== "0";

// Color palette for visualization
const COLORS = {
  field: "#e8f5e9",
  fieldStroke: "#2e7d32",
  margin: "#fff3e0",
  marginStroke: "#ef6c00",
  headland: "#e3f2fd",
  headlandStroke: "#1565c0",
  treeRow: "#4caf50",
  groundCover: "#81c784",
  tree: "#1b5e20",
  strip: ["#ffcdd2", "#f8bbd9", "#e1bee7", "#d1c4e9", "#c5cae9", "#bbdefb"],
};

/**
 * Convert GeoJSON coordinates to SVG path
 */
function coordsToPath(coords: number[][], transform: (p: number[]) => number[]): string {
  if (!coords || coords.length === 0) return "";
  const points = coords.map(transform);
  return `M ${points.map((p) => `${p[0]},${p[1]}`).join(" L ")} Z`;
}

function lineToPath(coords: number[][], transform: (p: number[]) => number[]): string {
  if (!coords || coords.length < 2) return "";
  const points = coords.map(transform);
  return `M ${points.map((p) => `${p[0]},${p[1]}`).join(" L ")}`;
}

function featureExteriorRings(feature: any): number[][][] {
  const geometry = feature?.geometry;
  if (!geometry?.coordinates) return [];

  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ? [geometry.coordinates[0]] : [];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon: number[][][]) => polygon[0])
      .filter((ring: number[][] | undefined): ring is number[][] => Boolean(ring));
  }

  return [];
}

/**
 * Create SVG from layout result
 */
function layoutToSvg(
  layout: LayoutResult,
  fieldGeometry: any,
  title: string,
  width = 800,
  height = 600,
): string {
  // Parse field geometry
  let fieldCoords: number[][];
  if (typeof fieldGeometry === "string") {
    const parsed = JSON.parse(fieldGeometry);
    fieldCoords = parsed.geometry?.coordinates?.[0] || parsed.coordinates?.[0];
  } else {
    fieldCoords = fieldGeometry.geometry?.coordinates?.[0] || fieldGeometry.coordinates?.[0];
  }

  if (!fieldCoords) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <text x="50%" y="50%" text-anchor="middle">Invalid geometry</text>
    </svg>`;
  }

  // Calculate bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const coord of fieldCoords) {
    minX = Math.min(minX, coord[0]);
    minY = Math.min(minY, coord[1]);
    maxX = Math.max(maxX, coord[0]);
    maxY = Math.max(maxY, coord[1]);
  }

  // Add padding
  const padding = 40;
  const geoWidth = maxX - minX;
  const geoHeight = maxY - minY;
  const scale = Math.min((width - 2 * padding) / geoWidth, (height - 2 * padding) / geoHeight);

  // Transform function: geo coords to SVG coords
  const transform = (p: number[]): number[] => [
    padding + (p[0] - minX) * scale,
    height - padding - (p[1] - minY) * scale, // Flip Y
  ];

  // Start SVG
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background: white;">
  <title>${title}</title>
  <style>
    .label { font-family: sans-serif; font-size: 12px; }
    .title { font-family: sans-serif; font-size: 16px; font-weight: bold; }
  </style>
  <text x="${width / 2}" y="20" class="title" text-anchor="middle">${title}</text>
`;

  // Draw field outline
  svg += `  <path d="${coordsToPath(fieldCoords, transform)}" fill="${COLORS.field}" stroke="${COLORS.fieldStroke}" stroke-width="2"/>\n`;

  // Draw margin polygon
  for (const marginCoords of featureExteriorRings(layout.marginPolygon)) {
    svg += `  <path d="${coordsToPath(marginCoords, transform)}" fill="none" stroke="${COLORS.marginStroke}" stroke-width="1.5"/>\n`;
  }

  // Draw headland polygon
  for (const headlandCoords of featureExteriorRings(layout.headlandPolygon)) {
    svg += `  <path d="${coordsToPath(headlandCoords, transform)}" fill="${COLORS.headland}" fill-opacity="0.3" stroke="${COLORS.headlandStroke}" stroke-width="1"/>\n`;
  }

  // Draw strip polygons
  if (layout.stripPolygons) {
    layout.stripPolygons.forEach((strip, i) => {
      const color = COLORS.strip[i % COLORS.strip.length];
      for (const coords of featureExteriorRings(strip)) {
        svg += `  <path d="${coordsToPath(coords, transform)}" fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="0.5"/>\n`;
      }
    });
  }

  // Draw ground cover areas
  if (layout.groundCoverAreas) {
    for (const area of layout.groundCoverAreas) {
      for (const coords of featureExteriorRings(area)) {
        svg += `  <path d="${coordsToPath(coords, transform)}" fill="${COLORS.groundCover}" fill-opacity="0.5" stroke="${COLORS.groundCover}" stroke-width="0.5"/>\n`;
      }
    }
  }

  // Draw tree row lines
  if (layout.treeRowLines) {
    for (const row of layout.treeRowLines) {
      const coords = row?.line?.geometry?.coordinates;
      if (coords) {
        svg += `  <path d="${lineToPath(coords, transform)}" fill="none" stroke="${COLORS.treeRow}" stroke-width="1.5"/>\n`;
      }
    }
  }

  // Draw tree markers (as small circles)
  if (layout.treeMarkerArray) {
    for (const marker of layout.treeMarkerArray) {
      const coords = marker?.point?.geometry?.coordinates;
      if (coords) {
        const [x, y] = transform(coords);
        svg += `  <circle cx="${x}" cy="${y}" r="2" fill="${COLORS.tree}"/>\n`;
      }
    }
  }

  // Add legend
  svg += `
  <g transform="translate(10, ${height - 100})">
    <rect x="0" y="0" width="150" height="90" fill="white" fill-opacity="0.9" stroke="#ccc"/>
    <text x="5" y="15" class="label">Legend:</text>
    <rect x="5" y="22" width="12" height="12" fill="${COLORS.headland}" stroke="${COLORS.headlandStroke}"/>
    <text x="22" y="32" class="label">Headland</text>
    <line x1="5" y1="45" x2="17" y2="45" stroke="${COLORS.treeRow}" stroke-width="2"/>
    <text x="22" y="48" class="label">Tree rows</text>
    <circle cx="11" cy="60" r="3" fill="${COLORS.tree}"/>
    <text x="22" y="64" class="label">Trees (${layout.treeMarkerArray?.length || 0})</text>
    <rect x="5" y="72" width="12" height="12" fill="${COLORS.groundCover}" fill-opacity="0.5"/>
    <text x="22" y="82" class="label">Ground cover</text>
  </g>
`;

  svg += "</svg>";
  return svg;
}

/**
 * Generate a PNG pixel diff from two SVGs
 */
function createPixelDiffPng(
  tsSvg: string,
  rsSvg: string,
  width: number,
  height: number,
): { buffer: Buffer; diffPixels: number } {
  // Rasterize TS SVG
  const tsResvg = new Resvg(tsSvg, { fitTo: { mode: "width", value: width } });
  const tsPngData = tsResvg.render();
  const tsImage = PNG.sync.read(tsPngData.asPng());

  // Rasterize RS SVG
  const rsResvg = new Resvg(rsSvg, { fitTo: { mode: "width", value: width } });
  const rsPngData = rsResvg.render();
  const rsImage = PNG.sync.read(rsPngData.asPng());

  // Create blank diff image
  const diffImage = new PNG({ width, height });

  // Use pixelmatch to find the difference between standard renders
  const diffPixels = pixelmatch(
    tsImage.data,
    rsImage.data,
    diffImage.data,
    width,
    height,
    { threshold: 0.1, diffColor: [255, 0, 0] }, // Red for mismatches
  );

  return {
    buffer: PNG.sync.write(diffImage),
    diffPixels,
  };
}

async function runImplementation(
  label: string,
  runner: (fixture: any) => Promise<LayoutBackendRun>,
  fixture: any,
): Promise<LayoutBackendRun | null> {
  console.log(`Running ${label} layout...`);
  try {
    const run = await runner(fixture);
    console.log(
      `  ${label}: ${run.timingMs}ms, ${run.layout.treeMarkerArray?.length || 0} trees`,
    );
    return run;
  } catch (err) {
    console.error(`${label} layout error:`, err);
    return null;
  }
}

function treeCount(run: LayoutBackendRun | null): number | null {
  return run ? run.layout.treeMarkerArray?.length || 0 : null;
}

function optionalValue(value: number | null, enabled: boolean): string | number {
  return enabled ? (value ?? "ERR") : "SKIP";
}

function optionalTime(value: number | null, enabled: boolean): string {
  if (!enabled) {
    return "SKIP";
  }

  return value === null ? "ERR" : `${value}ms`;
}

/**
 * Get all fixture directories
 */
function getFixtureDirs(): string[] {
  if (!fs.existsSync(FIXTURES_DIR)) {
    return [];
  }

  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((name) => {
      const dir = path.join(FIXTURES_DIR, name);
      return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "input.json"));
    })
    .map((name) => path.join(FIXTURES_DIR, name));
}

function removeGeneratedOutputs(fixtureDir: string): void {
  for (const filename of [...GENERATED_OUTPUTS, ...LEGACY_OUTPUTS]) {
    fs.rmSync(path.join(fixtureDir, filename), { force: true });
  }
}

async function main() {
  const filterName = process.argv[2];
  let fixtureDirs = getFixtureDirs();

  if (fixtureDirs.length === 0) {
    console.error("No fixtures found. Run export-fixtures.ts first.");
    process.exit(1);
  }

  // Filter if name provided
  if (filterName) {
    fixtureDirs = fixtureDirs.filter((dir) =>
      path.basename(dir).toLowerCase().includes(filterName.toLowerCase()),
    );
    if (fixtureDirs.length === 0) {
      console.error(`No fixtures matching "${filterName}"`);
      process.exit(1);
    }
  }

  console.log(`Processing ${fixtureDirs.length} fixture(s)...\n`);

  const results: {
    name: string;
    turfJsTrees: number | null;
    geosWasmGeoTrees: number | null;
    geometryKernelTrees: number | null;
    nativeGeosTrees: number | null;
    turfJsTime: number | null;
    geosWasmGeoTime: number | null;
    geometryKernelTime: number | null;
    nativeGeosTime: number | null;
    geosWasmGeoDiffPixels: number | null;
    geometryKernelDiffPixels: number | null;
    nativeGeosDiffPixels: number | null;
  }[] = [];

  for (const fixtureDir of fixtureDirs) {
    const fixtureName = path.basename(fixtureDir);
    console.log(`\n=== ${fixtureName} ===`);

    // Load fixture
    const inputPath = path.join(fixtureDir, "input.json");
    const fixture = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
    removeGeneratedOutputs(fixtureDir);

    const turfJsRun = await runImplementation("turf-js", runTurfJsLayout, fixture);
    const geosWasmGeoRun = await runImplementation("geos-wasm-geo", runGeosWasmGeoLayout, fixture);

    let nativeGeosRun: LayoutBackendRun | null = null;
    if (COMPARE_NATIVE_GEOS) {
      nativeGeosRun = await runImplementation("native-geos", runNativeGeosLayout, fixture);
    } else {
      console.log("Skipping native-geos layout (set COMPARE_NATIVE_GEOS=1 to include)");
    }

    let geometryKernelRun: LayoutBackendRun | null = null;
    if (COMPARE_GEOMETRY_KERNEL) {
      geometryKernelRun = await runImplementation("geometry-kernel", runGeometryKernelLayout, fixture);
    } else {
      console.log("Skipping geometry-kernel layout (COMPARE_GEOMETRY_KERNEL=0)");
    }

    let turfJsSvg = "";
    let geosWasmGeoSvg = "";
    let nativeGeosSvg = "";
    let geometryKernelSvg = "";

    if (turfJsRun) {
      turfJsSvg = layoutToSvg(turfJsRun.layout, fixture.fieldGeometry, fixture.name);
      const turfJsPath = path.join(fixtureDir, TURF_JS_OUTPUT);
      fs.writeFileSync(turfJsPath, turfJsSvg);
      console.log(`  Saved: ${turfJsPath}`);
    }

    if (geosWasmGeoRun) {
      geosWasmGeoSvg = layoutToSvg(geosWasmGeoRun.layout, fixture.fieldGeometry, fixture.name);
      const geosWasmGeoPath = path.join(fixtureDir, GEOS_WASM_GEO_OUTPUT);
      fs.writeFileSync(geosWasmGeoPath, geosWasmGeoSvg);
      console.log(`  Saved: ${geosWasmGeoPath}`);
    }

    if (nativeGeosRun) {
      nativeGeosSvg = layoutToSvg(nativeGeosRun.layout, fixture.fieldGeometry, fixture.name);
      const nativeGeosPath = path.join(fixtureDir, NATIVE_GEOS_OUTPUT);
      fs.writeFileSync(nativeGeosPath, nativeGeosSvg);
      console.log(`  Saved: ${nativeGeosPath}`);
    }

    if (geometryKernelRun) {
      geometryKernelSvg = layoutToSvg(geometryKernelRun.layout, fixture.fieldGeometry, fixture.name);
      const geometryKernelPath = path.join(fixtureDir, GEOMETRY_KERNEL_OUTPUT);
      fs.writeFileSync(geometryKernelPath, geometryKernelSvg);
      console.log(`  Saved: ${geometryKernelPath}`);
    }

    let geosWasmGeoDiffPixels: number | null = null;
    let geometryKernelDiffPixels: number | null = null;
    let nativeGeosDiffPixels: number | null = null;

    if (turfJsRun && geosWasmGeoRun) {
      const geosWasmGeoDiffPng = createPixelDiffPng(
        turfJsSvg,
        geosWasmGeoSvg,
        SVG_WIDTH,
        SVG_HEIGHT,
      );
      geosWasmGeoDiffPixels = geosWasmGeoDiffPng.diffPixels;
      const geosWasmGeoDiffPath = path.join(fixtureDir, GEOS_WASM_GEO_DIFF);
      fs.writeFileSync(geosWasmGeoDiffPath, geosWasmGeoDiffPng.buffer);
      console.log(`  Saved: ${geosWasmGeoDiffPath}`);
    }

    if (turfJsRun && geometryKernelRun) {
      const geometryKernelDiffPng = createPixelDiffPng(
        turfJsSvg,
        geometryKernelSvg,
        SVG_WIDTH,
        SVG_HEIGHT,
      );
      geometryKernelDiffPixels = geometryKernelDiffPng.diffPixels;
      const geometryKernelDiffPath = path.join(fixtureDir, GEOMETRY_KERNEL_DIFF);
      fs.writeFileSync(geometryKernelDiffPath, geometryKernelDiffPng.buffer);
      console.log(`  Saved: ${geometryKernelDiffPath}`);
    }

    if (turfJsRun && nativeGeosRun) {
      const nativeGeosDiffPng = createPixelDiffPng(
        turfJsSvg,
        nativeGeosSvg,
        SVG_WIDTH,
        SVG_HEIGHT,
      );
      nativeGeosDiffPixels = nativeGeosDiffPng.diffPixels;
      const nativeGeosDiffPath = path.join(fixtureDir, NATIVE_GEOS_DIFF);
      fs.writeFileSync(nativeGeosDiffPath, nativeGeosDiffPng.buffer);
      console.log(`  Saved: ${nativeGeosDiffPath}`);
    }

    const turfJsTrees = treeCount(turfJsRun);
    const geosWasmGeoTrees = treeCount(geosWasmGeoRun);
    const geometryKernelTrees = treeCount(geometryKernelRun);
    const nativeGeosTrees = treeCount(nativeGeosRun);

    results.push({
      name: fixtureName,
      turfJsTrees,
      geosWasmGeoTrees,
      geometryKernelTrees,
      nativeGeosTrees,
      turfJsTime: turfJsRun?.timingMs ?? null,
      geosWasmGeoTime: geosWasmGeoRun?.timingMs ?? null,
      geometryKernelTime: geometryKernelRun?.timingMs ?? null,
      nativeGeosTime: nativeGeosRun?.timingMs ?? null,
      geosWasmGeoDiffPixels,
      geometryKernelDiffPixels,
      nativeGeosDiffPixels,
    });

    console.log(`\n  Comparison:`);
    if (geosWasmGeoTrees !== null && turfJsTrees !== null) {
      console.log(
        `    geos-wasm-geo vs turf-js trees diff: ${Math.abs(geosWasmGeoTrees - turfJsTrees)}`,
      );
      console.log(`    geos-wasm-geo vs turf-js visual diff: ${geosWasmGeoDiffPixels} pixels`);
    }
    if (geometryKernelTrees !== null && turfJsTrees !== null) {
      console.log(
        `    geometry-kernel vs turf-js trees diff: ${Math.abs(geometryKernelTrees - turfJsTrees)}`,
      );
      console.log(`    geometry-kernel vs turf-js visual diff: ${geometryKernelDiffPixels} pixels`);
    }
    if (nativeGeosTrees !== null && turfJsTrees !== null) {
      console.log(
        `    native-geos vs turf-js trees diff: ${Math.abs(nativeGeosTrees - turfJsTrees)}`,
      );
      console.log(`    native-geos vs turf-js visual diff: ${nativeGeosDiffPixels} pixels`);
    }
  }

  console.log("\n\n=== SUMMARY ===");
  console.log(
    "Fixture                                          | turf-js Trees | geos-wasm-geo Trees | geometry-kernel Trees | native-geos Trees | geos-wasm Diff | geometry-kernel Diff | native-geos Diff | turf-js Time | geos-wasm-geo Time | geometry-kernel Time | native-geos Time",
  );
  console.log("-".repeat(231));
  for (const r of results) {
    const name = r.name.padEnd(48).substring(0, 48);
    const geosWasmGeoDiff =
      r.geosWasmGeoTrees === null || r.turfJsTrees === null || r.geosWasmGeoDiffPixels === null
        ? " !"
        : r.geosWasmGeoTrees === r.turfJsTrees &&
            r.geosWasmGeoDiffPixels <= GEOS_WASM_GEO_DIFF_PIXEL_TOLERANCE
          ? "  "
          : " *";
    const geometryKernelDiff =
      r.geometryKernelTrees === null ||
      r.turfJsTrees === null ||
      r.geometryKernelDiffPixels === null
        ? " !"
        : r.geometryKernelTrees === r.turfJsTrees &&
            r.geometryKernelDiffPixels <= GEOMETRY_KERNEL_DIFF_PIXEL_TOLERANCE
          ? "  "
          : " *";
    const nativeGeosDiff =
      !COMPARE_NATIVE_GEOS
        ? "  "
        : r.nativeGeosTrees === null || r.turfJsTrees === null || r.nativeGeosDiffPixels === null
        ? " !"
        : r.nativeGeosTrees === r.turfJsTrees
          ? "  "
          : " *";
    console.log(
      `${name} | ${String(r.turfJsTrees ?? "ERR").padStart(13)} | ${String(r.geosWasmGeoTrees ?? "ERR").padStart(19)}${geosWasmGeoDiff}| ${String(r.geometryKernelTrees ?? "ERR").padStart(22)}${geometryKernelDiff}| ${String(optionalValue(r.nativeGeosTrees, COMPARE_NATIVE_GEOS)).padStart(17)}${nativeGeosDiff}| ${String(r.geosWasmGeoDiffPixels ?? "ERR").padStart(14)} | ${String(r.geometryKernelDiffPixels ?? "ERR").padStart(20)} | ${String(optionalValue(r.nativeGeosDiffPixels, COMPARE_NATIVE_GEOS)).padStart(16)} | ${String(r.turfJsTime === null ? "ERR" : `${r.turfJsTime}ms`).padStart(12)} | ${String(r.geosWasmGeoTime === null ? "ERR" : `${r.geosWasmGeoTime}ms`).padStart(18)} | ${String(r.geometryKernelTime === null ? "ERR" : `${r.geometryKernelTime}ms`).padStart(20)} | ${optionalTime(r.nativeGeosTime, COMPARE_NATIVE_GEOS).padStart(16)}`,
    );
  }

  const geosWasmGeoPassed = results.filter(
    (r) =>
      r.geosWasmGeoTrees !== null &&
      r.geosWasmGeoDiffPixels !== null &&
      r.geosWasmGeoDiffPixels <= GEOS_WASM_GEO_DIFF_PIXEL_TOLERANCE &&
      r.turfJsTrees !== null &&
      r.geosWasmGeoTrees === r.turfJsTrees,
  ).length;
  const geosWasmGeoFailed = results.length - geosWasmGeoPassed;
  const geometryKernelExpected = COMPARE_GEOMETRY_KERNEL ? results.length : 0;
  const geometryKernelPassed = results.filter(
    (r) =>
      r.geometryKernelTrees !== null &&
      r.geometryKernelDiffPixels !== null &&
      r.geometryKernelDiffPixels <= GEOMETRY_KERNEL_DIFF_PIXEL_TOLERANCE &&
      r.turfJsTrees !== null &&
      r.geometryKernelTrees === r.turfJsTrees,
  ).length;
  const geometryKernelFailed = geometryKernelExpected - geometryKernelPassed;
  const geosWasmGeoDiffPixelValues = results
    .map((r) => r.geosWasmGeoDiffPixels)
    .filter((diffPixels): diffPixels is number => diffPixels !== null);
  const geometryKernelDiffPixelValues = results
    .map((r) => r.geometryKernelDiffPixels)
    .filter((diffPixels): diffPixels is number => diffPixels !== null);
  const maxGeosWasmGeoDiffPixels =
    geosWasmGeoDiffPixelValues.length > 0
      ? Math.max(...geosWasmGeoDiffPixelValues)
      : null;
  const maxGeometryKernelDiffPixels =
    geometryKernelDiffPixelValues.length > 0
      ? Math.max(...geometryKernelDiffPixelValues)
      : null;

  console.log("\n* = mismatch, ! = run failed or unavailable");
  console.log(
    `geos-wasm-geo vs turf-js: ${geosWasmGeoPassed}/${results.length} fixtures passed (<= ${GEOS_WASM_GEO_DIFF_PIXEL_TOLERANCE} diff pixels)`,
  );
  console.log(
    `Max geos-wasm-geo vs turf-js diff: ${maxGeosWasmGeoDiffPixels ?? "unavailable"} pixels`,
  );
  if (COMPARE_GEOMETRY_KERNEL) {
    console.log(
      `geometry-kernel vs turf-js: ${geometryKernelPassed}/${results.length} fixtures passed (<= ${GEOMETRY_KERNEL_DIFF_PIXEL_TOLERANCE} diff pixels)`,
    );
    console.log(
      `Max geometry-kernel vs turf-js diff: ${maxGeometryKernelDiffPixels ?? "unavailable"} pixels`,
    );
  }

  if (geosWasmGeoFailed > 0 || geometryKernelFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch(console.error);
