// Real HTTP requests against the /internal router, so removing its guard fails a test.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import internalRoutes from "../src/routes/internal.ts";

type Who = { user?: any; idToken?: any };
let who: Who = {};

const app = express();
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

async function me(as: Who) {
  who = as;
  const res = await fetch(`${base}/internal/me`);
  return { status: res.status, body: await res.json() };
}

test("/internal/me: anonymous → 401", async () => {
  assert.equal((await me({})).status, 401);
});

test("/internal/me: public user → 403", async () => {
  assert.equal((await me({ user: { roles: [] }, idToken: verified })).status, 403);
});

test("/internal/me: field user → 200, no money", async () => {
  const r = await me({ user: { roles: ["grove-field"] }, idToken: verified });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { role: "grove-field", canSeeMoney: false });
});

test("/internal/me: team user → 200, money", async () => {
  const r = await me({ user: { roles: ["grove-team"] }, idToken: verified });
  assert.deepEqual(r.body, { role: "grove-team", canSeeMoney: true });
});

test("/internal/me: admin with unverified email → 401", async () => {
  assert.equal(
    (await me({ user: { isAdmin: true, roles: [] }, idToken: { email_verified: false } })).status,
    401,
  );
});

test("/internal/pricebook: field user → 403 (no prices for field users)", async () => {
  who = { user: { roles: ["grove-field"] }, idToken: verified };
  const res = await fetch(`${base}/internal/pricebook`);
  assert.equal(res.status, 403);
});

test("/internal/pricebook: anonymous → 401, public → 403", async () => {
  who = {};
  assert.equal((await fetch(`${base}/internal/pricebook`)).status, 401);
  who = { user: { roles: [] }, idToken: verified };
  assert.equal((await fetch(`${base}/internal/pricebook/import`, { method: "POST" })).status, 403);
});

test("/internal/pricebook: every route refuses field users", async () => {
  who = { user: { roles: ["grove-field"] }, idToken: verified };
  for (const path of ["/", "/versions", "/search?q=x", "/suggest?latin=x"]) {
    assert.equal((await fetch(`${base}/internal/pricebook${path}`)).status, 403, path);
  }
});

test("/internal/offers: field users and public users are refused", async () => {
  who = { user: { roles: ["grove-field"] }, idToken: verified };
  assert.equal((await fetch(`${base}/internal/offers`)).status, 403);
  who = { user: { roles: [] }, idToken: verified };
  assert.equal((await fetch(`${base}/internal/offers`, { method: "POST" })).status, 403);
});
