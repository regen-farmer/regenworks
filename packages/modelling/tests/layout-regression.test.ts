// Layout regression tests: tree positions must not change by accident.
//
// Every real design in tests/fixtures/*/input.json is laid out with the turf-js
// engine (what the backend uses for exports by default). The result is compared
// with a stored snapshot in tests/layout-snapshots/: number of trees, trees per
// species, number of rows, and a fingerprint of every tree position rounded to
// about 1 cm. A designed change to the layout maths updates the snapshots on
// purpose:
//
//   UPDATE_LAYOUT_SNAPSHOTS=1 pnpm --filter @rw/modelling test
//
// and the diff of the snapshot files shows which designs moved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTurfJsLayout } from "../layout-backends/turf-js.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures");
const SNAPSHOTS = path.join(here, "layout-snapshots");
const UPDATE = process.env.UPDATE_LAYOUT_SNAPSHOTS === "1";
const DECIMALS = 7; // 1e-7 degrees ≈ 1 cm

type Snapshot = {
  name: string;
  trees: number;
  rows: number;
  species: Record<string, number>;
  positionsSha256: string;
  firstTrees: [number, number][];
  lastTrees: [number, number][];
};

function speciesKey(species: any): string {
  if (!species) return "(none)";
  if (typeof species === "string") return species;
  return species.nameCommon ?? String(species._id ?? "(unknown)");
}

function round(n: number): number {
  return Number(n.toFixed(DECIMALS));
}

async function snapshotOf(name: string, input: any): Promise<Snapshot> {
  const { layout } = await runTurfJsLayout({
    systemDesign: input.systemDesign,
    fieldGeometry: input.fieldGeometry,
  });
  const trees = layout.treeMarkerArray ?? [];
  const coords: [number, number][] = trees.map((t: any) => {
    const [lng, lat] = t.point.geometry.coordinates;
    return [round(lng), round(lat)];
  });
  const species: Record<string, number> = {};
  for (const t of trees) species[speciesKey(t.species)] = (species[speciesKey(t.species)] ?? 0) + 1;
  return {
    name,
    trees: trees.length,
    rows: (layout.treeRowLines ?? []).length,
    species: Object.fromEntries(Object.entries(species).sort()),
    positionsSha256: createHash("sha256").update(JSON.stringify(coords)).digest("hex"),
    firstTrees: coords.slice(0, 3),
    lastTrees: coords.slice(-3),
  };
}

const fixtures = fs
  .readdirSync(FIXTURES)
  .filter((d) => fs.existsSync(path.join(FIXTURES, d, "input.json")))
  .sort();

if (UPDATE) fs.mkdirSync(SNAPSHOTS, { recursive: true });

for (const name of fixtures) {
  test(`layout unchanged: ${name}`, async () => {
    const input = JSON.parse(fs.readFileSync(path.join(FIXTURES, name, "input.json"), "utf8"));
    const actual = await snapshotOf(name, input);
    const file = path.join(SNAPSHOTS, `${name}.json`);

    if (UPDATE || !fs.existsSync(file)) {
      if (!UPDATE)
        assert.fail(`No snapshot for ${name}. Run with UPDATE_LAYOUT_SNAPSHOTS=1 to create it.`);
      fs.writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }

    const expected: Snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(actual.trees, expected.trees, `${name}: number of trees changed`);
    assert.deepEqual(actual.species, expected.species, `${name}: trees per species changed`);
    assert.equal(actual.rows, expected.rows, `${name}: number of rows changed`);
    assert.deepEqual(actual.firstTrees, expected.firstTrees, `${name}: first trees moved`);
    assert.deepEqual(actual.lastTrees, expected.lastTrees, `${name}: last trees moved`);
    assert.equal(
      actual.positionsSha256,
      expected.positionsSha256,
      `${name}: some tree positions moved`,
    );
  });
}
