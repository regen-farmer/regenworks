// Offer v2: services, quantities from the design, deposit rule, margins.
// Test numbers are made up; Grove's real prices live in the private repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServices, depositPctFor, marginRange, priceService, roundServicePrice, serviceQty, type Service } from "../src/internal/services.ts";
import { buildPricebook } from "../src/internal/pricebook.ts";
import { cleanOfferUpdate, dineroLines, lineMargin, mergeLines, offerMargin, offerTotals, priceLine, purchaseList } from "../src/internal/offers.ts";
import { designQuantities } from "../src/internal/designQuantities.ts";

const header = "service_id,section,name_da,unit_da,basis,qty_per_basis,round_up,price_excl_vat,cost_low,cost_likely,cost_high,supplier_price_id,supplier_qty,target_margin_pct";
const csvRows = (rows: string[]) => {
  const [h, ...r] = [header, ...rows].map((l) => l.split(","));
  return r.map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? ""])));
};

test("services.csv: sections, bases and numbers are checked; unknown supplier rows refused", () => {
  const ok = buildServices(csvRows(["plant,planting,Plantning,ha,tree_ha,1,,100,,,,,,", "net,protection,Trænet,stk.,tree,1,,,,,,p1,,40"]), new Set(["p1"]));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.services[0].basis, "tree_ha");
  assert.equal(buildServices(csvRows(["x,garden,X,stk.,tree,1,,,,,,,,"]), new Set()).errors.length, 1);
  assert.equal(buildServices(csvRows(["x,planting,X,stk.,acre,1,,,,,,,,"]), new Set()).errors.length, 1);
  assert.equal(buildServices(csvRows(["x,planting,X,stk.,tree,0,,,,,,,,"]), new Set()).errors.length, 1);
  assert.equal(buildServices(csvRows(["x,planting,X,stk.,tree,1,,-5,,,,,,"]), new Set()).errors.length, 1);
  assert.equal(buildServices(csvRows(["x,planting,X,stk.,tree,1,,,,,,nope,,"]), new Set()).errors.length, 1);
  assert.equal(buildServices(csvRows(["x,planting,X,stk.,tree,1,,,,,,,,", "x,planting,X,stk.,tree,1,,,,,,,,"]), new Set()).errors.length, 1, "duplicate id");
  assert.match(buildServices(csvRows(["x,planting,X,stk.,tree,1,,,,,,,,"]), new Set()).warnings[0], /no price/);
});

test("quantities: per tree, per metre, per hectare, fixed; whole units round up", () => {
  const q = { trees: 1250, rows: 12, rowM: 2400.4, perimeterM: 1530, fieldHa: 9.93, treeHa: 2.5 };
  assert.equal(serviceQty({ basis: "tree", qtyPerBasis: 1, roundUp: false }, q), 1250);
  assert.equal(serviceQty({ basis: "tree", qtyPerBasis: 0.01, roundUp: true }, q), 13, "100-tree sets");
  assert.equal(serviceQty({ basis: "perimeter_m", qtyPerBasis: 1.05, roundUp: false }, q), 1607);
  assert.equal(serviceQty({ basis: "tree_ha", qtyPerBasis: 1, roundUp: false }, q), 2.5);
  assert.equal(serviceQty({ basis: "row", qtyPerBasis: 2, roundUp: false }, q), 24);
  assert.equal(serviceQty({ basis: "fixed", qtyPerBasis: 1, roundUp: false }, q), 1);
  assert.equal(serviceQty({ basis: "row_m", qtyPerBasis: 1, roundUp: false }, {}), 0, "unknown quantity");
});

test("service price: listed price, else cost + target margin; supplier rows in EUR converted", () => {
  const base: Service = { serviceId: "s", section: "protection", nameDa: "Net", unitDa: "stk.", basis: "tree", qtyPerBasis: 1, roundUp: false };
  assert.equal(priceService({ ...base, priceExclVat: 123 }, { eurDkk: 7, supplierPrices: [] })!.unitPrice, 123);
  const fromCost = priceService({ ...base, costLow: 80, costLikely: 100, costHigh: 130 }, { eurDkk: 7, supplierPrices: [], defaultMarginPct: 40 })!;
  assert.equal(fromCost.unitPrice, 140);
  assert.equal(fromCost.singleSource, false);
  const sup = [{ priceId: "p1", docId: "d", supplierId: "x", latin: "", organicStatus: "", price: 2, currency: "EUR" }];
  const fromSupplier = priceService({ ...base, supplierPriceId: "p1", supplierQty: 3 }, { eurDkk: 7, supplierPrices: sup, defaultMarginPct: 50 })!;
  assert.equal(fromSupplier.unitCostDkk, 42);
  assert.equal(fromSupplier.unitPrice, 65, "42 x 1.5 = 63 -> nearest 5 kr");
  assert.equal(fromSupplier.singleSource, true);
  assert.equal(priceService(base, { eurDkk: 7, supplierPrices: [] }), null, "nothing known");
  assert.equal(roundServicePrice(6.2), 6);
  assert.equal(roundServicePrice(6.3), 6.5);
  assert.equal(roundServicePrice(62), 60);
});

