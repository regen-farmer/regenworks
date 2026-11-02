// Forward orders: season, demand per species, supply balance, deposit invoice. Made-up numbers.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { cleanSupplyPlan, forwardDemand, seasonLabel, seasonOf, speciesKey, supplyBalance } from "../src/internal/supply.ts";
import { cleanOfferUpdate, depositInvoice, offerTotals } from "../src/internal/offers.ts";
import internalRoutes from "../src/routes/internal.ts";

const hazel = (qty: number, cultivar?: string, over: Record<string, unknown> = {}) => ({
  latin: "Corylus avellana",
  nameDa: "Hassel",
  cultivar,
  rootstock: "Corylus colurna",
  propagation: "grafted",
  organic: false,
  form: "bare-root",
  years: "1+1",
  qty,
  unitPrice: 100,
  priceSource: "sales" as const,
  ...over,
});
const corabelPlan = { latin: "Corylus avellana", cultivar: "Corabel", rootstock: "Corylus colurna", propagation: "grafted", organic: false, form: "bare-root" };

test("demand per exact product: only forward orders; accepted = signed, sent/draft = likely, declined left out", () => {
  const terms = { forwardOrder: true, deliveryDate: "2027-10-01" };
  const d = forwardDemand([
    { status: "accepted", terms, lines: [hazel(1000, "Corabel"), hazel(500, "Tonda"), { kind: "service", qty: 2, unitPrice: 1, priceSource: "manual" }] },
    { status: "sent", terms, lines: [hazel(300, "Corabel")] },
    { status: "declined", terms, lines: [hazel(9999, "Corabel")] },
    { status: "accepted", terms: { deliveryDate: "2027-10-01" }, lines: [hazel(7777, "Corabel")] },
    { status: "accepted", terms, lines: [hazel(50, "Corabel", { rootstock: "Corylus avellana" })] },
  ] as any[]);
  const corabel = d.find((x) => x.spec.cultivar === "Corabel" && x.spec.rootstock === "Corylus colurna")!;
  assert.equal(corabel.signed, 1000);
  assert.equal(corabel.likely, 300);
  assert.equal(d.length, 3, "Corabel on colurna, Tonda, Corabel on avellana: three products");
  assert.deepEqual(corabel.missing, []);
  const loose = forwardDemand([{ status: "accepted", terms, lines: [{ latin: "Corylus avellana", qty: 10, unitPrice: 1, priceSource: "sales" }] }] as any[]);
  assert.deepEqual(loose[0].missing, ["propagation", "organic", "bare root/container", "years"]);
});

test("balance: exact product only, own production x take % + suppliers; species totals show spare plants", () => {
  const terms = { forwardOrder: true, deliveryDate: "2027-10-01" };
  const plan = (cleanSupplyPlan({
    rows: [
      { ...corabelPlan, season: "autumn 2027", ownGrafts: 1000, takePct: 70, suppliers: [{ name: "X", qty: 500 }] },
      { ...corabelPlan, rootstock: "Corylus avellana", season: "Efterår 2027", suppliers: [{ name: "Y", qty: 400 }] },
    ],
  }) as any).value;
  assert.equal(plan[0].years, "1+1", "grafted: 1+1 unless stated");
  const r = supplyBalance(
    [
      { status: "accepted", terms, lines: [hazel(1000, "Corabel")] },
      { status: "draft", terms, lines: [hazel(800, "Corabel")] },
      { status: "accepted", terms, lines: [hazel(500, "Corabel", { rootstock: "Corylus avellana" })] },
    ] as any[],
    plan,
  );
  const colurna = r.rows.find((x) => x.spec.rootstock === "Corylus colurna")!;
  assert.equal(colurna.ownExpected, 700);
  assert.equal(colurna.available, 1200);
  assert.equal(colurna.afterSigned, 200);
  assert.equal(colurna.afterLikely, -600);
  const avellana = r.rows.find((x) => x.spec.rootstock === "Corylus avellana")!;
  assert.equal(avellana.afterSigned, -100, "plants on colurna don't cover an order for plants on avellana");
  assert.equal(r.species.length, 1);
  assert.deepEqual([r.species[0].available, r.species[0].signed, r.species[0].afterSigned], [1600, 1500, 100]);
});

