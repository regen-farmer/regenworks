import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSpecies, designSpecies, fieldGeometry, modelSpecies, serviceConfig } from "../src/internal/screening.ts";

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
});
