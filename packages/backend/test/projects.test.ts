// Grove Dashboard: input, stage moves, field-user view, route access.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { cleanProject, forFieldUser, stageAfterOffer } from "../src/internal/projects.ts";
import internalRoutes from "../src/routes/internal.ts";

test("input: name required on create; enums checked; unknown fields ignored", () => {
  assert.equal(cleanProject({}, { creating: true }).ok, false);
  const ok = cleanProject({ name: " Brian ", stage: "signed", createdBy: "x", offerValue: 9, plannedHa: "12.5" }, { creating: true });
  assert.ok(ok.ok);
  assert.deepEqual(Object.keys(ok.value).sort(), ["name", "plannedHa", "stage"]);
  assert.equal(cleanProject({ stage: "won" }).ok, false);
  assert.equal(cleanProject({ farm: { $ne: null } }).ok, false);
  assert.equal(cleanProject({ assignees: ["nope"] }).ok, false);
  assert.equal((cleanProject({ farm: "" }) as any).value.farm, null);
});

test("offers move projects forward, never back", () => {
  assert.equal(stageAfterOffer("prospect", "offer-made"), "design-offer");
  assert.equal(stageAfterOffer("design-offer", "offer-made"), null);
  assert.equal(stageAfterOffer("design-offer", "offer-accepted"), "signed");
  assert.equal(stageAfterOffer("management", "offer-accepted"), null);
  assert.equal(stageAfterOffer("prospect", "offer-accepted"), "signed");
});

test("field users see no money and no client contacts", () => {
  const p = forFieldUser({ name: "X", offerValue: 1, signedValue: 2, notes: "n", client: { name: "C", email: "e", phone: "p" } });
  assert.deepEqual(p, { name: "X", client: { name: "C" } });
});

// Routes: writes need grove-team; anonymous/public refused.
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
const verified = { email_verified: true };

test("/internal/projects: anonymous 401, public 403; field users can't change anything", async () => {
  who = {};
  assert.equal((await fetch(`${base}/internal/projects`)).status, 401);
  who = { user: { roles: [] }, idToken: verified };
  assert.equal((await fetch(`${base}/internal/projects`)).status, 403);
  who = { user: { _id: "000000000000000000000001", roles: ["grove-field"] }, idToken: verified };
  for (const [method, path] of [
    ["POST", "/internal/projects"],
    ["PUT", "/internal/projects/000000000000000000000002"],
    ["DELETE", "/internal/projects/000000000000000000000002"],
    ["POST", "/internal/projects/bulk-status"],
    ["GET", "/internal/projects/farms"],
  ]) {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
    assert.equal(r.status, 403, `${method} ${path}`);
  }
});
