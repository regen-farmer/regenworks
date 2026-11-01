// Stake-out export: names, rows, grid coordinates and file formats.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTurfJsLayout } from "../layout-backends/turf-js.ts";
import { cleanPrefix, stakeoutFiles, stakeoutTrees } from "../planting/stakeout.ts";
import { fromUtm32, toUtm32 } from "../planting/utm.ts";
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
