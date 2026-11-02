// A · Clients & deals: input cleaning, stage moves, card order, import
// mapping, and route access.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { DEFAULT_FUNNELS, cleanClient, cleanDeal, dealPlaceForProject, firstOpenStage, moveDeal, reorder, sameClient, searchPattern, stageOf } from "../src/internal/deals.ts";
import { cleanOfferUpdate } from "../src/internal/offers.ts";
import internalRoutes from "../src/routes/internal.ts";

const funnel = { _id: "f1", ...DEFAULT_FUNNELS[2], stages: [...DEFAULT_FUNNELS[2].stages] };
const other = { _id: "f2", ...DEFAULT_FUNNELS[3], stages: [...DEFAULT_FUNNELS[3].stages] };

test("default funnels: the four deal types, each with an open, a won and a lost stage, unique keys", () => {
  assert.deepEqual(DEFAULT_FUNNELS.map((f) => f.name), ["Design clients", "Tree sales", "Project development", "Management clients"]);
  for (const f of DEFAULT_FUNNELS) {
    for (const kind of ["open", "won", "lost"]) assert.ok(f.stages.some((s) => s.kind === kind), `${f.key} ${kind}`);
    assert.equal(new Set(f.stages.map((s) => s.key)).size, f.stages.length, f.key);
    assert.equal(firstOpenStage(f as any)?.key, "lead");
  }
});

test("deal input: title required on create; funnel, stage, status, position and history can't be set by an edit", () => {
  assert.equal(cleanDeal({}, { creating: true }).ok, false);
  const ok = cleanDeal({ title: " Brian ", value: "192500.4", stage: "won", status: "won", position: 1, history: [], funnel: "x", createdBy: "y" }, { creating: true }) as any;
  assert.ok(ok.ok);
  assert.deepEqual(Object.keys(ok.value).sort(), ["title", "value"]);
  assert.equal(ok.value.value, 192500);
  assert.equal(cleanDeal({ value: -1 }).ok, false);
  assert.equal(cleanDeal({ client: { $ne: null } }).ok, false);
  assert.equal(cleanDeal({ client: null }).ok, false, "a deal always has a client");
  assert.equal(cleanDeal({ farm: "" }).ok && (cleanDeal({ farm: "" }) as any).value.farm, null);
  assert.equal(cleanDeal({ nextAction: { date: "nope" } }).ok, false);
  assert.deepEqual((cleanDeal({ nextAction: { text: "Call" } }) as any).value.nextAction, { text: "Call" });
  assert.equal(cleanDeal({ archived: "yes" }).ok, false);
});

test("client input: name required; only known fields", () => {
  assert.equal(cleanClient({ name: " " }, { creating: true }).ok, false);
  const c = cleanClient({ name: "Andersen", kind: "company", email: "a@b.dk", isAdmin: true }, { creating: true }) as any;
  assert.deepEqual(c.value, { name: "Andersen", kind: "company", email: "a@b.dk" });
  assert.equal(cleanClient({ kind: "robot" }).ok, false);
  assert.equal(cleanClient({ email: { $gt: "" } }).ok, false);
});

test("moving a deal: status follows the stage kind; won/lost dates set and cleared; history kept", () => {
  const now = new Date("2026-11-02T08:00:00Z");
  const deal = { funnel: "f1", stage: "lead", status: "open", history: [] as any[] };
  const toOffer = moveDeal(deal, funnel, "offer", { now })!;
  assert.equal(toOffer.patch.status, "open");
  assert.equal(toOffer.wonNow, false);
  assert.equal(toOffer.patch.history.length, 1);
  const toWon = moveDeal({ ...deal, ...toOffer.patch }, funnel, "won", { now })!;
  assert.equal(toWon.wonNow, true);
  assert.equal(toWon.patch.wonAt, now);
  assert.equal(toWon.patch.lostAt, null);
  const toLost = moveDeal({ ...deal, ...toWon.patch }, funnel, "lost", { now, lostReason: "  price  " })!;
  assert.equal(toLost.patch.lostReason, "price");
  assert.equal(toLost.patch.wonAt, null);
  const reopened = moveDeal({ ...deal, ...toLost.patch }, funnel, "lead", { now })!;
  assert.equal(reopened.patch.status, "open");
  assert.equal(reopened.patch.lostReason, "");
  assert.equal(reopened.patch.lostAt, null);
  assert.equal(moveDeal(deal, funnel, "nope"), null);
  assert.equal(moveDeal(deal, funnel, { $ne: 1 }), null);
  // same stage: no history entry; another funnel's stage of the same key: a move
  assert.equal(moveDeal(deal, funnel, "lead")!.changed, false);
  assert.equal(moveDeal(deal, other, "lead")!.changed, true);
  assert.equal(moveDeal({ ...deal, history: Array(250).fill({}) }, funnel, "offer")!.patch.history.length, 200);
});

