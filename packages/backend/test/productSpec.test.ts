// One product definition (species, cultivar, rootstock, propagation, organic, form, years).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanYears, compareSpecs, defaultYears, formOf, missingFields, specKey, specLabel } from "@rw/db/productSpec.ts";

test("production years from nursery notation and price-list text", () => {
  assert.deepEqual(["1+1", "1/2", "1-1", "2/0", "1-0", "1", "2 ans", "1 an", "3 years", "2-jarig", "2j", "2-3", "x", "1+1+1", ""].map(cleanYears), [
    "1+1", "1+2", "1+1", "2", "1", "1", "2", "1", "3", "2", "2", undefined, undefined, undefined, undefined,
  ], "N+0 is N (so a supplier's 1-0 seedling matches Grove's 1); 2-3 is an age range, not a product");
  assert.equal(defaultYears("grafted"), "1+1");
  assert.equal(defaultYears("seedling"), "1");
  assert.equal(defaultYears("cutting"), undefined);
});

test("bare root or container from price-list text", () => {
  assert.deepEqual(["WG", "bare root", "racines nues", "o.B.", "Wurzelware", "C2", "C10L", "Airpot-C5L", "P9", "pot", "Topf", "kluit", "m.B.", "1.00-1.50 m", "C3 / WG", undefined].map((t) => formOf(t)), [
    "bare-root", "bare-root", "bare-root", "bare-root", "bare-root", "container", "container", "container", "container", "container", "container", "root-ball", "root-ball", undefined, undefined, undefined,
  ]);
});

test("same product only when every stated field agrees", () => {
  const a = { latin: "Corylus avellana", cultivar: "Corabel", rootstock: "Corylus colurna seedling", propagation: "grafted", organic: true, form: "bare-root", years: "1+1" };
  assert.equal(specKey(a), specKey({ ...a, latin: "corylus  avellana", cultivar: "corabel", rootstock: "Corylus colurna", years: "1/1" }));
  assert.notEqual(specKey(a), specKey({ ...a, years: "2+0" }));
  assert.notEqual(specKey(a), specKey({ ...a, rootstock: "Corylus avellana" }));
  assert.deepEqual(compareSpecs(a, { ...a, years: undefined }), { same: true, exact: false, differs: [], unknown: ["years"] });
  assert.deepEqual(compareSpecs(a, { ...a, propagation: "own-rooted", rootstock: undefined }).differs, ["propagation"]);
  assert.equal(compareSpecs({ latin: "Corylus colurna", propagation: "seedling" }, { latin: "Corylus colurna", propagation: "seedling", rootstock: undefined }).exact, true, "seedlings have no rootstock");
  for (const [x, y] of [["M9", "M.9"], ["MM 106", "MM106"], ["C. colurna", "Corylus colurna"], ["Corylus colurna seedling", "corylus colurna"]]) {
    assert.ok(compareSpecs({ ...a, rootstock: x }, { ...a, rootstock: y }).exact, `${x} = ${y}`);
  }
  assert.notEqual(specKey({ ...a, rootstock: "M9" }), specKey({ ...a, rootstock: "MM106" }));
  assert.deepEqual(compareSpecs({ ...a, rootstock: "Pyrus communis" }, { ...a, rootstock: "Prunus communis" }).differs, ["rootstock"]);
  assert.deepEqual(missingFields({ latin: "Corylus avellana", propagation: "grafted" }), ["rootstock", "organic", "bare root/container", "years"]);
  assert.equal(specLabel(a), "Corylus avellana 'Corabel' on Corylus colurna seedling · grafted · organic · bare root · 1+1");
});