test("balance: a plan typed in another case or language matches the offers", () => {
  const rows = supplyBalance(
    [
      { status: "accepted", terms: { forwardOrder: true, deliveryDate: "2027-10-01" }, lines: [hazel(100, "Corabel")] },
      { status: "accepted", terms: { forwardOrder: true, deliverySeason: "Efterår 2027" }, lines: [hazel(50, "corabel")] },
    ] as any[],
    (cleanSupplyPlan({ rows: [{ ...corabelPlan, latin: "corylus avellana", cultivar: "CORABEL", rootstock: "corylus colurna seedling", season: "autumn 2027", suppliers: [{ name: "X", qty: 500 }] }] }) as any).value,
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].signed, 150);
  assert.equal(rows[0].afterSigned, 350);
  assert.equal(rows[0].planned, true);
});


test("season: from the delivery date (Danish day), else the season text", () => {
  assert.equal(seasonOf({ deliveryDate: "2027-10-15T12:00:00Z" }), "Autumn 2027");
  assert.equal(seasonOf({ deliveryDate: "2027-03-01T12:00:00Z" }), "Spring 2027");
  assert.equal(seasonOf({ deliveryDate: "2027-06-30T22:30:00Z" }), "Autumn 2027", "1 Jul in Denmark");
  assert.equal(seasonOf({ deliverySeason: " Efterår 2027 " }), "Autumn 2027", "Danish text lines up with dated offers");
  assert.equal(seasonOf({ deliverySeason: "forår 28" }), "Spring 2028");
  assert.equal(seasonOf({ deliverySeason: "next year sometime" }), "next year sometime", "unreadable text kept as typed");
  assert.equal(seasonOf({}), "No season set");
});

test("season labels and species keys", () => {
  assert.equal(seasonLabel("autumn 2027"), "Autumn 2027");
  assert.equal(seasonLabel("HØST 2027"), "Autumn 2027");
  assert.equal(seasonLabel("Efteraar 2027"), "Autumn 2027");
  assert.equal(seasonLabel("Spring 2027"), "Spring 2027");
  assert.equal(seasonLabel("2027"), undefined);
  assert.equal(seasonLabel("Autumn"), undefined);
  assert.equal(speciesKey("Malus x domestica 'Ingrid Marie'"), "malus domestica");
  assert.equal(speciesKey("Malus × domestica"), "malus domestica");
});

test("supply plan input", () => {
  const dup = cleanSupplyPlan({ rows: [{ latin: "Corylus avellana", season: "Autumn 2027" }, { latin: "Corylus avellana 'Tonda'", season: "efterår 2027" }] });
  assert.equal(dup.ok, false, "one row per species and season, so nothing is silently dropped");
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "a b", season: "soon" }] }).ok, false, "season must be readable");
  assert.ok(cleanSupplyPlan({ rows: [{ latin: "Corylus avellana", season: "Autumn 2027", ownGrafts: "1000", takePct: 70, suppliers: [{ name: "X", qty: 2000 }] }] }).ok);
  assert.ok(cleanSupplyPlan({ rows: [{ ...corabelPlan, season: "Autumn 2027" }, { ...corabelPlan, years: "2+0", season: "Autumn 2027" }] }).ok, "1+1 and 2+0 are two products");
  const seedling = (cleanSupplyPlan({ rows: [{ latin: "Corylus colurna", propagation: "seedling", rootstock: "x", season: "Autumn 2027" }] }) as any).value[0];
  assert.deepEqual([seedling.years, seedling.rootstock], ["1", undefined], "seedlings: 1 year, no rootstock");
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "a b", season: "Autumn 2027", years: "old" }] }).ok, false);
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "a b", season: "Autumn 2027", form: "bag" }] }).ok, false);
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "a b", season: "Autumn 2027", suppliers: [{ name: "X", qty: 1.5 }] }] }).ok, false);
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "", season: "Autumn 2027" }] }).ok, false);
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "a", season: "Autumn 2027", takePct: 120 }] }).ok, false);
  assert.equal(cleanSupplyPlan({ rows: [{ latin: "a", season: "Autumn 2027", suppliers: [{ name: "X", qty: { $gt: 0 } }] }] }).ok, false);
  assert.equal(cleanSupplyPlan({}).ok, false);
});

test("deposit invoice: the deposit % of the net, plus VAT", () => {
  const inv = depositInvoice({ lines: [hazel(100)], terms: { forwardOrder: true }, dineroNumber: "512" });
  assert.deepEqual(inv, { pct: 20, text: "Depositum 20 % af tilbud nr. 512", net: 2000, vat: 500, total: 2500 });
});

