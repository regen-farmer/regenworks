// Scorecard: targets cleaning, margin vs deposits, period, pace. Made-up numbers.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { cleanTargets, scorecard } from "../src/internal/scorecard.ts";
import { offerTotals } from "../src/internal/offers.ts";
import internalRoutes from "../src/routes/internal.ts";

const line = (qty: number, unitPrice: number, cost: number) => ({ qty, unitPrice, priceSource: "sales" as const, pricing: { unitCostDkk: cost } });

test("accepted offers: accepted date and forward-order flag can be set for the scorecard", async () => {
  const { cleanOfferUpdate } = await import("../src/internal/offers.ts");
  const c = cleanOfferUpdate({ acceptedAt: "2026-08-15T12:00:00Z", scorecardForward: true }) as any;
  assert.ok(c.ok);
  assert.ok(c.value.acceptedAt instanceof Date);
  assert.equal(c.value.scorecardForward, true);
  assert.equal(cleanOfferUpdate({ acceptedAt: { $gt: 1 } }).ok, false);
  assert.equal(cleanOfferUpdate({ scorecardForward: "yes" }).ok, false);
});

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
    { status: "accepted", acceptedAt: "2026-11-15", lines: [line(1, 500, 0)] },
    // 00:30 on 1 Nov in Denmark is 31 Oct 23:30 UTC: in the period
    { status: "accepted", acceptedAt: "2026-10-31T23:30:00Z", lines: [line(1, 100, 0)] },
    // 01:00 on 1 May in Denmark (summer time) is 30 Apr 23:00 UTC: after the period
    { status: "accepted", acceptedAt: "2027-04-30T23:00:00Z", lines: [line(1, 100, 0)] },
  ];
  const c = scorecard({
    offers,
    openDeals: [{ value: 1000, funnelName: "Tree sales" }, { value: 500, funnelName: "Tree sales" }, { value: null, funnelName: "Design clients" }],
    targets: { from: "2026-11-01", to: "2027-04-30", margin: 100_000, deposits: 50_000 },
    now: new Date("2026-11-30T12:00:00Z"),
  });
  assert.equal(c.won.length, 4, "October's offer is outside, and so is 1 May; 1 Nov at 00:30 Danish time is inside");
  assert.equal(c.margin.actual, 4000 + 500 + 100);
  const fwdDeposit = offerTotals({ lines: [line(1000, 130, 90)], terms: { forwardOrder: true } }).deposit;
  assert.equal(fwdDeposit.pct, 20, "forward orders default to 20 %");
  assert.equal(c.deposits.actual, Math.round((fwdDeposit.amount / 1.25) * 100) / 100, "deposits excl. VAT, as in the sales plan");
  assert.equal(c.margin.gap, 95_400);
  assert.equal(c.weeksLeft, 22, "30 Nov to 30 Apr: 152 days");
  assert.equal(c.margin.perWeek, Math.round(95_400 / 22));
  assert.equal(c.margin.inSentOffers, 1500);
  assert.deepEqual(c.pipeline[0], { funnel: "Tree sales", count: 2, value: 1500, estMargin: 375, estDeposits: 0 });
  const none = scorecard({ offers, openDeals: [], targets: {} });
  assert.equal(none.margin.gap, null);
  assert.equal(none.deposits.gap, null);
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

test("scorecard counts won deals: margin/deposit from their accepted offers; no offer flagged; other offers still count", async () => {
  const c = scorecard({
    targets: { from: "2026-11-01", to: "2027-04-30" },
    openDeals: [],
    wonDeals: [
      { _id: "d1", title: "Spring 4 ha", wonAt: "2026-11-20T12:00:00Z", value: 99999 },
      { _id: "d2", title: "Hazel 2027", wonAt: "2026-11-21T12:00:00Z" },
      { _id: "d3", title: "Handshake", wonAt: "2026-11-22T12:00:00Z", value: 40000 },
      { _id: "d4", title: "Last season", wonAt: "2026-05-01T12:00:00Z" },
    ],
    offers: [
      // accepted before the deal was won (or long ago): counts by the deal's date
      { status: "accepted", deal: "d1", acceptedAt: "2026-10-30", lines: [line(100, 100, 60)] },
      { status: "accepted", deal: "d2", acceptedAt: "2026-11-21", lines: [line(1000, 130, 90)], terms: { forwardOrder: true } },
      { status: "accepted", deal: "d4", acceptedAt: "2026-11-25", lines: [line(10, 1000, 0)] },
      // no deal: counts on its own
      { status: "accepted", acceptedAt: "2026-11-23", lines: [line(10, 100, 50)] },
    ] as any[],
  });
  assert.equal(c.margin.actual, 4000 + 10000 + 500 + 10000, "d1 + d4 (won in May, offer accepted 25 Nov: counts now) + the plant-list offer + Handshake at the standard 25 %");
  const fwdDeposit = offerTotals({ lines: [line(1000, 130, 90)], terms: { forwardOrder: true } } as any).deposit.amount;
  assert.equal(c.deposits.actual, Math.round((fwdDeposit / 1.25) * 100) / 100);
  assert.deepEqual(c.withoutOffer, { count: 1, value: 40000, margin: 10000, deposits: 0 });
  assert.deepEqual(c.won.map((w) => [w.kind, w.title ?? "(offer)"]), [
    ["deal", "Last season"],
    ["offer", "(offer)"],
    ["deal", "Handshake"],
    ["deal", "Hazel 2027"],
    ["deal", "Spring 4 ha"],
  ]);
});

