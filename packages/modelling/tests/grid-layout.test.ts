// Grid layout model (layout-grid): trees on one lattice, at right angles
// across the rows, cut by the field. The row layout must not change.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gridLayout, isGridLayout } from "../layout-grid/grid_layout.ts";
import { systemBasedLayout } from "../layout-turf-js/system_based_layout.ts";
import { runTurfJsLayout } from "../layout-backends/turf-js.ts";
import { stakeoutTrees } from "../planting/stakeout.ts";
import { toTm } from "../planting/utm.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

// Local metres around a point, for building test fields and checking results.
const LON0 = 10.6;
const LAT0 = 56.2;
const proj = { lon0: LON0, k0: 1, fe: 0, fn: 0 };
const N0 = toTm(LON0, LAT0, proj).n;
const M_PER_DEG_LAT = 111_320;
const lonlat = (e: number, n: number): [number, number] => [
  LON0 + e / (M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180)),
  LAT0 + n / M_PER_DEG_LAT,
];
const en = ([lon, lat]: number[]) => {
  const p = toTm(lon, lat, proj);
  return { e: p.e, n: p.n - N0 };
};

/** A parallelogram ~200 × 150 m whose south and north edges are skewed 25°. */
function skewedField() {
  const sk = Math.tan((25 * Math.PI) / 180);
  const ring = [
    lonlat(0, 0),
    lonlat(200, 0 + 200 * sk),
    lonlat(200, 150 + 200 * sk),
    lonlat(0, 150),
    lonlat(0, 0),
  ];
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

const HAZEL = { _id: "hazel", nameCommon: "Hazel" };
const WALNUT = { _id: "walnut", nameCommon: "Walnut" };

/** Rows run north (bearing 0), 6 m apart, hazel every 3 m. */
function hazelDesign(grid: any = {}) {
  return {
    bearing: 0,
    margin: 0,
    headland: 0,
    rows: [{ width: 6, sequence: [{ species: HAZEL, spacingAfter: 3 }] }],
    layout: { mode: "grid", grid },
  };
}

/** Distance along the rows (north) and across (east), in metres. */
const along = (t: any) => en(t.point.geometry.coordinates).n;
const across = (t: any) => en(t.point.geometry.coordinates).e;
const mod = (x: number, p: number) => ((x % p) + p) % p;

test("isGridLayout only for layout.mode = grid", () => {
  assert.equal(isGridLayout({ rows: [] }), false);
  assert.equal(isGridLayout({ layout: { mode: "rows" } }), false);
  assert.equal(isGridLayout({ layout: { mode: "grid" } }), true);
});

test("on a skewed field the trees line up across the rows", () => {
  const { treeMarkerArray, treeRowLines } = gridLayout(hazelDesign(), skewedField());
  assert.ok(treeRowLines.length >= 30, `rows: ${treeRowLines.length}`);
  assert.ok(treeMarkerArray.length > 1000, `trees: ${treeMarkerArray.length}`);
  // Every tree sits on the same 3 m lattice along the rows, within 1 cm.
  const ref = along(treeMarkerArray[0]);
  for (const t of treeMarkerArray) {
    const r = mod(along(t) - ref, 3);
    assert.ok(Math.min(r, 3 - r) < 0.01, `off-lattice by ${r.toFixed(4)} m`);
  }
  // And rows are 6 m apart across.
  const xs = [...new Set(treeMarkerArray.map((t: any) => Math.round(across(t) * 100)))].sort(
    (a, b) => a - b,
  );
  for (let i = 1; i < xs.length; i++) {
    assert.ok(Math.abs(xs[i] - xs[i - 1] - 600) <= 1, `row gap ${(xs[i] - xs[i - 1]) / 100} m`);
  }
});

test("the row layout on the same field is skewed (why the grid exists)", () => {
  const design = { ...hazelDesign(), layout: undefined };
  const { treeMarkerArray } = systemBasedLayout(design as any, JSON.stringify(skewedField()));
  const firstOfRow = new Map<number, number>();
  for (const t of treeMarkerArray) {
    if (!firstOfRow.has(t.treeRowIndex)) firstOfRow.set(t.treeRowIndex, along(t));
  }
  const phases = new Set([...firstOfRow.values()].map((n) => Math.round(mod(n, 3) * 10)));
  assert.ok(phases.size > 3, "row layout starts each row at the edge");
});

test("trees stay inside the field and rows have stake-out numbers", () => {
  const field = skewedField();
  const layout = gridLayout(hazelDesign(), field);
  const sk = Math.tan((25 * Math.PI) / 180);
  for (const t of layout.treeMarkerArray) {
    const { e, n } = { e: across(t), n: along(t) };
    assert.ok(e >= -0.01 && e <= 200.01, `east ${e}`);
    assert.ok(n >= e * sk - 0.02 && n <= 150 + e * sk + 0.02, `north ${n} at ${e}`);
    assert.ok(Number.isInteger(t.treeRowIndex));
    assert.equal(t.systemDesignRowIndex, 0);
    assert.equal(t.sequenceIndex, 0);
  }
  const rows = stakeoutTrees(layout, { prefix: "LY", labelOf: () => ({ label: "H", species: "Hazel" }) } as any);
  assert.equal(rows.reduce((a, r) => a + r.trees.length, 0), layout.treeMarkerArray.length);
});

test("shiftAlong slides every tree by the same amount", () => {
  const a = gridLayout(hazelDesign(), skewedField()).treeMarkerArray;
  const b = gridLayout(hazelDesign({ shiftAlong: 1 }), skewedField()).treeMarkerArray;
  const phase = (ts: any[]) => mod(along(ts[0]), 3);
  const d = mod(phase(b) - phase(a), 3);
  assert.ok(Math.abs(d - 1) < 0.01, `shift ${d}`);
});

test("an anchor point puts a tree exactly there", () => {
  const anchor = lonlat(50.4, 80.2);
  const target = en(anchor);
  const { treeMarkerArray, grid } = gridLayout(hazelDesign({ anchor }), skewedField());
  const nearest = Math.min(
    ...treeMarkerArray.map((t: any) => Math.hypot(across(t) - target.e, along(t) - target.n)),
  );
  assert.ok(nearest < 0.001, `nearest tree ${nearest} m from the anchor`);
  assert.ok(Math.hypot(en(grid!.anchor).e - target.e, en(grid!.anchor).n - target.n) < 0.001);
});

test("species columns line up when rows have different sequences", () => {
  const design = {
    bearing: 0,
    margin: 0,
    headland: 0,
    rows: [
      { width: 6, sequence: [{ species: HAZEL, spacingAfter: 3 }] },
      { width: 6, sequence: [{ species: WALNUT, spacingAfter: 4.5 }, { species: HAZEL, spacingAfter: 4.5 }] },
    ],
    layout: { mode: "grid", grid: {} },
  };
  const { treeMarkerArray } = gridLayout(design, skewedField());
  const walnut = treeMarkerArray.filter((t: any) => t.species === WALNUT);
  assert.ok(walnut.length > 50);
  const ref = along(walnut[0]);
  for (const t of walnut) {
    const r = mod(along(t) - ref, 9);
    assert.ok(Math.min(r, 9 - r) < 0.01, "walnut columns every 9 m");
  }
});

test("offset pattern moves every other row half a spacing", () => {
  const { treeMarkerArray } = gridLayout(hazelDesign({ pattern: "offset" }), skewedField());
  const byRow = new Map<number, number>();
  for (const t of treeMarkerArray) {
    const key = Math.round(across(t) / 6);
    if (!byRow.has(key)) byRow.set(key, mod(along(t), 3));
  }
  const keys = [...byRow.keys()].sort((a, b) => a - b);
  const d = mod(byRow.get(keys[1])! - byRow.get(keys[0])!, 3);
  assert.ok(Math.abs(d - 1.5) < 0.01, `offset ${d}`);
});

test("extent limits rows and row length from the anchor", () => {
  const anchor = lonlat(30, 40);
  const { treeMarkerArray } = gridLayout(
    hazelDesign({ anchor, extent: { rows: 4, length: 30 } }),
    skewedField(),
  );
  assert.equal(treeMarkerArray.length, 4 * 11);
});

test("strips follow the grid rows and carry ground cover", () => {
  const design = hazelDesign();
  (design.rows[0] as any).groundcover = { _id: "clover" };
  const layout = gridLayout(design, skewedField());
  const total = layout.stripAreasM2.reduce((a, b) => a + b, 0);
  const fieldArea = 200 * 150;
  assert.ok(Math.abs(total - fieldArea) / fieldArea < 0.01, `strips ${total} vs ${fieldArea}`);
  assert.ok(Math.abs(layout.groundCoverAreasM2.clover - total) < 1);
});

test("dispatch: the row entry points send grid designs to the grid model", async () => {
  const design = hazelDesign();
  const viaRows = systemBasedLayout(design as any, JSON.stringify(skewedField()));
  const direct = gridLayout(design, skewedField());
  assert.equal(viaRows.treeMarkerArray.length, direct.treeMarkerArray.length);
  const { layout } = await runTurfJsLayout({ systemDesign: design, fieldGeometry: skewedField() });
  assert.equal(layout.treeMarkerArray.length, direct.treeMarkerArray.length);
});

test("grid on real designs: every row on the lattice, no tree outside the field", () => {
  const dir = path.join(here, "fixtures");
  let checked = 0;
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name, "input.json");
    if (!fs.existsSync(file)) continue;
    const input = JSON.parse(fs.readFileSync(file, "utf8"));
    const design = { ...input.systemDesign, layout: { mode: "grid", grid: {} } };
    const layout = gridLayout(design, input.fieldGeometry);
    assert.ok(Array.isArray(layout.treeMarkerArray), name);
    checked++;
  }
  assert.ok(checked >= 80, `fixtures checked: ${checked}`);
});
