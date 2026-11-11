// Stake-out export: names, rows, grid coordinates and file formats.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTurfJsLayout } from "../layout-backends/turf-js.ts";
import { cleanPrefix, stakeoutFiles, stakeoutTrees } from "../planting/stakeout.ts";
import { dktmZoneFor, fromGrid, fromUtm32, toGrid, toUtm32, type GridId } from "../planting/utm.ts";
import { zipTextFiles } from "../planting/zip.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "apple-trees", "input.json"), "utf8"));
const labelOf = (t: any) => {
  const species = t.species?.nameCommon ?? String(t.species?._id ?? t.species);
  return { species, label: t.variety ? `${species} ${t.variety}` : species };
};

// Reference values from pyproj 3.8 (EPSG:4258 -> EPSG:25832).
const REFS: [number, number, number, number][] = [
  [9.0, 56.0, 500000.0, 6206079.5871],
  [9.6321234567, 56.1567890123, 539264.0997, 6223709.9004],
  [8.1, 54.8, 442143.1032, 6072907.3183],
  [12.6, 55.7, 726205.9457, 6178565.0293],
  [15.1, 55.1, 888982.3411, 6122928.564],
  [10.4, 57.6, 583670.1072, 6385041.492],
];

test("UTM 32N matches pyproj to 0.1 mm across Denmark, and round-trips", () => {
  for (const [lon, lat, e, n] of REFS) {
    const r = toUtm32(lon, lat);
    assert.ok(Math.abs(r.e - e) < 1e-4, `easting ${lon},${lat}: ${r.e} vs ${e}`);
    assert.ok(Math.abs(r.n - n) < 1e-4, `northing ${lon},${lat}: ${r.n} vs ${n}`);
    const back = fromUtm32(r.e, r.n);
    assert.ok(Math.abs(back.lon - lon) < 1e-10 && Math.abs(back.lat - lat) < 1e-10);
  }
});

test("trees are named <prefix>R<row>T<tree>, unique, numbered along each row", async () => {
  const { layout } = await runTurfJsLayout({ systemDesign: input.systemDesign, fieldGeometry: input.fieldGeometry });
  const rows = stakeoutTrees(layout, { prefix: "B", labelOf });
  const all = rows.flatMap((r) => r.trees);
  assert.equal(all.length, layout.treeMarkerArray.filter((t: any) => t.species).length);
  assert.equal(new Set(all.map((t) => t.name)).size, all.length);
  assert.equal(all[0].name, "BR01T001");
  for (const r of rows) {
    r.trees.forEach((t, i) => assert.equal(t.tree, i + 1));
    // trees within a row are evenly spaced along it, so consecutive steps are similar
    for (let i = 2; i < r.trees.length; i++) {
      const a = Math.hypot(r.trees[i].e - r.trees[i - 1].e, r.trees[i].n - r.trees[i - 1].n);
      assert.ok(a > 0.5 && a < 50, `R${r.row} step ${a}`);
    }
  }
  assert.deepEqual(rows.map((r) => r.row), rows.map((_, i) => i + 1));
});

test("files: Trimble CSV grid points E-N, row lines, KML, DXF, summary", async () => {
  const { layout } = await runTurfJsLayout({ systemDesign: input.systemDesign, fieldGeometry: input.fieldGeometry });
  const out = stakeoutFiles(layout, "Brian Mark 1 - Hassel", { prefix: "B", labelOf });
  const names = Object.keys(out.files);
  assert.deepEqual(names, [
    "Brian_Mark_1_-_Hassel_trees_NENZ.csv",
    "Brian_Mark_1_-_Hassel_rows_NENZ.csv",
    "Brian_Mark_1_-_Hassel.dxf",
    "Brian_Mark_1_-_Hassel_check.kml",
    "Brian_Mark_1_-_Hassel_summary.txt",
  ]);
  const lines = out.files[names[0]].trim().split("\n");
  assert.equal(lines.length, out.trees);
  for (const line of lines) {
    const cols = line.split(",");
    assert.equal(cols.length, 5, line);
    assert.match(cols[1], /^\d{6}\.\d{3}$/);
    assert.match(cols[2], /^\d{7}\.\d{3}$/);
  }
  assert.equal(out.files[names[1]].trim().split("\n").length, out.rows * 2);
  assert.ok(out.roundTripMm < 1, `round trip ${out.roundTripMm} mm`);
  assert.match(out.files[names[4]], /Trees: \d+ {3}Rows: \d+/);
});

