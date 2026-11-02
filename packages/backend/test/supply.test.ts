// Forward orders: season, demand per species, supply balance, deposit invoice. Made-up numbers.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { cleanSupplyPlan, forwardDemand, seasonOf, supplyBalance } from "../src/internal/supply.ts";
import { depositInvoice } from "../src/internal/offers.ts";
import internalRoutes from "../src/routes/internal.ts";

const hazel = (qty: number, cultivar?: string) => ({ latin: "Corylus avellana", nameDa: "Hassel", cultivar, qty, unitPrice: 100, priceSource: "sales" as const });

test("season: from the delivery date (Danish day), else the season text", () => {
  assert.equal(seasonOf({ deliveryDate: "2027-10-15T12:00:00Z" }), "Autumn 2027");
  assert.equal(seasonOf({ deliveryDate: "2027-03-01T12:00:00Z" }), "Spring 2027");
  assert.equal(seasonOf({ deliveryDate: "2027-06-30T22:30:00Z" }), "Autumn 2027", "1 Jul in Denmark");
  assert.equal(seasonOf({ deliverySeason: " Efterår 2027 " }), "Efterår 2027");
  assert.equal(seasonOf({}), "No season set");
});

test("demand: only forward orders; accepted = signed, sent/draft = likely, declined left out; cultivars kept", () => {
  const terms = { forwardOrder: true, deliveryDate: "2027-10-01" };
  const d = forwardDemand([
    { status: "accepted", terms, lines: [hazel(1000, "A"), hazel(500, "B"), { kind: "service", qty: 2, unitPrice: 1, priceSource: "manual" }] },
    { status: "sent", terms, lines: [hazel(300, "A")] },
    { status: "declined", terms, lines: [hazel(9999)] },
    { status: "accepted", terms: { deliveryDate: "2027-10-01" }, lines: [hazel(7777)] },
  ]);
  assert.equal(d.length, 1);
  assert.equal(d[0].signed, 1500);
  assert.equal(d[0].likely, 300);
  assert.deepEqual(d[0].cultivars, [{ cultivar: "A", qty: 1300 }, { cultivar: "B", qty: 500 }]);
});

test("balance: own grafts x take % + suppliers, against signed and likely", () => {
  const terms = { forwardOrder: true, deliveryDate: "2027-10-01" };
  const rows = supplyBalance(
    [{ status: "accepted", terms, lines: [hazel(1000)] }, { status: "draft", terms, lines: [hazel(800)] }],
    [
      { latin: "Corylus avellana", season: "Autumn 2027", ownGrafts: 1000, takePct: 70, suppliers: [{ name: "X", qty: 500 }] },
      { latin: "Castanea sativa", season: "Autumn 2027", ownGrafts: 100, takePct: 50 },
    ],
  );
  const h = rows.find((r) => r.latin === "Corylus avellana")!;
  assert.equal(h.ownExpected, 700);
  assert.equal(h.available, 1200);
  assert.equal(h.afterSigned, 200);
  assert.equal(h.afterLikely, -600, "selling the likely orders needs 600 more plants");
  assert.equal(rows.find((r) => r.latin === "Castanea sativa")!.available, 50, "supply without orders shows too");
});

test("supply plan input", () => {
  assert.ok(cleanSupplyPlan({ rows: [{ latin: "Corylus avellana", season: "Autumn 2027", ownGrafts: "1000", takePct: 70, suppliers: [{ name: "X", qty: 2000 }] }] }).ok);
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "", season: "x" }] }).ok, false);
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "a", season: "b", takePct: 120 }] }).ok, false);
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "a", season: "b", suppliers: [{ name: "X", qty: { $gt: 0 } }] }] }).ok, false);
  assert.equal(cleanSupplyPlan({}).ok, false);
});

test("deposit invoice: the deposit % of the net, plus VAT", () => {
  const inv = depositInvoice({ lines: [hazel(100)], terms: { forwardOrder: true }, dineroNumber: "512" });
  assert.deepEqual(inv, { pct: 20, text: "Depositum 20 % af tilbud nr. 512", net: 2000, vat: 500, total: 2500 });
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

test("/internal/supply: grove-team only", async () => {
  for (const [user, status] of [
    [undefined, 401],
    [{ roles: [] }, 403],
    [{ _id: "000000000000000000000001", roles: ["grove-field"] }, 403],
  ] as const) {
    who = user ? { user, idToken: { email_verified: true } } : {};
    assert.equal((await fetch(`${base}/internal/supply`)).status, status);
    assert.equal((await fetch(`${base}/internal/supply/plan`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" })).status, status);
  }
});
