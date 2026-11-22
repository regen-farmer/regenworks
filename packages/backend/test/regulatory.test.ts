import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { answer, checklistWords, distanceM, readFeatures, REG_LAYERS, wfsUrl, widen, wmsTiles } from "../src/internal/regulatory.ts";
import { checkField } from "../src/internal/regulatoryRoutes.ts";
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

test("a polygon inside the field, a point, and speed on real-sized shapes", () => {
  assert.equal(distanceM(field, box(10.3005, 55.4003, 10.301, 55.4006)), 0, "a small §3 area inside the field");
  const pt = { type: "Point", coordinates: [10.3017, 55.4025] }; // ~167 m north
  assert.ok(Math.abs(distanceM(field, pt) - 167) < 5, String(distanceM(field, pt)));
  // a 500-vertex field next to a 3000-vertex polygon
  const ring = (n: number, cx: number, cy: number, r: number) => [Array.from({ length: n + 1 }, (_, i) => [cx + r * 1.7 * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)])];
  const big = { type: "Polygon", coordinates: ring(500, 10.3, 55.4, 0.002) };
  const nature = { type: "Polygon", coordinates: ring(3000, 10.3, 55.405, 0.002) };
  const t0 = Date.now();
  const d = distanceM(big, nature);
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`);
  assert.ok(d > 105 && d < 118, String(d)); // centres 0.005° (556 m) apart, radii 0.002° (222 m) each: ≈ 111 m
});

test("what the service sends: no feature collection is 'couldn't be checked'; a cut-off answer is never 'clear'", async () => {
  assert.equal(readFeatures({ error: "x" }), null);
  assert.equal(readFeatures({ type: "FeatureCollection", features: [], numberMatched: 0 })!.truncated, false);
  assert.equal(readFeatures({ type: "FeatureCollection", features: [{}], numberMatched: 500 })!.truncated, true);
  assert.equal(answer(p3, field, [], true).status, "unavailable");
  assert.equal(answer(p3, field, [{ geometry: box(10.301, 55.4005, 10.31, 55.41) }], true).status, "inside");
  const r = await checkField(field, async (url) => {
    if (url.includes("bes_naturtyper")) return { type: "FeatureCollection", features: [{ geometry: box(10.3047, 55.4, 10.31, 55.401) }], numberMatched: 1 };
    if (url.includes("kirkebyggelinjer")) throw new Error("HTTP 500");
    if (url.includes("skovbyggelinjer")) return "<html>";
    return { type: "FeatureCollection", features: [], numberMatched: 0 };
  });
  const by = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.equal(by["p3-nature"].status, "near");
  assert.equal(by["p19-church"].status, "unavailable");
  assert.equal(by["p17-forest"].status, "unavailable");
  assert.equal(by["fredning"].status, "clear");
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
