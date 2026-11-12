import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { after } from "node:test";
import { ALL_MODEL_SPECIES, cleanSpecies, designRows, designSpecies, layoutRows, pickDesign, pickSuitability, fieldGeometry, modelSpecies, pickResult, serviceConfig } from "../src/internal/screening.ts";
import internalRoutes from "../src/routes/internal.ts";
import { cleanFieldSoil, hasMeasurement, soilForService } from "../src/internal/fieldSoil.ts";

test("screening: the other phase-1 species map too (11 Nov)", () => {
  assert.equal(modelSpecies({ genus: "Prunus", species: "avium" }), "sweet cherry");
  assert.equal(modelSpecies({ genus: "Prunus", species: "spinosa" }), null, "blackthorn is not a model species");
  assert.equal(modelSpecies({ genus: "Juglans", species: "ailantifolia" }), "heartnut");
  assert.equal(modelSpecies({ genus: "Castanea", species: "sativa x crenata" }), "euro-japanese chestnut");
  assert.equal(modelSpecies({ genus: "Salix", species: "viminalis" }), "willow");
  assert.equal(modelSpecies({ genus: "Morus", species: "nigra" }), "mulberry");
  assert.equal(modelSpecies({ nameCommon: "Haskap", genus: "", species: "" }), "haskap");
  assert.equal(cleanSpecies(ALL_MODEL_SPECIES).length, 10, "at most 10 species a run");
});

test("screening: library species map to the model's species", () => {
  assert.equal(modelSpecies({ genus: "Corylus", species: "avellana" }), "hazel");
  assert.equal(modelSpecies({ genus: "Juglans", species: "x intermedia" }), "walnut");
  assert.equal(modelSpecies({ nameCommon: "Black chokeberries", genus: "Aronia", species: "melanocarpa" }), "aronia");
  assert.equal(modelSpecies({ nameCommon: "Apple", genus: "Malus", species: "domestica" }), "apple");
  assert.equal(modelSpecies({ nameCommon: "Hawthorn", genus: "Crataegus", species: "monogyna" }), null);
  const d = designSpecies([{ sequence: [{ species: { genus: "Corylus", species: "avellana" } }, { species: { nameCommon: "Hawthorn", genus: "Crataegus" } }] }, { sequence: [{ species: "id-only" }] }]);
  assert.deepEqual(d, { covered: ["hazel"], notCovered: ["Hawthorn"] });
  assert.deepEqual(cleanSpecies(["hazel", "x", "hazel", 3]), ["hazel"]);
});

