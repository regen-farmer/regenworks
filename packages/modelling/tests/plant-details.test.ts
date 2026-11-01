// Cultivar, rootstock and organic follow each tree through the layout.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTurfJsLayout } from "../layout-backends/turf-js.ts";
import { attachPlantDetails, plantKeyString } from "../planting/plant_details.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(
  fs.readFileSync(path.join(here, "fixtures", "apple-trees", "input.json"), "utf8"),
);
const sid = (s: any) => String(s?._id ?? s);

test("each tree gets the plant of the sequence position it was placed from", async () => {
  const design = structuredClone(input.systemDesign);
  const [a, b] = design.rows[0].sequence;
  a.variety = "000000000000000000000a01";
  a.rootstock = "000000000000000000000b01";
  a.organic = true;
  b.variety = "000000000000000000000a02";
  b.ownRoots = true;

  const plain = await runTurfJsLayout({ systemDesign: input.systemDesign, fieldGeometry: input.fieldGeometry });
  const { layout } = await runTurfJsLayout({ systemDesign: design, fieldGeometry: input.fieldGeometry });

  // Plant details never move trees.
  assert.deepEqual(
    layout.treeMarkerArray.map((t: any) => t.point.geometry.coordinates),
    plain.layout.treeMarkerArray.map((t: any) => t.point.geometry.coordinates),
  );

  const trees = layout.treeMarkerArray.filter((t: any) => t.systemDesignRowIndex === 0);
  assert.ok(trees.length > 2);
  for (const t of trees) {
    const entry = design.rows[0].sequence[t.sequenceIndex];
    assert.equal(t.variety, entry.variety);
    assert.equal(t.rootstock, entry.rootstock);
    assert.equal(t.ownRoots, entry.ownRoots);
    assert.equal(t.organic, entry.organic);
  }
  // Alternating pattern within a physical row.
  const firstRow = trees.filter((t: any) => t.treeRowIndex === trees[0].treeRowIndex);
  assert.deepEqual(
    firstRow.slice(0, 4).map((t: any) => t.sequenceIndex),
    [0, 1, 0, 1],
  );

  const total = layout.plantCountArray!.reduce((n, p) => n + p.count, 0);
  assert.equal(total, layout.treeMarkerArray.filter((t: any) => t.species).length);
  const keys = layout.plantCountArray!.map(plantKeyString);
  assert.equal(new Set(keys).size, keys.length, "one count per distinct plant");
});

test("a tree whose species doesn't match its design entry gets no plant details", () => {
  const layout = {
    treeMarkerArray: [{ species: "s2", systemDesignRowIndex: 0, sequenceIndex: 0 }],
  };
  const out = attachPlantDetails(layout, {
    rows: [{ sequence: [{ species: "s1", variety: "v1", spacingAfter: 3 }] }],
  });
  assert.equal(out.treeMarkerArray[0].variety, undefined);
  assert.deepEqual(out.plantCountArray, [{ species: "s2", count: 1 }]);
});

test("old designs: species only, counts match species counts", async () => {
  const { layout } = await runTurfJsLayout({ systemDesign: input.systemDesign, fieldGeometry: input.fieldGeometry });
  const bySpecies = Object.fromEntries(
    (layout.speciesCountArray ?? []).map((s: any) => [sid(s.species), s.count]),
  );
  const byPlant = Object.fromEntries(layout.plantCountArray!.map((p) => [p.species, p.count]));
  assert.deepEqual(byPlant, bySpecies);
});