test("scorecard edge cases: mixed deal, offers on open/lost deals, missing wonAt, sent offers on closed deals, Danish midnight", () => {
  const c = scorecard({
    targets: { from: "2026-11-01", to: "2027-04-30" },
    openDeals: [],
    wonDeals: [
      { _id: "mix", title: "Mixed", wonAt: "2026-10-31T23:30:00Z" }, // 1 Nov in Denmark
      { _id: "nodate", title: "No date", updatedAt: "2026-11-05T12:00:00Z" },
    ],
    closedDealIds: ["mix", "nodate", "lostdeal"],
    offers: [
      { status: "accepted", deal: "mix", acceptedAt: "2026-11-02", lines: [line(100, 100, 60)] },
      { status: "accepted", deal: "mix", acceptedAt: "2026-11-02", lines: [line(100, 130, 90)], terms: { forwardOrder: true } },
      { status: "accepted", deal: "nodate", acceptedAt: "2026-11-05", lines: [line(10, 100, 50)] },
      { status: "accepted", deal: "opendeal", acceptedAt: "2026-11-06", lines: [line(10, 100, 80)] },
      { status: "sent", deal: "mix", lines: [line(1000, 100, 0)] },
      { status: "sent", deal: "lostdeal", lines: [line(1000, 100, 0)] },
      { status: "sent", deal: "opendeal", lines: [line(10, 100, 50)] },
    ] as any[],
  });
  const mix = c.won.find((w) => w.title === "Mixed")!;
  assert.equal(mix.margin, 4000);
  assert.ok(mix.deposit > 0);
  assert.equal(mix.forwardOrder, false);
  assert.equal(mix.acceptedOn, "2026-11-02");
  assert.equal(c.won.find((w) => w.title === "No date")?.margin, 500, "a won deal without wonAt keeps its offers");
  assert.equal(c.margin.actual, 4000 + 500 + 200, "offer on an open deal counts by its acceptance date");
  assert.equal(c.margin.inSentOffers, 500, "only the sent offer on the open deal");
});

test("won deals without an offer: standard margin (set in targets), forward-order deals a 20 % deposit", () => {
  const c = scorecard({
    targets: { from: "2026-11-01", to: "2027-04-30", standardMarginPct: 30 },
    openDeals: [{ value: 100000, funnelName: "Design clients" }, { value: 50000, funnelName: "Tree sales", forwardOrder: true }, { value: 60000, funnelName: "Management clients", management: true }],
    wonDeals: [
      { _id: "s", title: "Spring 4 ha", wonAt: "2026-11-20T12:00:00Z", value: 200000 },
      { _id: "f", title: "Hazel 2027", wonAt: "2026-11-21T12:00:00Z", value: 390000, forwardOrder: true },
      { _id: "m", title: "Care contract", wonAt: "2026-11-22T12:00:00Z", value: 120000, management: true },
      { _id: "a", title: "Hidden", wonAt: "2026-11-22T12:00:00Z", value: 999999, archived: true },
      // ticked forward order and has an accepted offer: the offer's deposit replaces the estimate
      { _id: "fo", title: "Hazel with offer", wonAt: "2026-11-23T12:00:00Z", value: 1, forwardOrder: true },
    ],
    closedDealIds: ["s", "f", "m", "a", "fo"],
    offers: [
      { status: "accepted", deal: "fo", acceptedAt: "2026-11-23", lines: [line(100, 125, 90)], terms: { forwardOrder: true } },
      { status: "sent", lines: [line(100, 125, 90)], terms: { forwardOrder: true } },
    ] as any[],
  });
  assert.equal(c.won.length, 3, "management (billed monthly) and hidden deals aren't estimated");
  assert.equal(c.won.find((w) => w.title === "Hazel with offer")!.deposit, 2500, "20 % of 12,500 excl. VAT, from the offer");
  assert.equal(c.deposits.inSentOffers, 2500, "sent forward-order deposits excl. VAT too");
  assert.equal(c.margin.actual, 60000);
  assert.equal(c.deposits.actual, 78000 + 2500, "20 % of 390,000, excl. VAT: the sales plan's figure");
  assert.equal(c.won.filter((w) => w.estimated).length, 2);
  assert.deepEqual(c.pipeline.map((p) => [p.funnel, p.estMargin, p.estDeposits]), [["Design clients", 30000, 0], ["Management clients", 0, 0], ["Tree sales", 0, 10000]]);
  assert.equal(cleanTargets({ standardMarginPct: 95 }).ok, false);
});

test("an accepted offer with no known cost counts at the standard margin (Kim's hazel)", () => {
  const c = scorecard({
    targets: { from: "2026-11-01", to: "2027-04-01" },
    openDeals: [],
    wonDeals: [{ _id: "kim", title: "1100 hasel på egen rod", wonAt: "2026-11-02T12:00:00Z", value: 72000 }],
    closedDealIds: ["kim"],
    offers: [{ status: "accepted", deal: "kim", acceptedAt: "2026-11-02", lines: [{ qty: 370, unitPrice: 60, priceSource: "manual" }] }] as any[],
  });
  assert.equal(c.margin.withoutCost, 22200);
  assert.equal(c.margin.actual, 5550, "25 % of 22,200 until the cost is known");
  assert.equal(c.margin.costEstimate, 5550);
});
