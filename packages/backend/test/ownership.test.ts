// Ownership guards: unit tests plus a sweep over every guarded route.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { ownershipDecision, setOwnerLookupForTests } from "../src/middleware/ownership.ts";

const id = (n: number) => n.toString(16).padStart(24, "0");
const OWNER = { _id: id(1), roles: [] };
const OTHER = { _id: id(2), roles: [] };
const TEAM = { _id: id(3), roles: ["grove-team"] };
const ADMIN = { _id: id(4), roles: ["grove-admin"] };

test("decision: owner yes, others no, admin yes, anonymous 401, missing 404", () => {
  const found = { ownerId: OWNER._id };
  const get = { method: "GET" };
  assert.equal(ownershipDecision(OWNER, true, found, get), 200);
  assert.equal(ownershipDecision(OTHER, true, found, get), 403);
  assert.equal(ownershipDecision(TEAM, true, found, get), 403, "grove-team is not enough for others' farms");
  assert.equal(ownershipDecision(ADMIN, true, found, get), 200);
  assert.equal(ownershipDecision(undefined, false, found, get), 401);
  assert.equal(ownershipDecision(OWNER, false, found, get), 401, "unverified email");
  assert.equal(ownershipDecision(OTHER, true, null, get), 404);
  assert.equal(ownershipDecision(OTHER, true, { ownerId: undefined }, get), 403, "no owner: admin only");
});

test("decision: public scenarios can be read by anyone, never changed", () => {
  const pub = { ownerId: OWNER._id, isPublic: true };
  assert.equal(ownershipDecision(undefined, false, pub, { method: "GET", allowPublic: true }), 200);
  assert.equal(ownershipDecision(OTHER, true, pub, { method: "PUT", allowPublic: true }), 403);
  assert.equal(ownershipDecision(undefined, false, pub, { method: "GET" }), 401, "only where allowed");
});

// ---- sweep: every route with a guard refuses a non-owner ----

const ROUTE_FILES = fs.readdirSync(new URL("../src/routes/", import.meta.url)).filter((f) => f.endsWith(".ts"));

type Route = { file: string; method: string; path: string; guard: string };
function guardedRoutes(): Route[] {
  const out: Route[] = [];
  for (const file of ROUTE_FILES) {
    const src = fs.readFileSync(new URL(`../src/routes/${file}`, import.meta.url), "utf8");
    const re = /router\.(get|post|put|patch|delete)\(\s*"([^"]+)",\s*((?:owns|requireRole|isSelf)\([^)]*\))/g;
    for (const m of src.matchAll(re)) out.push({ file, method: m[1].toUpperCase(), path: m[2], guard: m[3] });
  }
  return out;
}

let who: any = {};
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = who.user;
  req.idToken = who.idToken;
  next();
});
for (const file of ROUTE_FILES) {
  const mod = await import(`../src/routes/${file}`);
  app.use(file === "internal.ts" ? "/internal" : "", mod.default);
}
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => {
  setOwnerLookupForTests(null);
  server.close();
});

// Every record "belongs" to OWNER and is private.
setOwnerLookupForTests(async () => ({ ownerId: OWNER._id, isPublic: false }));

const fill = (path: string) => path.replace(/:\w+/g, id(99));
const call = async (r: Route, as: any) => {
  who = as;
  const res = await fetch(base + fill(r.path), {
    method: r.method,
    headers: { "content-type": "application/json" },
    body: r.method === "GET" ? undefined : "{}",
  });
  await res.text();
  return res.status;
};

test("sweep finds the guarded routes", () => {
  const n = guardedRoutes().length;
  assert.ok(n >= 120, `only ${n} guarded routes found`);
});

test("every guarded route refuses a logged-in user who doesn't own the record", async () => {
  const failures: string[] = [];
  for (const r of guardedRoutes()) {
    const status = await call(r, { user: OTHER, idToken: { email_verified: true } });
    if (status !== 403) failures.push(`${r.method} ${r.path} (${r.file}) → ${status}`);
  }
  assert.deepEqual(failures, []);
});

test("every guarded route refuses anonymous requests", async () => {
  const failures: string[] = [];
  for (const r of guardedRoutes()) {
    const status = await call(r, {});
    if (status !== 401) failures.push(`${r.method} ${r.path} (${r.file}) → ${status}`);
  }
  assert.deepEqual(failures, []);
});

// ---- each guard checks the right record ----

type Guard = { kind: string; param: string };
function guardsOf(r: Route): Guard[] {
  const src = fs.readFileSync(new URL(`../src/routes/${r.file}`, import.meta.url), "utf8");
  const start = src.indexOf(`"${r.path}",`, src.search(new RegExp(`router\\.${r.method.toLowerCase()}\\(\\s*"${r.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}",`)));
  const head = src.slice(start, src.indexOf("async", start));
  return [...head.matchAll(/owns\("(\w+)"(?:,\s*"(\w+)")?/g)].map((m) => ({ kind: m[1], param: m[2] ?? "id" }));
}

test("every owns() names a parameter that exists in its path", () => {
  const bad: string[] = [];
  for (const r of guardedRoutes()) {
    for (const g of guardsOf(r)) if (!r.path.includes(`:${g.param}`)) bad.push(`${r.method} ${r.path}: owns("${g.kind}", "${g.param}")`);
  }
  assert.deepEqual(bad, []);
});

test("each guard looks up its own parameter, and lets the owner through", async () => {
  const failures: string[] = [];
  for (const r of guardedRoutes()) {
    const guards = guardsOf(r);
    if (!guards.length) continue;
    // a distinct id per parameter
    const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
    const idFor = new Map(params.map((p, i) => [p, id(1000 + i)]));
    const url = base + r.path.replace(/:(\w+)/g, (_, p) => idFor.get(p)!);
    for (let i = 0; i < guards.length; i++) {
      const target = idFor.get(guards[i].param)!;
      const calls: string[] = [];
      // OTHER owns everything except the record guard i checks.
      setOwnerLookupForTests(async (kind, rid) => {
        calls.push(`${kind}:${rid}`);
        return { ownerId: rid === target ? OWNER._id : OTHER._id, isPublic: false };
      });
      who = { user: OTHER, idToken: { email_verified: true } };
      const res = await fetch(url, { method: r.method, headers: { "content-type": "application/json" }, body: r.method === "GET" ? undefined : "{}" });
      await res.text();
      const last = calls.at(-1);
      if (res.status !== 403 || last !== `${guards[i].kind}:${target}`) {
        failures.push(`${r.method} ${r.path} guard ${i + 1} owns("${guards[i].kind}", "${guards[i].param}"): status ${res.status}, last lookup ${last}`);
      }
    }
  }
  setOwnerLookupForTests(async () => ({ ownerId: OWNER._id, isPublic: false }));
  assert.deepEqual(failures, []);
});
