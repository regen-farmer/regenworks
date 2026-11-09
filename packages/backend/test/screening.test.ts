import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { after } from "node:test";
import { cleanSpecies, designRows, designSpecies, layoutRows, pickDesign, fieldGeometry, modelSpecies, pickResult, serviceConfig } from "../src/internal/screening.ts";
import internalRoutes from "../src/routes/internal.ts";

test("screening: library species map to the model's species", () => {
  assert.equal(modelSpecies({ genus: "Corylus", species: "avellana" }), "hazel");
  assert.equal(modelSpecies({ genus: "Juglans", species: "x intermedia" }), "walnut");
  assert.equal(modelSpecies({ nameCommon: "Black chokeberries", genus: "Aronia", species: "melanocarpa" }), "aronia");
  assert.equal(modelSpecies({ nameCommon: "Apple", genus: "Malus", species: "domestica" }), null);
  const d = designSpecies([{ sequence: [{ species: { genus: "Corylus", species: "avellana" } }, { species: { nameCommon: "Apple", genus: "Malus" } }] }, { sequence: [{ species: "id-only" }] }]);
  assert.deepEqual(d, { covered: ["hazel"], notCovered: ["Apple"] });
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
  assert.deepEqual(Object.keys(pickResult({ site: "s", extra: "x" })).sort(), ["design", "field_covered", "layers", "model", "name", "site", "species"]);
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
  }
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