test("deposit rule: 50 % if delivery is within 3 months of the offer, else 20 %", () => {
  const offer = new Date("2026-11-02T12:00:00Z");
  assert.equal(depositPctFor(offer, new Date("2027-02-01T12:00:00Z")), 50);
  assert.equal(depositPctFor(offer, new Date("2027-02-02T12:00:00Z")), 50, "exactly 3 months");
  assert.equal(depositPctFor(offer, new Date("2027-02-03T12:00:00Z")), 20);
  assert.equal(depositPctFor(offer, null), 50, "no date yet: the short-delivery rule");
  const totals = offerTotals({ lines: [{ qty: 10, unitPrice: 100, priceSource: "manual" }], offerDate: offer, terms: { deliveryDate: "2027-09-01" } });
  assert.deepEqual(totals.deposit, { pct: 20, fromRule: true, amount: 250 });
  const set = offerTotals({ lines: [{ qty: 10, unitPrice: 100, priceSource: "manual" }], offerDate: offer, terms: { depositPct: 30 } });
  assert.deepEqual(set.deposit, { pct: 30, fromRule: false, amount: 375 });
});

const pbFiles = {
  suppliers: "supplier_id,name\nx,X",
  documents: "doc_id,supplier_id,document_date\nd,x,2026-01-01",
  supplierPrices: "price_id,doc_id,supplier_id,latin,cultivar,rootstock,organic_status,price,currency,unit\np1,d,x,,,,not-organic,2,EUR,item",
  salesPrices: "sales_price_id,latin,cultivar,rootstock,organic_status,price_excl_vat,currency\ns1,Corylus avellana,,,not-organic,100,DKK",
  settings: "key,value\ndefault_margin_pct,30\neur_dkk,7\ntarget_margin_trees,20\ntarget_margin_services,50\nguarantee_text_da,Plantegaranti (test)",
  services: `${header}\nplant,planting,Plantning,ha,tree_ha,1,,1000,,600,,,,\nnet,protection,Trænet,stk.,tree,1,,,,,,p1,,\nnoprice,staking,Afsætning,stk.,row,1,,,,,,,,`,
};

test("pricebook import: services.csv and the new settings are read; services.csv is optional", () => {
  const b = buildPricebook(pbFiles);
  assert.ok(b.ok);
  if (!b.ok) return;
  assert.equal(b.data.services?.length, 3);
  assert.deepEqual(b.data.settings, { defaultMarginPct: 30, eurDkk: 7, targetMarginTrees: 20, targetMarginServices: 50, guaranteeTextDa: "Plantegaranti (test)" });
  const without = buildPricebook({ ...pbFiles, services: undefined });
  assert.ok(without.ok && without.data.services?.length === 0);
  const bad = buildPricebook({ ...pbFiles, services: "service_id,name_da\nx,X" });
  assert.ok(!bad.ok && /missing column/.test(bad.errors[0]));
});

test("service lines on an offer: priced, in totals and Dinero, not in the nursery order", () => {
  const b = buildPricebook(pbFiles);
  assert.ok(b.ok);
  if (!b.ok) return;
  const rates = { marginPct: 30, eurDkk: 7 };
  const planting = priceLine({ kind: "service", serviceId: "plant", qty: 2.5, unitPrice: 0, priceSource: "none" }, b.data, rates);
  assert.equal(planting.unitPrice, 1000);
  assert.equal(planting.nameDa, "Plantning");
  assert.equal(planting.unitDa, "ha");
  const net = priceLine({ kind: "service", serviceId: "net", qty: 100, unitPrice: 0, priceSource: "none" }, b.data, rates);
  assert.equal(net.unitPrice, 21, "2 EUR x 7 = 14 kr cost + 50 % services target");
  assert.equal(net.priceSource, "cost+margin");
  const none = priceLine({ kind: "service", serviceId: "noprice", qty: 4, unitPrice: 0, priceSource: "none" }, b.data, rates);
  assert.equal(none.priceSource, "none");
  const gone = priceLine({ kind: "service", serviceId: "old", qty: 1, unitPrice: 500, priceSource: "sales" }, b.data, rates);
  assert.equal(gone.unitPrice, 500);
  assert.equal(gone.pricing?.stale, true);
  const custom = priceLine({ kind: "service", nameDa: "Transport", unitDa: "tur", qty: 1, unitPrice: 800, priceSource: "manual" }, b.data, rates);
  assert.equal(custom.unitPrice, 800);
  const hazel = priceLine({ latin: "Corylus avellana", qty: 100, unitPrice: 0, priceSource: "none" }, b.data, rates);
  assert.equal(hazel.pricing?.targetMarginPct, 20, "plants carry the tree target");

  const offer = { lines: [hazel, planting, net], discountPct: 0 };
  const t = offerTotals(offer);
  assert.equal(t.plants, 10000);
  assert.equal(t.services, 2500 + 2100);
  const dinero = dineroLines(offer);
  assert.ok(dinero.some((d) => d.text === "Plantning: 2,5 ha" && d.amount === 2500));
  assert.ok(dinero.some((d) => d.text === "Trænet: 100 stk."));
  assert.equal(purchaseList(offer).flatMap((s) => s.lines).length, 1, "only the plants");
  assert.deepEqual(marginRange(1000, 0, { likely: 600 }), { likely: 40, worst: 40, best: 40 });
  const m = lineMargin(planting)!;
  assert.equal(m.marginPct, 40);
  assert.equal(m.belowTarget, true, "40 % against a 50 % services target");
  const om = offerMargin({ lines: [planting], discountPct: 10 });
  assert.equal(om.sale, 2250);
  assert.equal(om.margin, 750);
});