test("labels can't break the CSV; prefix is sanitised", () => {
  const layout = {
    treeMarkerArray: [
      { species: { nameCommon: "Hazel" }, variety: 'Corabel, "best"', treeRowIndex: 0, point: { geometry: { coordinates: [9.5, 56.1] } } },
      { species: { nameCommon: "Hazel" }, treeRowIndex: 0, point: { geometry: { coordinates: [9.5001, 56.1] } } },
    ],
  };
  const out = stakeoutFiles(layout, "x", { prefix: "B<1>,", labelOf });
  const first = out.files["x_trees_NENZ.csv"].split("\n")[0];
  assert.equal(first.split(",").length, 5);
  assert.ok(first.startsWith("B1R01T001,"));
  assert.equal(cleanPrefix("Ellinglund-Øst 2"), "Ellinglund-st2".slice(0, 8));
});

test("a layout without row numbers is refused rather than guessed", () => {
  assert.throws(() =>
    stakeoutTrees({ treeMarkerArray: [{ species: "s", point: { geometry: { coordinates: [9, 56] } } }] }, { labelOf }),
  );
});

test("zip contains the files", () => {
  const zip = zipTextFiles({ "a.txt": "hello", "æ.csv": "1,2" });
  assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
  const text = new TextDecoder().decode(zip);
  assert.ok(text.includes("hello") && text.includes("æ.csv"));
});

test("every row runs the same way and trees go monotonically along it, at any bearing", async () => {
  for (const bearing of [0, 45, 90, 180, 179.5, -179.5, 270]) {
    const design = { ...structuredClone(input.systemDesign), bearing };
    const { layout } = await runTurfJsLayout({ systemDesign: design, fieldGeometry: input.fieldGeometry });
    const rows = stakeoutTrees(layout, { prefix: "B", labelOf });
    const dirOf = (r: (typeof rows)[number]) => {
      const a = r.trees[0];
      const b = r.trees[r.trees.length - 1];
      return [b.e - a.e, b.n - a.n];
    };
    const ref = dirOf(rows.find((r) => r.trees.length > 1)!);
    for (const r of rows.filter((r) => r.trees.length > 1)) {
      const d = dirOf(r);
      assert.ok(d[0] * ref[0] + d[1] * ref[1] > 0, `bearing ${bearing}: R${r.row} runs the other way`);
      for (let i = 1; i < r.trees.length; i++) {
        const step = [r.trees[i].e - r.trees[i - 1].e, r.trees[i].n - r.trees[i - 1].n];
        assert.ok(step[0] * d[0] + step[1] * d[1] > 0, `bearing ${bearing}: R${r.row} T${i + 1} goes backwards`);
      }
    }
  }
});

test("shuffled trees within a row are put back in order", () => {
  const pt = (lon: number) => ({
    species: { nameCommon: "Hazel" },
    treeRowIndex: 0,
    point: { geometry: { coordinates: [lon, 56.1] } },
  });
  const rows = stakeoutTrees({ treeMarkerArray: [pt(9.5002), pt(9.5), pt(9.5003), pt(9.5001)] }, { labelOf });
  const lons = rows[0].trees.map((t) => t.lon);
  assert.deepEqual(lons, [...lons].sort((a, b) => a - b));
});

test("spreadsheet formulas in labels are neutralised; one-tree rows get no line", () => {
  const layout = {
    treeMarkerArray: [
      { species: { nameCommon: "=HYPERLINK(x)" }, treeRowIndex: 0, point: { geometry: { coordinates: [9.5, 56.1] } } },
      { species: { nameCommon: "Hazel" }, treeRowIndex: 1, point: { geometry: { coordinates: [9.5, 56.2] } } },
      { species: { nameCommon: "Hazel" }, treeRowIndex: 1, point: { geometry: { coordinates: [9.5001, 56.2] } } },
    ],
  };
  const out = stakeoutFiles(layout, "x", { prefix: "B", labelOf });
  assert.ok(!out.files["x_trees_NENZ.csv"].split("\n")[0].split(",")[4].startsWith("="));
  assert.equal(out.files["x_rows_NENZ.csv"].trim().split("\n").length, 2);
});

// Reference values from pyproj 3.8 (EPSG:4258 -> EPSG:4093-4096); the first point is the first tree of SITECH's
// working example file (Test_field_trees_DKTM2_NE.csv: TFR01T001;1137149,669;421031,508;0,000;Apple).
const DKTM_REFS: [GridId, number, number, number, number][] = [
  ["dktm2", 10.331624093531738, 55.35923077975464, 421031.508, 1137149.669],
  ["dktm1", 9.2, 56.4, 212349.1067, 1252994.0853],
  ["dktm2", 8.3, 55.5, 292574.7851, 1154084.8738],
  ["dktm3", 12.3, 55.6, 634668.7216, 1164041.7561],
  ["dktm4", 14.9, 55.1, 793616.5138, 1108367.3268],
];

