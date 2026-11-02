// Offer sheet: totals, VAT, discounts, dispensation, Dinero lines, input cleaning.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanOfferUpdate,
  defaultValidUntil,
  dineroLines,
  DISPENSATION_TEXT,
  lineMargin,
  needsDispensation,
  offerTotals,
  priceLine,
  purchaseList,
} from "../src/internal/offers.ts";

const line = (o: any) => ({ qty: 0, unitPrice: 0, priceSource: "manual", discountPct: 0, ...o });

test("totals: line discount, offer discount, 25 % VAT", () => {
  const t = offerTotals({
    discountPct: 10,
    lines: [line({ qty: 100, unitPrice: 120, discountPct: 5 }), line({ qty: 3, unitPrice: 300 })],
  });
  assert.equal(t.subtotal, 100 * 120 * 0.95 + 900); // 12300
  assert.equal(t.discount, 1230);
  assert.equal(t.net, 11070);
  assert.equal(t.vat, 2767.5);
  assert.equal(t.total, 13837.5);
});

test("organic client: every line not certified organic needs a dispensation", () => {
  assert.equal(needsDispensation(line({ organic: false }), true), true);
  assert.equal(needsDispensation(line({ organic: null }), true), true, "unknown counts as not organic");
  assert.equal(needsDispensation(line({ organic: true }), true), false);
  assert.equal(needsDispensation(line({ organic: false }), false), false);
  assert.match(DISPENSATION_TEXT, /dispensation/);
});

test("Dinero: one line per species and propagation, cultivars counted", () => {
  const d = dineroLines({
    discountPct: 0,
    lines: [
      line({ nameDa: "Hassel", propagation: "grafted", cultivar: "Corabel", qty: 600, unitPrice: 100 }),
      line({ nameDa: "Hassel", propagation: "grafted", cultivar: "Tonda di Giffoni", qty: 400, unitPrice: 100 }),
      line({ nameDa: "Hassel", propagation: "grafted", cultivar: "Gunslebert", qty: 115, unitPrice: 100 }),
      line({ nameDa: "Kastanje", propagation: "grafted", cultivar: "Marigoule", qty: 10, unitPrice: 300 }),
    ],
  });
  assert.equal(d[0].text, "Hassel, podet, 3 sorter: 1.115 stk.");
  assert.equal(d[0].amount, 111500);
  assert.equal(d[1].text, "Kastanje, podet, Marigoule: 10 stk.");
});

test("Dinero: an offer discount becomes its own line", () => {
  const d = dineroLines({ discountPct: 5, lines: [line({ nameDa: "Hassel", qty: 10, unitPrice: 100 })] });
  assert.deepEqual(d.at(-1), { text: "Rabat 5 %", qty: 1, amount: -50 });
});

test("margin and purchase list come from the pricebook cost", () => {
  const l = line({ qty: 10, unitPrice: 120, pricing: { unitCostDkk: 80, supplierId: "nurseryA", costPrice: 10.7, costCurrency: "EUR" } });
  assert.deepEqual(lineMargin(l), { unitCost: 80, unitMargin: 40, marginPct: 33.33 });
  const p = purchaseList({ lines: [l] });
  assert.equal(p[0].supplierId, "nurseryA");
  assert.equal(p[0].totalCostDkk, 800);
  assert.equal(lineMargin(line({ qty: 1, unitPrice: 100 })), null);
});

test("a hand-set price is never repriced", () => {
  const l = line({ latin: "Corylus avellana", qty: 1, unitPrice: 99, priceSource: "manual" });
  assert.equal(priceLine(l, null, null).unitPrice, 99);
  const unpriced = priceLine(line({ latin: "Corylus avellana", qty: 1, priceSource: "none" }), null, null);
  assert.equal(unpriced.priceSource, "none");
});

test("valid for 14 days by default", () => {
  const d = defaultValidUntil(new Date("2026-11-02T10:00:00Z"));
  assert.equal(d.toISOString().slice(0, 10), "2026-11-16");
});

test("input: only known fields, numbers checked, status from a fixed list", () => {
  const ok = cleanOfferUpdate({ client: { name: "  Brian  ", $where: "x" }, createdBy: "evil", pricebookVersion: 1, discountPct: "5" });
  assert.ok(ok.ok);
  assert.deepEqual(Object.keys(ok.value).sort(), ["client", "discountPct"]);
  assert.equal(ok.value.client.name, "Brian");
  assert.equal(ok.value.discountPct, 5);
  assert.equal(cleanOfferUpdate({ status: "paid" }).ok, false);
  assert.equal(cleanOfferUpdate({ marginPct: "25%" }).ok, false);
  assert.equal(cleanOfferUpdate({ lines: [{ qty: -1, unitPrice: 10 }] }).ok, false);
  const l = cleanOfferUpdate({ lines: [{ qty: 5, unitPrice: 10, pricing: { unitCostDkk: 1 }, _id: { $gt: "" } }] }) as any;
  assert.equal(l.value.lines[0].pricing, undefined, "pricing is server-side only");
  assert.equal(l.value.lines[0]._id, undefined);
});
