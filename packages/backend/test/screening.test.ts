import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { after } from "node:test";
import { cleanSpecies, designRows, designSpecies, fieldGeometry, modelSpecies, pickResult, serviceConfig } from "../src/internal/screening.ts";
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
    { geometry: JSON.stringify(line).replace(/"/g, "&#34;"), sequence: { model: [{ species: { genus: "Populus", height: 500 } }] } },
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { line: [[9.1, 56.1], [9.1, 56.2]], mature_height_m: 18, species: ["walnut", "hazel"] });
  assert.equal(rows[1].mature_height_m, null);
  assert.equal(rows[2].line[0][0], 9.2);
  assert.deepEqual(rows[3].species, ["hybrid poplar"]);
  assert.equal(rows[3].mature_height_m, null, "an implausible height is ignored");
});
