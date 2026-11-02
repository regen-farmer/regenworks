// Scorecard: targets cleaning, margin vs deposits, period, pace. Made-up numbers.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { cleanTargets, scorecard } from "../src/internal/scorecard.ts";
import { offerTotals } from "../src/internal/offers.ts";
import internalRoutes from "../src/routes/internal.ts";

const line = (qty: number, unitPrice: number, cost: number) => ({ qty, unitPrice, priceSource: "sales" as const, pricing: { unitCostDkk: cost } });

test("targets: only known fields; dates and amounts checked", () => {
  assert.deepEqual(cleanTargets({ label: " Spring ", from: "2026-11-01", to: "2027-04-30", margin: "1000", deposits: 500, extra: 1 }), {
    ok: true,
    value: { label: "Spring", from: "2026-11-01", to: "2027-04-30", margin: 1000, deposits: 500 },
  });
  assert.equal(cleanTargets({ from: "2027-05-01", to: "2027-04-30" }).ok, false);
  assert.equal(cleanTargets({ from: "1 May" }).ok, false);
  assert.equal(cleanTargets({ margin: -1 }).ok, false);
  assert.equal(cleanTargets({ margin: { $gt: 0 } }).ok, false);
  assert.deepEqual(cleanTargets({ margin: "" }), { ok: true, value: { margin: null } });
});

test("scorecard: spring deals count margin, forward orders count deposits; only accepted in the period", () => {
  const offers = [
    { status: "accepted", acceptedAt: "2026-11-10", lines: [line(100, 100, 60)], offerDate: "2026-11-01" },
    { status: "accepted", acceptedAt: "2026-11-12", lines: [line(1000, 130, 90)], offerDate: "2026-11-01", terms: { forwardOrder: true } },
    { status: "accepted", acceptedAt: "2026-10-01", lines: [line(10, 100, 50)] },
    { status: "sent", lines: [line(50, 100, 70)] },
    { status: "accepted", updatedAt: "2026-11-15", lines: [line(1, 500, 0)] },
  ];
  const c = scorecard({
    offers,
    openDeals: [{ value: 1000, funnelName: "Tree sales" }, { value: 500, funnelName: "Tree sales" }, { value: null, funnelName: "Design clients" }],
    targets: { from: "2026-11-01", to: "2027-04-30", margin: 100_000, deposits: 50_000 },
    now: new Date("2026-11-30T12:00:00Z"),
  });
  assert.equal(c.won.length, 3, "October's offer is outside the period; an old offer without acceptedAt uses its last change");
  assert.equal(c.margin.actual, 4000 + 500);
  const fwdDeposit = offerTotals({ lines: [line(1000, 130, 90)], terms: { forwardOrder: true } }).deposit;
  assert.equal(fwdDeposit.pct, 20, "forward orders default to 20 %");
  assert.equal(c.deposits.actual, fwdDeposit.amount);
  assert.equal(c.margin.gap, 95_500);
  assert.equal(c.weeksLeft, 22);
  assert.equal(c.margin.perWeek, Math.round(95_500 / 22));
  assert.equal(c.margin.inSentOffers, 1500);
  assert.deepEqual(c.pipeline[0], { funnel: "Tree sales", count: 2, value: 1500 });
  const none = scorecard({ offers, openDeals: [], targets: {} });
  assert.equal(none.margin.gap, null);
  assert.equal(none.total.target, null);
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

test("/internal/scorecard: grove-team only", async () => {
  for (const [user, status] of [
    [undefined, 401],
    [{ roles: [] }, 403],
    [{ _id: "000000000000000000000001", roles: ["grove-field"] }, 403],
  ] as const) {
    who = user ? { user, idToken: { email_verified: true } } : {};
    assert.equal((await fetch(`${base}/internal/scorecard`)).status, status);
    assert.equal((await fetch(`${base}/internal/scorecard/targets`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" })).status, status);
  }
  who = { user: { _id: "000000000000000000000001", roles: ["grove-team"] }, idToken: { email_verified: true } };
  assert.equal((await fetch(`${base}/internal/scorecard/targets`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ margin: -5 }) })).status, 400);
});