test("deposit invoice: total matches the deposit shown elsewhere, to the øre", () => {
  for (const o of [
    { lines: [{ ...hazel(1), unitPrice: 333.33 }], terms: { depositPct: 20 } },
    { lines: [{ ...hazel(7), unitPrice: 123.45, discountPct: 3 }], discountPct: 2.5, terms: { depositPct: 33 } },
    { lines: [{ ...hazel(13), unitPrice: 99.99 }], terms: { forwardOrder: true } },
  ] as any[]) {
    const inv = depositInvoice(o);
    assert.equal(inv.total, offerTotals(o).deposit.amount);
    assert.equal(Math.round((inv.net + inv.vat) * 100), Math.round(inv.total * 100));
  }
});

test("offer update keeps the later-delivery clause, trimmed and capped", () => {
  const r: any = cleanOfferUpdate({ terms: { forwardOrder: true, forwardOrderText: "  Senere levering.  " } });
  assert.ok(r.ok);
  assert.equal(r.value.terms.forwardOrderText, "Senere levering.");
  assert.equal((cleanOfferUpdate({ terms: { forwardOrderText: "x".repeat(5000) } }) as any).value.terms.forwardOrderText.length, 3000);
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

test("orders without form, years or organic still count against the planned product (flagged); ambiguous ones don't", () => {
  const terms = { forwardOrder: true, deliveryDate: "2027-10-01" };
  // an accepted line from before products were specified
  const old = { latin: "Corylus avellana", cultivar: "Corabel", rootstock: "Corylus colurna", propagation: "grafted", qty: 1000, unitPrice: 130, priceSource: "sales" };
  const plan = (cleanSupplyPlan({ rows: [{ ...corabelPlan, organic: undefined, season: "Autumn 2027", suppliers: [{ name: "X", qty: 2000 }] }] }) as any).value;
  const r = supplyBalance([{ status: "accepted", terms, lines: [old] }] as any[], plan);
  assert.equal(r.rows.length, 1, "no false shortage next to a spare plan row");
  assert.equal(r.rows[0].signed, 1000);
  assert.equal(r.rows[0].afterSigned, 1000);
  assert.deepEqual(r.rows[0].missing.sort(), ["form", "years"], "organic isn't listed: the line says it, the plan row doesn't");
  // two planned products the old line could be: counted against neither
  const two = (cleanSupplyPlan({ rows: [{ ...corabelPlan, season: "Autumn 2027", suppliers: [{ name: "X", qty: 10 }] }, { ...corabelPlan, form: "container", season: "Autumn 2027" }] }) as any).value;
  const r2 = supplyBalance([{ status: "accepted", terms, lines: [old] }] as any[], two);
  const open = r2.rows.find((x) => !x.planned)!;
  assert.equal(open.candidates, 2);
  assert.equal(open.afterSigned, -1000);
  // an old-format plan row (species only) still loads, and says what it leaves open
  const legacy = supplyBalance([], [{ latin: "Corylus avellana", season: "Autumn 2027", ownGrafts: 1000, takePct: 70 } as any]);
  assert.deepEqual(legacy.rows[0].planMissing, ["propagation", "organic", "bare root/container", "years"]);
});

test("supply options: species with names and cultivars, rootstocks; non-plants and odd names left out", async () => {
  const { supplyOptions } = await import("../src/internal/supply.ts");
  const { cleanDeal } = await import("../src/internal/deals.ts");
  const o = supplyOptions([
    { latin: "Corylus avellana", commonNameDa: "Hassel", cultivar: "Corabel", rootstock: "Corylus colurna" },
    { latin: "Corylus avellana", cultivar: "Emmoa", rootstock: "corylus colurna" },
    { latin: "Castanea sativa x crenata", cultivar: "Bouche de Bétizac" },
    { latin: "Quercus", cultivar: "x" },
    { latin: "Brise Vent Griplast", unit: "roll" },
  ]);
  assert.deepEqual(o.species.map((s) => [s.latin, s.name, s.cultivars]), [
    ["Castanea sativa", undefined, ["Bouche de Bétizac"]],
    ["Corylus avellana", "Hassel", ["Corabel", "Emmoa"]],
  ]);
  assert.deepEqual(o.rootstocks, ["Corylus colurna"]);
  assert.equal((cleanDeal({ forwardOrder: true }) as any).value.forwardOrder, true);
  assert.equal(cleanDeal({ forwardOrder: "yes" }).ok, false);
});
