// Screening checklist: template keys, progress, input cleaning, route access.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { cleanDecision, cleanItem, itemKeys, progress, SCREENING, templateOf } from "../src/internal/checklists.ts";
import internalRoutes from "../src/routes/internal.ts";

test("screening template: Kris' four sections; item keys unique and safe as map keys", () => {
  assert.deepEqual(SCREENING.sections.map((s) => s.title.slice(0, 2)), ["A.", "B.", "C.", "D."]);
  const keys = SCREENING.sections.flatMap((s) => s.items.map((i) => i.key));
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^[a-z0-9-]+$/, k);
  assert.equal(itemKeys(SCREENING).size, 18);
});

test("progress: done, not relevant and issue count as done; per section and total", () => {
  const p = progress(SCREENING, {
    items: { "goals-primary": { state: "done" }, "landscape-wind": { state: "na" }, "landscape-drains": { state: "issue" }, "landscape-wet": { state: "open" }, "old-item": { state: "done" } },
    decision: { result: "go-conditions" },
  });
  assert.equal(p.done, 3, "answers to items no longer in the template don't count");
  assert.equal(p.total, 18);
  assert.equal(p.issues, 1);
  assert.deepEqual(p.sections[1], { key: "landscape", done: 2, total: 7, issues: 1 });
  assert.equal(p.decision, "go-conditions");
  assert.equal(progress(SCREENING, null).done, 0);
  assert.equal(progress(SCREENING, { items: new Map([["goals-primary", { state: "done" as const }]]) }).done, 1, "Mongoose maps too");
});

test("input: item state and note; decision", () => {
  assert.deepEqual(cleanItem({ state: "done" }), { ok: true, value: { state: "done" } }, "done without a note; the note isn't touched");
  assert.deepEqual(cleanItem({ note: " drains " }), { ok: true, value: { note: "drains" } }, "a note alone keeps the state");
  assert.equal(cleanItem({}).ok, false);
  assert.equal(templateOf("constructor"), undefined);
  assert.equal(templateOf("__proto__"), undefined);
  assert.equal(templateOf("screening"), SCREENING);
  assert.equal(cleanItem({ state: "maybe" }).ok, false);
  assert.equal(cleanItem({ state: "issue", note: { $gt: "" } }).ok, false);
  assert.equal((cleanItem({ state: "issue", note: "x".repeat(3000) }) as any).value.note.length, 2000);
  assert.deepEqual(cleanDecision({ result: "no-go", conditions: " wet " }), { ok: true, value: { result: "no-go", conditions: "wet" } });
  assert.deepEqual(cleanDecision({ result: "" }), { ok: true, value: { result: null, conditions: "" } });
  assert.equal(cleanDecision({ result: "maybe" }).ok, false);
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
const id = "000000000000000000000002";
const put = (path: string, body: unknown) => fetch(base + path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("checklist routes: anonymous 401, public 403; field users can't set the decision; bad input refused before the database", async () => {
  who = {};
  assert.equal((await fetch(`${base}/internal/projects/${id}/checklists/screening`)).status, 401);
  who = { user: { roles: [] }, idToken: { email_verified: true } };
  assert.equal((await fetch(`${base}/internal/projects/${id}/checklists/screening`)).status, 403);
  who = { user: { _id: "000000000000000000000001", roles: ["grove-field"] }, idToken: { email_verified: true } };
  assert.equal((await put(`/internal/projects/${id}/checklists/screening/decision`, { result: "go" })).status, 403);
  assert.equal((await fetch(`${base}/internal/projects/${id}/checklists/nope`)).status, 404);
  assert.equal((await put(`/internal/projects/${id}/checklists/screening/items/nope`, { state: "done" })).status, 404);
  assert.equal((await put(`/internal/projects/${id}/checklists/screening/items/goals-primary`, { state: "maybe" })).status, 400);
  assert.equal((await put(`/internal/projects/${id}/checklists/screening/sections/nope`, { note: "x" })).status, 404);
  assert.equal((await fetch(`${base}/internal/projects/nope/checklists/screening`)).status, 400);
  for (const k of ["constructor", "toString", "__proto__"]) {
    assert.equal((await put(`/internal/projects/${id}/checklists/${k}/items/x`, { state: "done" })).status, 404, k);
    assert.equal((await fetch(`${base}/internal/projects/${id}/checklists/${k}`)).status, 404, k);
  }
});
