// Model sites for the landscape model: pasted coordinates, outlines, the export and its guards.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { cleanGeometry, cleanQueue, cleanSiteUpdate, parseCoordinateLines, toFeatureCollection } from "../src/internal/modelSites.ts";
import modelSitesExport, { exportKeyOk } from "../src/routes/modelSitesExport.ts";
import internalRoutes from "../src/routes/internal.ts";

test("pasted coordinates: Google's 'lat, lon', a name after, Danish decimal commas, lon-first lines", () => {
  const { items, skipped } = parseCoordinateLines(
    "55.672643, 12.294337 Taastrup\n56,303055; 8,512583\n8.518137 56.308271 Hestbjerg 2\n\nnot a point\n",
  );
  assert.equal(items.length, 3);
  assert.deepEqual([items[0].lat, items[0].lon, items[0].name], [55.672643, 12.294337, "Taastrup"]);
  assert.deepEqual([items[1].lat, items[1].lon], [56.303055, 8.512583]);
  assert.deepEqual([items[2].lat, items[2].lon, items[2].name], [56.308271, 8.518137, "Hestbjerg 2"]);
  assert.deepEqual(skipped, ["not a point"]);
});

test("queue: needs a batch and at least one point", () => {
  assert.equal(cleanQueue({ text: "55.6, 12.2" }).ok, false);
  assert.equal(cleanQueue({ batch: "x", text: "nothing" }).ok, false);
  const q = cleanQueue({ batch: "EURAF DE", items: [{ lon: 9, lat: 52, name: "A", source: "euraf-map", sourceRef: "17" }, { lon: 999, lat: 1 }] });
  assert.ok(q.ok && q.value.items.length === 1 && q.value.skipped.length === 1 && q.value.items[0].source === "euraf-map");
});

test("outline: closes rings, rejects bad coordinates and other geometry types", () => {
  const g = cleanGeometry({ type: "Polygon", coordinates: [[[9, 56], [9.01, 56], [9.01, 56.01], [9, 56.01]]] });
  assert.ok(g && g.type === "Polygon");
  const ring = (g!.coordinates as number[][][])[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  assert.equal(cleanGeometry({ type: "Polygon", coordinates: [[[9, 56], [9, 95], [9.1, 56], [9, 56]]] }), null);
  assert.equal(cleanGeometry({ type: "Point", coordinates: [9, 56] }), null);
  assert.equal(cleanGeometry({ type: "Polygon", coordinates: [[[9, 56], [9, 56.1]]] }), null);
});

test("update: outline marks the site traced; ranges are checked; unknown fields dropped", () => {
  const u = cleanSiteUpdate({
    geometry: { type: "Polygon", coordinates: [[[9, 56], [9.01, 56], [9.01, 56.01], [9, 56]]] },
    system: "silvoarable", species: "Poplar, Willow", rowBearingDeg: "14", alleyWidthM: 72, plantedYear: 2012, isAdmin: true,
  });
  assert.ok(u.ok);
  assert.equal(u.value.status, "traced");
  assert.deepEqual(u.value.species, ["Poplar", "Willow"]);
  assert.equal(u.value.rowBearingDeg, 14);
  assert.equal((u.value as any).isAdmin, undefined);
  assert.equal(cleanSiteUpdate({ rowBearingDeg: 270 }).ok, false);
  assert.equal(cleanSiteUpdate({ system: "jungle" }).ok, false);
  assert.ok(cleanSiteUpdate({ system: "agrosilvopastoral" }).ok && cleanSiteUpdate({ system: "control" }).ok);
  assert.equal(cleanSiteUpdate({ plantedYear: null }).ok && true, true);
  assert.equal(cleanSiteUpdate({ plantedYear: 2012.5 }).ok, false);
  const f = cleanSiteUpdate({ fieldIds: ["DK:1", 2, { x: 1 }] });
  assert.ok(f.ok && f.value.fieldIds!.join("|") === "DK:1|2");
});

test("export: only traced sites with an outline, as features grove-data reads, no user ids", () => {
  const fc = toFeatureCollection([
    { _id: "a1", name: "Hestbjerg", batch: "DK", status: "traced", geometry: { type: "Polygon", coordinates: [] }, system: "short-rotation", species: ["Poplar"], createdBy: "u1" },
    { _id: "a2", name: "queued", batch: "DK", status: "queued", geometry: null },
    { _id: "a3", name: "skipped", batch: "DK", status: "skipped", geometry: { type: "Polygon", coordinates: [] } },
  ]);
  assert.equal(fc.features.length, 1);
  const p = fc.features[0].properties;
  assert.equal(p.site, "model-a1");
  assert.equal(p.zone, "inner");
  assert.equal(JSON.stringify(fc).includes("u1"), false);
  assert.equal("notes" in p, false, "notes stay in GroveWorks");
});

test("export key: constant-time match, short or missing keys never match", () => {
  const key = "k".repeat(32);
  assert.equal(exportKeyOk(key, key), true);
  assert.equal(exportKeyOk("wrong", key), false);
  assert.equal(exportKeyOk(undefined, key), false);
  assert.equal(exportKeyOk("short", "short"), false);
  assert.equal(exportKeyOk(key, undefined), false);
});

// guards, over real HTTP, before any database access
type Who = { user?: any; idToken?: any };
let who: Who = {};
const app = express();
app.use((req: any, _res, next) => {
  req.user = who.user;
  req.idToken = who.idToken;
  next();
});
app.use("/internal", internalRoutes);
app.use("/model-sites-export", modelSitesExport);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

test("/internal/model-sites: anonymous 401, field user 403", async () => {
  who = {};
  assert.equal((await fetch(`${base}/internal/model-sites`)).status, 401);
  who = { user: { roles: ["grove-field"] }, idToken: { email_verified: true } };
  assert.equal((await fetch(`${base}/internal/model-sites`)).status, 403);
  assert.equal((await fetch(`${base}/internal/model-sites/queue`, { method: "POST" })).status, 403);
});

test("/model-sites-export: closed (404) without the setting, 401 with a wrong key", async () => {
  const old = process.env.MODEL_SITES_EXPORT_KEY;
  delete process.env.MODEL_SITES_EXPORT_KEY;
  assert.equal((await fetch(`${base}/model-sites-export`)).status, 404);
  process.env.MODEL_SITES_EXPORT_KEY = "short";
  assert.equal((await fetch(`${base}/model-sites-export`, { headers: { "x-model-sites-key": "short" } })).status, 404);
  process.env.MODEL_SITES_EXPORT_KEY = "x".repeat(40);
  assert.equal((await fetch(`${base}/model-sites-export`)).status, 401);
  assert.equal((await fetch(`${base}/model-sites-export`, { headers: { "x-model-sites-key": "nope" } })).status, 401);
  if (old === undefined) delete process.env.MODEL_SITES_EXPORT_KEY;
  else process.env.MODEL_SITES_EXPORT_KEY = old;
});

test("pasted coordinates: a long hostile line is cut and read quickly", () => {
  const t0 = Date.now();
  parseCoordinateLines("0\t" + "\t".repeat(100000) + "x\n" + "0\t0" + " ".repeat(100000));
  assert.ok(Date.now() - t0 < 200);
});