test("card order: in front of the card it was dropped on, else at the end", () => {
  assert.deepEqual(reorder(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(reorder(["a", "b", "c"], "a", "c"), ["b", "a", "c"]);
  assert.deepEqual(reorder(["a", "b"], "x", null), ["a", "b", "x"]);
  assert.deepEqual(reorder(["a", "b"], "x", "gone"), ["a", "b", "x"]);
  assert.deepEqual(reorder(["a", "b"], "a", "a"), ["b", "a"]);
});

test("Dashboard import: type picks the funnel, stage maps to a stage that exists there", () => {
  for (const p of [
    { type: "client", stage: "prospect" },
    { type: "client", stage: "design-offer" },
    { type: "tree-sale", stage: "design-offer" },
    { type: "own", stage: "management" },
    { type: "client", stage: "closed" },
  ]) {
    const place = dealPlaceForProject(p);
    const f = DEFAULT_FUNNELS.find((x) => x.key === place.funnel)!;
    const s = stageOf(f as any, place.stage);
    assert.ok(s, `${p.type}/${p.stage} → ${place.funnel}/${place.stage}`);
    assert.equal(s!.kind, place.status);
  }
  assert.equal(dealPlaceForProject({ type: "tree-sale", stage: "prospect" }).funnel, "tree-sales");
  assert.equal(dealPlaceForProject({ type: "client", stage: "economics" }).status, "open");
  assert.equal(dealPlaceForProject({ type: "client", stage: "planting" }).status, "won");
  assert.equal(dealPlaceForProject({ type: "client", stage: "signed" }).status, "won");
});

test("import: a same-named client is reused only if the contact details don't contradict", () => {
  assert.equal(sameClient({ email: "a@x.dk" }, { email: "A@x.dk " }), true);
  assert.equal(sameClient({ email: "a@x.dk" }, { email: "b@x.dk" }), false, "two Jens Hansens");
  assert.equal(sameClient({ phone: "+45 20 30 40 50" }, { phone: "4520304050" }), true);
  assert.equal(sameClient({ phone: "20304050" }, { phone: "20304051" }), false);
  assert.equal(sameClient({}, { email: "a@x.dk" }), true, "nothing to contradict");
});

test("offers: the deal link takes an id or null, nothing else", () => {
  assert.equal((cleanOfferUpdate({ deal: "0123456789abcdef01234567" }) as any).value.deal, "0123456789abcdef01234567");
  assert.equal((cleanOfferUpdate({ deal: "" }) as any).value.deal, null);
  assert.equal(cleanOfferUpdate({ deal: { $ne: null } }).ok, false);
  assert.equal(cleanOfferUpdate({ deal: "nope" }).ok, false);
});

test("client search: text is matched literally", () => {
  assert.ok(searchPattern("a.b").test("A.B farm"));
  assert.ok(!searchPattern("a.b").test("axb"));
  assert.ok(searchPattern("(").test("x (y)"));
});

// Routes: only grove-team; field users, public users and anonymous refused.
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

test("deal, client and funnel routes: anonymous 401, public and field users 403", async () => {
  const id = "000000000000000000000002";
  const routes = [
    ["GET", "/internal/funnels"],
    ["GET", "/internal/deals/options"],
    ["GET", "/internal/deals?funnel=" + id],
    ["POST", "/internal/deals"],
    ["GET", `/internal/deals/${id}`],
    ["PUT", `/internal/deals/${id}`],
    ["POST", `/internal/deals/${id}/move`],
    ["POST", `/internal/deals/${id}/handover`],
    ["POST", "/internal/deals/import-dashboard"],
    ["DELETE", `/internal/deals/${id}`],
    ["DELETE", `/internal/clients/${id}`],
    ["GET", "/internal/clients"],
    ["POST", "/internal/clients"],
    ["GET", `/internal/clients/${id}`],
    ["PUT", `/internal/clients/${id}`],
  ];
  for (const [user, status] of [
    [undefined, 401],
    [{ roles: [] }, 403],
    [{ _id: "000000000000000000000001", roles: ["grove-field"] }, 403],
  ] as const) {
    who = user ? { user, idToken: verified } : {};
    for (const [method, path] of routes) {
      const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
      assert.equal(r.status, status, `${method} ${path} as ${JSON.stringify(user)}`);
    }
  }
});

test("bad ids are refused before any database call", async () => {
  who = { user: { _id: "000000000000000000000001", roles: ["grove-team"] }, idToken: verified };
  for (const [method, path] of [
    ["GET", "/internal/deals/nope"],
    ["PUT", "/internal/deals/nope"],
    ["POST", "/internal/deals/nope/move"],
    ["POST", "/internal/deals/nope/handover"],
    ["GET", "/internal/clients/nope"],
    ["DELETE", "/internal/deals/nope"],
    ["DELETE", "/internal/clients/nope"],
    ["PUT", "/internal/clients/nope"],
    ["GET", "/internal/deals?funnel=nope"],
  ]) {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
    assert.equal(r.status, 400, `${method} ${path}`);
  }
});
