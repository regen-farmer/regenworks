// Tree register: IDs from a layout (same as stake-out), checks, survival, nearest tree, access. Made-up data.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { checkUpdate, cleanTreeCheck, defaultPrefix, HISTORY_MAX, nearest, survival, treesFromLayout } from "../src/internal/trees.ts";
import internalRoutes from "../src/routes/internal.ts";

// two rows of three trees running east, 4 m apart, near Ellinglund-ish coordinates
const lon0 = 10.0;
const lat0 = 56.0;
const dx = 4 / (111_320 * Math.cos((lat0 * Math.PI) / 180));
const dy = 6 / 111_320;
const marker = (row: number, i: number, variety?: string) => ({
  species: { nameCommon: "Hassel" },
  variety,
  rootstock: "rs1",
  organic: true,
  treeRowIndex: row,
  point: { geometry: { coordinates: [lon0 + i * dx, lat0 + row * dy] } },
});
// layout order inside a row is not along the row: the register must sort like the stake-out
const layout = {
  treeMarkerArray: [marker(0, 2, "v1"), marker(0, 0, "v1"), marker(0, 1, "v1"), marker(1, 1), marker(1, 0), marker(1, 2)],
  treeRowLines: [
    { line: { geometry: { coordinates: [[lon0, lat0], [lon0 + 3 * dx, lat0]] } } },
    // the second row's line runs the other way; T001 must still be at the west end
    { line: { geometry: { coordinates: [[lon0 + 3 * dx, lat0 + dy], [lon0, lat0 + dy]] } } },
  ],
};
const names = { varieties: { v1: "Corabel" }, rootstocks: { rs1: "Corylus colurna" } };

test("trees from a design: stake-out names, rows and order, plant labels", () => {
  const trees = treesFromLayout(layout, names, "EL");
  assert.deepEqual(
    trees.map((t) => t.name),
    ["ELR01T001", "ELR01T002", "ELR01T003", "ELR02T001", "ELR02T002", "ELR02T003"],
  );
  assert.ok(trees[0].lon < trees[1].lon && trees[1].lon < trees[2].lon, "T001 at the west end");
  assert.ok(trees[3].lon < trees[5].lon, "row 2 runs the same way as row 1");
  assert.equal(trees[0].label, "Hassel Corabel on Corylus colurna (organic)");
  assert.equal(trees[3].label, "Hassel on Corylus colurna (organic)");
  assert.equal(defaultPrefix("Ellinglund mark 3"), "EM3");
});

test("tree check input", () => {
  assert.deepEqual(cleanTreeCheck({ status: "dead", cause: "voles", note: "  bark gnawed  " }), { ok: true, value: { status: "dead", cause: "voles", note: "bark gnawed" } });
  assert.deepEqual((cleanTreeCheck({ status: "alive", cause: "voles" }) as any).value, { status: "alive", cause: null }, "alive trees lose the cause");
  assert.deepEqual((cleanTreeCheck({ replanted: true }) as any).value, { replanted: true, status: "alive", cause: null });
  assert.equal(cleanTreeCheck({ status: "zombie" }).ok, false);
  assert.equal(cleanTreeCheck({ cause: "constructor" }).ok, false);
  assert.equal(cleanTreeCheck({ cause: { $ne: 1 } }).ok, false);
  assert.equal(cleanTreeCheck({ note: { $set: 1 } }).ok, false);
  assert.equal(cleanTreeCheck({ replanted: "yes" }).ok, false);
  assert.equal(cleanTreeCheck({}).ok, false);
});

test("check update: current values, cause cleared when alive, history capped", () => {
  const at = new Date("2027-09-01T10:00:00Z");
  const dead = checkUpdate({ status: "dead", cause: "drought" }, "u1", at) as any;
  assert.deepEqual(dead.$set, { checkedAt: at, checkedBy: "u1", status: "dead", cause: "drought" });
  assert.deepEqual(dead.$push.history, { $each: [{ at, by: "u1", status: "dead", cause: "drought" }], $slice: -HISTORY_MAX });
  assert.equal(dead.$unset, undefined);
  const re = checkUpdate((cleanTreeCheck({ replanted: true }) as any).value, "u1", at) as any;
  assert.deepEqual(re.$unset, { cause: "" });
  assert.deepEqual(re.$inc, { replanted: 1 });
  assert.equal(re.$set.status, "alive");
  const noteOnly = checkUpdate({ note: "staked again" }, "u1", at) as any;
  assert.equal(noteOnly.$set.status, undefined, "a note doesn't change the status");
});

test("survival per row and field", () => {
  const s = survival([
    { row: 1, status: "alive", checkedAt: "2027-09-01" },
    { row: 1, status: "dead", cause: "voles", checkedAt: "2027-09-01" },
    { row: 1, status: "weak", cause: "drought" },
    { row: 2, status: "missing", cause: "deer", replanted: 1 },
    { row: 2, status: "alive", cause: "deer" },
  ]);
  assert.equal(s.field.total, 5);
  assert.equal(s.field.survivalPct, 60);
  assert.equal(s.field.mortalityPct, 40);
  assert.equal(s.field.checked, 2);
  assert.equal(s.field.replanted, 1);
  assert.deepEqual(s.field.causes, { voles: 1, drought: 1, deer: 1 }, "an alive tree's old cause isn't counted");
  assert.deepEqual(s.rows.map((r) => [r.row, r.survivalPct]), [[1, 66.7], [2, 50]]);
  assert.equal(survival([]).field.survivalPct, null);
});

test("nearest trees", () => {
  const trees = treesFromLayout(layout, names, "EL");
  const near = nearest(trees, lon0 + 1.1 * dx, lat0 + 0.1 * dy, 2);
  assert.equal(near[0].name, "ELR01T002");
  assert.ok(near[0].distanceM < 1.5);
  assert.equal(near.length, 2);
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
const json = { "content-type": "application/json" };

test("tree register access: making and removing registers is the Grove team's", async () => {
  who = { user: { _id: "000000000000000000000001", roles: ["grove-field"] }, idToken: { email_verified: true } };
  assert.equal((await fetch(`${base}/internal/projects/${id}/trees`, { method: "POST", headers: json, body: "{}" })).status, 403);
  assert.equal((await fetch(`${base}/internal/projects/${id}/trees/designs`)).status, 403);
  assert.equal((await fetch(`${base}/internal/projects/${id}/trees/${id}`, { method: "DELETE" })).status, 403);
  who = {};
  assert.equal((await fetch(`${base}/internal/projects/${id}/trees`)).status, 401);
  who = { user: { roles: [] }, idToken: { email_verified: true } };
  assert.equal((await fetch(`${base}/internal/projects/${id}/trees`)).status, 403);
});

test("tree register input is checked before the database", async () => {
  who = { user: { _id: "000000000000000000000001", roles: ["grove-field"] }, idToken: { email_verified: true } };
  assert.equal((await fetch(`${base}/internal/projects/nope/trees`)).status, 400);
  assert.equal((await fetch(`${base}/internal/projects/${id}/trees/${id}/trees/ELR01T001`, { method: "PUT", headers: json, body: JSON.stringify({ status: "zombie" }) })).status, 400);
  assert.equal((await fetch(`${base}/internal/projects/${id}/trees/${id}/rows/0`)).status, 400);
  assert.equal((await fetch(`${base}/internal/projects/${id}/trees/${id}/rows/1.5/checked`, { method: "PUT" })).status, 400);
  assert.equal((await fetch(`${base}/internal/projects/${id}/trees/${id}/near?lon=x&lat=56`)).status, 400);
});
