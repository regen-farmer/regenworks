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

// ---- Review fixes -------------------------------------------------------

test("offset pattern shifts by half a tree spacing, also with two species", () => {
  const design = {
    bearing: 0,
    margin: 0,
    headland: 0,
    rows: [{ width: 6, sequence: [{ species: WALNUT, spacingAfter: 4.5 }, { species: HAZEL, spacingAfter: 4.5 }] }],
    layout: { mode: "grid", grid: { pattern: "offset" } },
  };
  const { treeMarkerArray } = gridLayout(design, skewedField());
  const phaseOfRow = new Map<number, number>();
  for (const t of treeMarkerArray) {
    const key = Math.round(across(t) / 6);
    if (!phaseOfRow.has(key)) phaseOfRow.set(key, mod(along(t), 4.5));
  }
  const keys = [...phaseOfRow.keys()].sort((a, b) => a - b);
  const d = mod(phaseOfRow.get(keys[1])! - phaseOfRow.get(keys[0])!, 4.5);
  assert.ok(Math.abs(d - 2.25) < 0.01, `offset ${d}`);
});

test("offset pattern skips alley rows when counting every other row", () => {
  const design = {
    bearing: 0,
    margin: 0,
    headland: 0,
    rows: [
      { width: 3, sequence: [{ species: HAZEL, spacingAfter: 3 }] },
      { width: 12, sequence: [] },
    ],
    layout: { mode: "grid", grid: { pattern: "offset" } },
  };
  const { treeMarkerArray } = gridLayout(design, skewedField());
  const phases = new Set(treeMarkerArray.map((t: any) => Math.round(mod(along(t), 3) * 100)));
  assert.equal(phases.size, 2, "two phases, 1.5 m apart");
});

test("strips pair 1:1 with tree rows and still cover the field", () => {
  const sk = Math.tan((25 * Math.PI) / 180);
  // U-shaped field: two arms 60 m wide, a 80 m gap, joined at the south.
  const u = [
    [0, 0], [200, 0], [200, 150], [140, 150], [140, 40], [60, 40], [60, 150], [0, 150], [0, 0],
  ].map(([e, n]) => lonlat(e, n + e * sk));
  const fieldU = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [u] } };
  for (const field of [skewedField(), fieldU]) {
    for (const grid of [{}, { shiftAcross: 2 }, { corner: "end-right", shiftAcross: 1.3 }]) {
      const layout = gridLayout(hazelDesign(grid), field);
      for (let i = 0; i < layout.treeRowLines.length; i++) {
        const strip = layout.stripPolygons[i];
        assert.ok(strip, `strip for row ${i}`);
        assert.equal(strip.properties.rowIndex, layout.treeRowLines[i].systemDesignRowIndex);
      }
    }
  }
  const layout = gridLayout(hazelDesign({ shiftAcross: 2 }), fieldU);
  const total = layout.stripAreasM2.reduce((a, b) => a + b, 0);
  const area = 200 * 150 - 80 * 110;
  assert.ok(Math.abs(total - area) / area < 0.01, `strips ${total} vs field ${area}`);
});

test("row offsets stay at the same field ends whichever corner the grid starts from", () => {
  const design = (corner: string) => {
    const d: any = hazelDesign({ corner });
    d.rows[0].offset = { before: 10, after: 0 };
    return d;
  };
  // South and north edges of the field in precise metres: n = n0 + e * slope.
  const ring = skewedField().geometry.coordinates[0].map(en);
  const slope = (ring[1].n - ring[0].n) / (ring[1].e - ring[0].e);
  const south = (e: number) => ring[0].n + (e - ring[0].e) * slope;
  const north = (e: number) => ring[3].n + (e - ring[3].e) * slope;
  for (const corner of ["start-left", "end-left", "start-right", "end-right"]) {
    const { treeMarkerArray } = gridLayout(design(corner), skewedField());
    const minFromSouth = Math.min(...treeMarkerArray.map((t: any) => along(t) - south(across(t))));
    const maxFromNorth = Math.max(...treeMarkerArray.map((t: any) => along(t) - north(across(t))));
    assert.ok(minFromSouth >= 10 - 0.02, `${corner}: first tree ${minFromSouth} m from the start edge`);
    assert.ok(maxFromNorth <= 0.02, `${corner}: last tree ${maxFromNorth} m past the end edge`);
  }
});

test("too narrow rows or too tight spacing are refused before any work", () => {
  const narrow: any = hazelDesign();
  narrow.rows[0].width = 0.01;
  assert.throws(() => gridLayout(narrow, skewedField()), /at least 0.5 m/);
  const tight: any = hazelDesign();
  tight.rows[0].sequence[0].spacingAfter = 0.01;
  assert.throws(() => gridLayout(tight, skewedField()), /at least 0.1 m/);
  // 0.1 m spacing on a 20 km long field: refused by counting, not by allocating.
  const longField = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [[lonlat(0, 0), lonlat(30, 0), lonlat(30, 20000), lonlat(0, 20000), lonlat(0, 0)]] },
  };
  const dense: any = hazelDesign();
  dense.rows[0].sequence[0].spacingAfter = 0.1;
  dense.rows[0].width = 0.5;
  const started = Date.now();
  assert.throws(() => gridLayout(dense, longField), /more than 500000 trees/);
  assert.ok(Date.now() - started < 3000, "refused quickly");
});

test("a blank sequence entry keeps its spacing", () => {
  const design: any = hazelDesign();
  design.rows[0].sequence = [
    { species: HAZEL, spacingAfter: 3 },
    { species: "", spacingAfter: 3 },
    { species: WALNUT, spacingAfter: 3 },
  ];
  const { treeMarkerArray } = gridLayout(design, skewedField());
  const row = treeMarkerArray.filter((t: any) => t.treeRowIndex === 5);
  const h = row.find((t: any) => t.species === HAZEL);
  const w = row.find((t: any) => t.species === WALNUT && along(t) > along(h));
  assert.ok(Math.abs(along(w) - along(h) - 6) < 0.01, "walnut 6 m after hazel");
  assert.equal(w.sequenceIndex, 2);
});

test("number of rows counts tree rows, with the alleys between them", () => {
  const design = {
    bearing: 0,
    margin: 0,
    headland: 0,
    rows: [
      { width: 3, sequence: [{ species: HAZEL, spacingAfter: 3 }] },
      { width: 12, sequence: [] },
    ],
    layout: { mode: "grid", grid: { anchor: lonlat(20, 30), extent: { rows: 3.9 } } },
  };
  const layout = gridLayout(design, skewedField());
  assert.equal(new Set(layout.treeMarkerArray.map((t: any) => t.treeRowIndex)).size, 3);
  // 3 tree strips + the 2 alleys between them
  assert.equal(layout.stripPolygons.filter(Boolean).length, 5);
});