test("screening: field outlines and the service config", () => {
  const poly = { type: "Polygon", coordinates: [[[9, 56], [9.1, 56], [9.1, 56.1], [9, 56]]] };
  assert.deepEqual(fieldGeometry(JSON.stringify({ type: "Feature", geometry: poly, properties: {} })), poly);
  assert.deepEqual(fieldGeometry(JSON.stringify(poly).replace(/"/g, "&#34;")), poly);
  assert.equal(fieldGeometry(JSON.stringify({ type: "Point", coordinates: [9, 56] })), null);
  assert.equal(fieldGeometry("not json"), null);
  assert.equal(serviceConfig({}), null);
  assert.equal(serviceConfig({ SCREENING_URL: "https://x.onrender.com", SCREENING_KEY: "short" }), null);
  assert.deepEqual(serviceConfig({ SCREENING_URL: "https://x.onrender.com/", SCREENING_KEY: "k".repeat(32) }), { url: "https://x.onrender.com", key: "k".repeat(32) });
  assert.deepEqual(serviceConfig({ SCREENING_URL: " https://x.onrender.com\n", SCREENING_KEY: "k".repeat(32) + "\n" }), { url: "https://x.onrender.com", key: "k".repeat(32) }, "pasted line breaks trimmed");
  assert.equal(serviceConfig({ SCREENING_URL: "http://x.onrender.com", SCREENING_KEY: "k".repeat(32) }), null, "no plain http to another host");
  assert.ok(serviceConfig({ SCREENING_URL: "http://localhost:8000", SCREENING_KEY: "k".repeat(32) }));
  assert.deepEqual(Object.keys(pickResult({ site: "s", extra: "x" })).sort(), ["design", "field_covered", "layers", "model", "name", "site", "species", "suitability"]);
});

let who: any = {};
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = who.user;
  req.idToken = who.idToken;
  next();
});
app.use("/internal", internalRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

test("/internal/screening: grove-team only", async () => {
  for (const [user, status] of [
    [undefined, 401],
    [{ roles: [] }, 403],
    [{ _id: "000000000000000000000001", roles: ["grove-field"] }, 403],
  ] as const) {
    who = user ? { user, idToken: { email_verified: true } } : {};
    assert.equal((await fetch(`${base}/internal/screening/project/000000000000000000000002/fields`)).status, status);
    assert.equal((await fetch(`${base}/internal/screening/run`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, status);
    assert.equal((await fetch(`${base}/internal/field-soil/000000000000000000000002`)).status, status);
    assert.equal((await fetch(`${base}/internal/field-soil/000000000000000000000002`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" })).status, status);
    assert.equal((await fetch(`${base}/internal/field-soil/000000000000000000000002`, { method: "DELETE" })).status, status);
    assert.equal((await fetch(`${base}/internal/field-soil/scenario/000000000000000000000002`)).status, status);
  }
});

test("cleanFieldSoil: known fields in range, empty clears, nothing else", () => {
  const ok = cleanFieldSoil({ jb: "6", ph: "6,4", wetDepthM: 0.456, rootDepthM: "", source: "lab", sampledOn: "2026-11-10", notes: "auger", owner: "x", layer: "y" });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual({ ...ok.value, sampledOn: undefined }, { jb: 6, ph: 6.4, wetDepthM: 0.46, rootDepthM: null, source: "lab", sampledOn: undefined, notes: "auger" });
    assert.ok(ok.value.sampledOn instanceof Date);
  }
  for (const bad of [{ jb: 13 }, { jb: 6.5 }, { ph: 2 }, { wetDepthM: -1 }, { rootDepthM: "deep" }, { source: "guess" }, { sampledOn: "2099-01-01" }, { notes: 5 }, [], null, "x"]) {
    assert.equal(cleanFieldSoil(bad).ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(cleanFieldSoil({}), { ok: true, value: {} });
  assert.deepEqual(cleanFieldSoil({ wetDepthM: " " }), { ok: true, value: { wetDepthM: null } }, "blank text clears, not 0");
  assert.deepEqual(cleanFieldSoil({ wetDepthM: 1, wetFound: false }), { ok: true, value: { wetDepthM: 1, wetFound: false } });
  assert.equal(cleanFieldSoil({ wetDepthM: 1, wetFound: "no" }).ok, false);
  assert.equal(cleanFieldSoil({ jb: 6, wetFound: false }).ok, false, "the flag can't change without the depth");
  assert.deepEqual(cleanFieldSoil({ wetDepthM: 0.5 }), { ok: true, value: { wetDepthM: 0.5, wetFound: null } }, "a new depth resets the flag");
  assert.deepEqual(cleanFieldSoil({ wetDepthM: null, wetFound: false }), { ok: true, value: { wetDepthM: null, wetFound: null } }, "no depth, no flag");
  assert.equal(cleanFieldSoil({ wetDepthM: 0, wetFound: false }).ok, false, "dry to 0 m");
  const only = cleanFieldSoil({ wetFound: false });
  assert.equal(only.ok, false, "the flag alone is not a measurement");
  assert.equal(hasMeasurement({ source: "visit", jb: null }), false, "a record needs a measured value");
  assert.equal(hasMeasurement({ ph: 6.2 }), true);
});

test("soilForService: measured values only, null when none", () => {
  assert.equal(soilForService(null), null);
  assert.equal(soilForService({ source: "visit", notes: "x" }), null);
  assert.deepEqual(soilForService({ jb: 7, ph: null, wetDepthM: 0.4, notes: "x" }), { jb: 7, ph: null, wet_depth_m: 0.4, root_depth_m: null });
  assert.equal(soilForService({ wetDepthM: 1.0, wetFound: false })?.wet_found, false, "dry down to the auger depth");
  assert.equal(soilForService({ wetDepthM: 0.4, wetFound: true })?.wet_found, undefined, "found is the default");
  assert.equal(soilForService({ jb: 6, wetFound: false })?.wet_found, undefined, "no depth, no flag");
});

test("designRows: a scenario's row lines, tallest mature height and grove-twin species", () => {
  const line = { type: "LineString", coordinates: [[9.1, 56.1], [9.1, 56.2], ["x", 1]] };
  const rows = designRows([
    { geometry: JSON.stringify(line), sequence: { model: [{ species: { genus: "Juglans", height: 18 } }, { species: { genus: "Corylus", height: 6 } }] } },
    { geometry: JSON.stringify({ type: "Feature", geometry: { type: "MultiLineString", coordinates: [[[9, 56], [9, 56.1]], [[9.2, 56], [9.2, 56.1]]] } }), sequence: null },
    { geometry: JSON.stringify({ type: "Point", coordinates: [9, 56] }) },
    { geometry: "not json" },
    { geometry: JSON.stringify({ type: "FeatureCollection", features: {} }) },
    { geometry: JSON.stringify({ type: "MultiLineString", coordinates: 5 }) },
    { geometry: JSON.stringify({ type: "LineString", coordinates: [[9, 56], [9, 57]] }), sequence: { model: "junk" } as any },
    { geometry: JSON.stringify(line).replace(/"/g, "&#34;"), sequence: { model: [{ species: { genus: "Populus", height: 500 } }] } },
  ]);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], { line: [[9.1, 56.1], [9.1, 56.2]], mature_height_m: 18, species: ["walnut", "hazel"] });
  assert.equal(rows[1].mature_height_m, null);
  assert.equal(rows[2].line[0][0], 9.2);
  assert.deepEqual(rows[3].species, []);
  assert.deepEqual(rows[4].species, ["hybrid poplar"]);
  assert.equal(rows[4].mature_height_m, null, "an implausible height is ignored");
  const many = designRows(Array.from({ length: 100 }, () => ({ geometry: JSON.stringify({ type: "LineString", coordinates: Array.from({ length: 1500 }, (_, i) => [9, 56 + i * 1e-5]) }) })));
  assert.ok(many.reduce((n, r) => n + r.line.length, 0) <= 50_000, "a total point budget");
});

test("pickDesign: only what the Screening tab shows", () => {
  assert.equal(pickDesign(null), null);
  assert.equal(pickDesign([1]), null);
  const d = pickDesign({
    rows: { rows: 3, height_m: [4, 4], secret: "x" },
    species: { walnut: {} },
    compare: { walnut: { today: { wind_growth_factor: 0.64, extra: 1 }, with_design: "bad", statement: "s", verdict: 7 }, "<b>": {} },
    layers: [{ id: "a", title: "t", png: "data:image/png;base64,AA", corners: [], legend: {} }, { id: "b", title: "t", png: "javascript:x", corners: [], legend: {} }, "junk"],
    note: "n",
  })!;
  assert.deepEqual(Object.keys(d).sort(), ["compare", "layers", "note", "rows"]);
  assert.deepEqual(Object.keys(d.compare), ["walnut"]);
  assert.equal(d.compare.walnut.today.wind_growth_factor, 0.64);
  assert.equal(d.compare.walnut.with_design.wind_growth_factor, null);
  assert.equal(d.compare.walnut.verdict, null);
  assert.equal(d.layers.length, 1);
});

test("layoutRows: the page's row lines with species and heights from the saved design", () => {
  const saved = [{ sequence: [{ species: { genus: "Castanea", height: 15 } }, { species: { genus: "Hippophae", height: 4 } }] }, { sequence: [{ species: { genus: "Salix", height: 9 } }] }];
  const rows = layoutRows(
    [
      { line: [[9.1, 56.1], [9.1, 56.2]], row: 0 },
      { line: [[9.2, 56.1], [9.2, 56.2]], row: 1, mature_height_m: 99, species: ["evil"] },
      { line: [[9.3, 56.1], [9.3, 56.2]], row: 7 },
      { line: "x", row: 0 },
      null,
    ],
    saved,
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { line: [[9.1, 56.1], [9.1, 56.2]], mature_height_m: 15, species: ["sweet chestnut", "sea buckthorn"] });
  assert.deepEqual(rows[1].species, ["willow (coppiced)"], "species and height come from the saved design, not the request");
  assert.equal(rows[1].mature_height_m, 9);
  assert.equal(rows[2].mature_height_m, null, "an unknown design row still shelters at the default height");
  assert.deepEqual(layoutRows("nope", saved), []);
});

test("pickSuitability: species rows and soil tests only", () => {
  assert.equal(pickSuitability(null), null);
  const s = pickSuitability({ jb: 3, soil_test_sentence: "A soil test could change apple (texture).", x: 1,
    species: [{ species: "apple", screened: true, status: "go with measures", risk: "soil", words: "w", soil_tests: [{ test: "texture", p_change: 0.2, could_be: ["doubtful", "evil"] }, { test: "rm -rf", p_change: 1 }] },
      { species: "hazel", status: "maybe" }, "junk"] })!;
  assert.equal(s.species.length, 1);
  assert.deepEqual(s.species[0].soil_tests, [{ test: "texture", p_change: 0.2, could_be: ["doubtful"] }]);
  assert.equal(s.jb, 3);
  assert.ok(!("x" in s));
  const t = pickSuitability({ jb: 2.7, species: [{ species: "a", status: "go", soil_tests: [] }, { species: "b", screened: true, status: "no",
    soil_tests: [{ test: "ph", p_change: 5, could_be: ["go", "go"] }, { test: "ph", p_change: 0.1 }] }, { species: " ", status: "go" }] })!;
  assert.equal(t.jb, null, "a soil class must be a whole JB number");
  assert.equal(t.species.length, 2);
  assert.equal(t.species[0].species, "b", "screened species first");
  assert.deepEqual(t.species[0].soil_tests, [{ test: "ph", p_change: 1, could_be: ["go"] }]);
  assert.equal(pickSuitability({ species: [{ species: "x", status: "maybe" }] }), null);
  assert.equal(s.measured, null);
  const m = pickSuitability({ jb: 2, measured: { jb: 2, ph: "6", wet_depth_m: 0.3, evil: 1 }, species: [{ species: "a", status: "go" }] })!;
  assert.deepEqual(m.measured, { jb: 2, ph: null, wet_depth_m: 0.3, root_depth_m: null });
  const cv = pickSuitability({ species: [{ species: "walnut", status: "go", cultivars: [{ cultivar: "Lara", ripening: "early", share_of_years_warm_enough: 1.4 }, { cultivar: "" }, "x"] }] })!;
  assert.deepEqual(cv.species[0].cultivars, [{ cultivar: "Lara", ripening: "early", share: 1 }]);
});
