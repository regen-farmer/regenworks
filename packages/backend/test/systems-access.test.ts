// System templates: shared ones readable by all logged-in users, private
// ones only by their owner or a Grove admin (part 2 of the access audit).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { setSystemLookupForTests } from "../src/middleware/ownership.ts";

const id = (n: number) => n.toString(16).padStart(24, "0");
const OWNER = { _id: id(1), roles: [] };
const OTHER = { _id: id(2), roles: [] };
const ADMIN = { _id: id(3), roles: ["grove-admin"] };
const SHARED = id(10);
const PRIVATE = id(11);
setSystemLookupForTests(async (sid) =>
  sid === SHARED ? { ownerId: OWNER._id, shared: true } : sid === PRIVATE ? { ownerId: OWNER._id, shared: false } : null,
);

let who: any = {};
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = who.user;
  req.idToken = who.idToken;
  next();
});
// stop right after the guards
for (const f of ["systems.ts", "systemflows.ts"]) {
  const router: any = (await import(`../src/routes/${f}`)).default;
  for (const layer of router.stack ?? []) {
    const stack = layer.route?.stack;
    if (stack?.length) stack[stack.length - 1].handle = (_q: any, r: any) => r.status(299).send("ok");
  }
  app.use("", router);
}
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => {
  setSystemLookupForTests(null);
  server.close();
});
const v = { email_verified: true };
const get = async (path: string, user: any) => {
  who = user ? { user, idToken: v } : {};
  const r = await fetch(base + path);
  await r.text();
  return r.status;
};

const PATHS = ["/systems/:id", "/systems/:id/edit", "/systems/:id/editold", "/systems/:id/succession", "/systems/:id/occurrences/new", "/systems/:id/flows/new"];

test("shared systems: any logged-in user; anonymous refused", async () => {
  for (const p of PATHS) {
    assert.equal(await get(p.replace(":id", SHARED), OTHER), 299, p);
    assert.equal(await get(p.replace(":id", SHARED), null), 401, p);
  }
});

test("private systems: owner and admin only", async () => {
  for (const p of PATHS) {
    assert.equal(await get(p.replace(":id", PRIVATE), OTHER), 403, p);
    assert.equal(await get(p.replace(":id", PRIVATE), OWNER), 299, p);
    assert.equal(await get(p.replace(":id", PRIVATE), ADMIN), 299, p);
  }
});

test("editing (copying) someone's private system is refused", async () => {
  who = { user: OTHER, idToken: v };
  const r = await fetch(`${base}/systems/${PRIVATE}`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403);
  const s = await fetch(`${base}/systems/${SHARED}`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(s.status, 299, "copying a shared template is fine");
});

test("attaching someone's private system to your own scenario or field is refused", async () => {
  // owns() on the user's own records passes via the ownership stub below
  const { setOwnerLookupForTests } = await import("../src/middleware/ownership.ts");
  setOwnerLookupForTests(async () => ({ ownerId: OTHER._id, isPublic: false }));
  who = { user: OTHER, idToken: v };
  const own = id(50);
  const calls: [string, string, any?][] = [
    ["GET", `/layers/${own}/systems/${PRIVATE}/projects/new`],
    ["POST", `/layers/${own}/systems/${PRIVATE}/projects`, {}],
    ["POST", `/projects/${own}/addedgesystem`, { systemid: PRIVATE }],
    ["POST", `/layers/${own}/presentsystem`, { systemid: PRIVATE }],
    ["POST", `/layers/${own}/editfuture`, { systemid: PRIVATE }],
    ["PUT", `/parcels/${own}/layers/${own}/projects/${own}/systems/${PRIVATE}/pick`, {}],
  ];
  for (const f of ["projects.ts", "layers.ts"]) {
    const router: any = (await import(`../src/routes/${f}`)).default;
    for (const layer of router.stack ?? []) {
      const stack = layer.route?.stack;
      if (stack?.length) stack[stack.length - 1].handle = (_q: any, r: any) => r.status(299).send("ok");
    }
    app.use("", router);
  }
  for (const [method, path, body] of calls) {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    await r.text();
    assert.equal(r.status, 403, `${method} ${path}`);
    const shared = await fetch(base + path.replace(PRIVATE, SHARED), { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify({ ...body, systemid: body.systemid ? SHARED : undefined }) : undefined });
    await shared.text();
    assert.equal(shared.status, 299, `shared: ${method} ${path}`);
  }
  setOwnerLookupForTests(null);
});