test("DKTM zones match pyproj to 1 mm (the example file has 3 decimals), and round-trip", () => {
  for (const [g, lon, lat, e, n] of DKTM_REFS) {
    const r = toGrid(lon, lat, g);
    assert.ok(Math.abs(r.e - e) < 1e-3, `${g} easting ${r.e} vs ${e}`);
    assert.ok(Math.abs(r.n - n) < 1e-3, `${g} northing ${r.n} vs ${n}`);
    const back = fromGrid(r.e, r.n, g);
    assert.ok(Math.abs(back.lon - lon) < 1e-10 && Math.abs(back.lat - lat) < 1e-10);
  }
  assert.equal(dktmZoneFor(10.33), "dktm2");
  assert.equal(dktmZoneFor(12.3), "dktm3");
});

test("SITECH format: Name;N;E;0,000;Code with decimal commas and CRLF, as the working example", async () => {
  const { layout } = await runTurfJsLayout({ systemDesign: input.systemDesign, fieldGeometry: input.fieldGeometry });
  const out = stakeoutFiles(layout, "Test field", { prefix: "TF", labelOf, format: "trimble-dktm-ne", dktm: "dktm2" });
  assert.equal(out.grid, "dktm2");
  const trees = out.files["Test_field_trees_DKTM2_NE.csv"];
  assert.ok(trees, Object.keys(out.files).join(" "));
  const lines = trees.split("\r\n").filter(Boolean);
  assert.equal(lines.length, out.trees);
  assert.ok(!trees.replace(/\r\n/g, "").includes("\n"), "Windows line ends only");
  const all = stakeoutTrees(layout, { prefix: "TF", labelOf }).flatMap((r) => r.trees);
  for (const [i, l] of lines.entries()) {
    const f = l.split(";");
    assert.equal(f.length, 5);
    assert.match(f[1], /^\d+,\d{3}$/);
    assert.match(f[2], /^\d+,\d{3}$/);
    assert.equal(f[3], "0,000");
    const p = toGrid(all[i].lon, all[i].lat, "dktm2");
    assert.equal(f[0], all[i].name);
    assert.equal(f[1], p.n.toFixed(3).replace(".", ","), "northing first");
    assert.equal(f[2], p.e.toFixed(3).replace(".", ","));
  }
  assert.ok(out.files["Test_field_summary.txt"].includes("DKTM2 (EPSG:4094)"));
  assert.ok(out.files["Test_field_DKTM2.dxf"], "the DXF is named by its grid");
});

test("row ends can sit beyond the first and last tree, on the row line", async () => {
  const { layout } = await runTurfJsLayout({ systemDesign: input.systemDesign, fieldGeometry: input.fieldGeometry });
  const rows = stakeoutTrees(layout, { prefix: "B", labelOf });
  const r = rows.find((x) => x.trees.length >= 2)!;
  const a = r.trees[0];
  const b = r.trees[r.trees.length - 1];
  const out = stakeoutFiles(layout, "x", { prefix: "B", labelOf, rowEndOffsetM: 1 });
  const first = out.files["x_rows_NENZ.csv"].split("\n")[0].split(",");
  const s = { e: Number(first[1]), n: Number(first[2]) };
  const fromA = Math.hypot(s.e - a.e, s.n - a.n);
  const fromB = Math.hypot(s.e - b.e, s.n - b.n);
  assert.ok(Math.abs(fromA - 1) < 0.002, `1 m from the first tree: ${fromA}`);
  assert.ok(Math.abs(fromB - (Math.hypot(a.e - b.e, a.n - b.n) + 1)) < 0.002, "beyond it, on the line");
  assert.ok(first[4].includes("1 m before"));
});

test("lat/long format: header, degrees to 9 decimals", async () => {
  const { layout } = await runTurfJsLayout({ systemDesign: input.systemDesign, fieldGeometry: input.fieldGeometry });
  const out = stakeoutFiles(layout, "x", { prefix: "B", labelOf, format: "latlon" });
  const lines = out.files["x_trees_latlon.csv"].trim().split("\n");
  assert.equal(lines[0], "Name,Latitude,Longitude,Height,Code");
  assert.match(lines[1], /^BR\d+T\d+,5\d\.\d{9},\d+\.\d{9},,/);
});