test("editing: old plant lines (no kind) aren't repriced; changing the service is", () => {
  const stored = [
    { _id: "a", latin: "Corylus avellana", qty: 10, unitPrice: 100, priceSource: "sales", pricing: { x: 1 } },
    { _id: "b", kind: "service", serviceId: "plant", qty: 1, unitPrice: 1000, priceSource: "sales", pricing: { y: 1 } },
  ];
  const m = mergeLines(stored, [
    { _id: "a", kind: "plant", latin: "Corylus avellana", qty: 12, unitPrice: 100, priceSource: "sales" },
    { _id: "b", kind: "service", serviceId: "net", qty: 1, unitPrice: 1000, priceSource: "sales" },
  ]);
  assert.equal(m[0].priceSource, "sales");
  assert.deepEqual(m[0].pricing, { x: 1 });
  assert.equal(m[1].priceSource, "none", "another service: priced again");
});

test("input: service lines and terms are cleaned", () => {
  const c = cleanOfferUpdate({
    lines: [{ kind: "service", serviceId: "plant", section: "planting", unitDa: "ha", qty: 2.5, unitPrice: 0, latin: "x" }],
    terms: { deliveryDate: "2027-03-01", depositPct: "", guarantee: true, guaranteeText: "  G  " },
  }) as any;
  assert.ok(c.ok);
  assert.equal(c.value.lines[0].kind, "service");
  assert.equal(c.value.lines[0].latin, undefined);
  assert.equal(c.value.terms.depositPct, null);
  assert.equal(c.value.terms.guaranteeText, "G");
  assert.ok(c.value.terms.deliveryDate instanceof Date);
  assert.equal(cleanOfferUpdate({ lines: [{ kind: "service", qty: 1, unitPrice: 0 }] }).ok, false, "needs a service or a name");
  assert.equal(cleanOfferUpdate({ terms: { depositPct: 120 } }).ok, false);
  assert.equal(cleanOfferUpdate({ terms: { deliveryDate: { $gt: 1 } } }).ok, false);
  assert.equal((cleanOfferUpdate({ lines: [{ kind: "service", serviceId: "p", section: "garden", qty: 1, unitPrice: 0 }] }) as any).value.lines[0].section, undefined);
});

test("design quantities: rows, boundary and areas from geometry", () => {
  // a ~100 x 100 m square near Odense, two 100 m rows, one 2,000 m2 strip
  const lat = 55.4;
  const dLat = 100 / 111_320;
  const dLng = 100 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const sq = { type: "Polygon", coordinates: [[[10, lat], [10 + dLng, lat], [10 + dLng, lat + dLat], [10, lat + dLat], [10, lat]]] };
  const row = (y: number) => ({ line: { geometry: { coordinates: [[10, y], [10 + dLng, y]] } } });
  const q = designQuantities({ treeRowLines: [row(lat + dLat / 3), row(lat + (2 * dLat) / 3)], plantCountArray: [{ count: 30 }, { count: 20 }], stripAreasM2: [2000] }, JSON.stringify(sq));
  assert.equal(q.trees, 50);
  assert.equal(q.rows, 2);
  assert.ok(Math.abs(q.rowM - 200) <= 2, `rowM ${q.rowM}`);
  assert.ok(Math.abs(q.perimeterM - 400) <= 4, `perimeter ${q.perimeterM}`);
  assert.ok(Math.abs(q.fieldHa - 1) <= 0.02, `field ${q.fieldHa}`);
  assert.equal(q.treeHa, 0.2);
  assert.equal(designQuantities({}, "not json").fieldHa, 0);
});
