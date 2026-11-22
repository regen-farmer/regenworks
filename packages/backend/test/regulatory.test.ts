import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { answer, checklistWords, distanceM, REG_LAYERS, wfsUrl, widen, wmsTiles } from "../src/internal/regulatory.ts";
import internalRoutes from "../src/routes/internal.ts";

// a ~110 x 110 m field near 10.30 E, 55.40 N
const field = { type: "Polygon", coordinates: [[[10.3, 55.4], [10.3017, 55.4], [10.3017, 55.401], [10.3, 55.401], [10.3, 55.4]]] };
const box = (x0: number, y0: number, x1: number, y1: number) => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const p3 = REG_LAYERS.find((l) => l.id === "p3-nature")!;

test("distance: 0 when overlapping, metres to the nearest edge otherwise, lines too", () => {
  assert.equal(distanceM(field, box(10.301, 55.4005, 10.31, 55.41)), 0);
  const d = distanceM(field, box(10.3047, 55.4, 10.31, 55.401)); // 0.003° east ≈ 190 m at 55.4 N
  assert.ok(d > 180 && d < 200, String(d));
  const line = { type: "LineString", coordinates: [[10.299, 55.4022], [10.303, 55.4022]] }; // ~133 m north
  const dl = distanceM(field, line);
  assert.ok(dl > 125 && dl < 140, String(dl));
});

test("answer and checklist words: on the field, near, clear", () => {
  assert.equal(answer(p3, field, [{ geometry: box(10.301, 55.4005, 10.31, 55.41) }]).status, "inside");
  const near = answer(p3, field, [{ geometry: box(10.3047, 55.4, 10.31, 55.401) }, { geometry: null }]);
  assert.equal(near.status, "near");
  assert.equal(near.count, 1);
  assert.equal(answer(p3, field, []).status, "clear");
  const words = checklistWords([near, { ...answer(REG_LAYERS[1], field, []) }]);
  assert.match(words["regulatory-p3"], /§3 protected nature: \d+ m away/);
  assert.match(words["regulatory-p15"], /check on arealinfo/);
});

test("WFS and WMS requests: the layer's own service, lat/lon axis order for EPSG:4326, JSON", () => {
  const u = new URL(wfsUrl(p3, [10.29, 55.39, 10.31, 55.41]));
  assert.equal(u.origin + u.pathname, "https://arealeditering-dist-geo.miljoeportal.dk/geoserver/ows");
  assert.equal(u.searchParams.get("typeNames"), "dai:bes_naturtyper");
  assert.equal(u.searchParams.get("bbox"), "55.39,10.29,55.41,10.31,urn:ogc:def:crs:EPSG::4326");
  assert.equal(u.searchParams.get("outputFormat"), "application/json");
  assert.match(wmsTiles(p3), /bbox=\{bbox-epsg-3857\}/);
  const [w, s, e, n] = widen({ type: "Feature", properties: {}, geometry: field });
  assert.ok(w < 10.3 && e > 10.3017 && s < 55.4 && n > 55.401);
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

test("/internal/regulatory: grove-team only", async () => {
  for (const [user, status] of [
    [undefined, 401],
    [{ roles: [] }, 403],
    [{ _id: "000000000000000000000001", roles: ["grove-field"] }, 403],
  ] as const) {
    who = user ? { user, idToken: { email_verified: true } } : {};
    assert.equal((await fetch(`${base}/internal/regulatory/layers`)).status, status);
    assert.equal((await fetch(`${base}/internal/regulatory/field/000000000000000000000002`)).status, status);
  }
});
