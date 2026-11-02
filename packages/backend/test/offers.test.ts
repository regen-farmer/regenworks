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

// ---- after review ----
import { buildPricebook } from "../src/internal/pricebook.ts";
import { mergeLines } from "../src/internal/offers.ts";

const pbFiles = {
  suppliers: "supplier_id,name\nn1,Nursery 1\n",
  documents: "doc_id,supplier_id,document_date\nd1,n1,2026-09-01\n",
  supplierPrices:
    "price_id,doc_id,supplier_id,latin,common_name,cultivar,rootstock,propagation,organic_status,price,currency,vat,unit\n" +
    "x1,d1,n1,Corylus avellana,Hazel,Corabel,Corylus colurna,grafted,organic,14,EUR,excl. VAT,plant\n",
  salesPrices:
    "sales_price_id,latin,common_name_da,cultivar,propagation,rootstock,organic_status,price_excl_vat,currency\n" +
    "s1,Corylus avellana,Hassel,Corabel,grafted,Corylus colurna,organic,150,DKK\n" +
    "s2,Corylus avellana,Hassel,Corabel,grafted,Corylus colurna,not-organic,110,DKK\n",
};
const pb = (buildPricebook(pbFiles) as any).data;
const rates = { marginPct: 40, eurDkk: 7 };
const hazel = (o: any = {}) => line({ latin: "Corylus avellana", cultivar: "Corabel", rootstock: "Corylus colurna", propagation: "grafted", qty: 10, priceSource: "none", organic: null, ...o });

test("organic left open: organic client gets organic, others conventional; the line records which", () => {
  const forOrganic = priceLine(hazel(), pb, rates, undefined, true);
  assert.equal(forOrganic.unitPrice, 150);
  assert.equal(forOrganic.organic, true);
  const forOther = priceLine(hazel(), pb, rates, undefined, false);
  assert.equal(forOther.unitPrice, 110);
  assert.equal(forOther.organic, false);
  assert.equal(forOther.nameDa, "Hassel");
});

test("sales-priced lines still show a supplier cost for the margin", () => {
  const l = priceLine(hazel({ organic: true }), pb, rates, undefined, true);
  assert.equal(l.priceSource, "sales");
  assert.equal(l.pricing?.supplierId, "n1");
  assert.equal(l.pricing?.unitCostDkk, 98);
  assert.equal(lineMargin(l)?.unitMargin, 52);
});

test("a priced line keeps its price when a later pricebook has no match (flagged)", () => {
  const priced = priceLine(hazel({ organic: true }), pb, rates, undefined, true);
  const empty = { ...pb, salesPrices: [], supplierPrices: [] };
  const again = priceLine(priced, empty, rates, undefined, true);
  assert.equal(again.unitPrice, 150);
  assert.equal(again.pricing?.stale, true);
});

test("merge: typed price → manual; changed plant → old pricing dropped; duplicates and new lines", () => {
  const stored = [
    { _id: "a", ...hazel({ organic: false }), unitPrice: 110, priceSource: "sales", pricing: { supplierId: "n1" }, speciesId: "sp" },
  ];
  const typed = mergeLines(stored, [{ ...stored[0], pricing: undefined, unitPrice: 100 }]);
  assert.equal(typed[0].priceSource, "manual");
  assert.deepEqual(typed[0].pricing, { supplierId: "n1" });
  const trimmed = mergeLines(stored, [{ ...stored[0], pricing: undefined, cultivar: " Corabel ", size: "" }]);
  assert.equal(trimmed[0].priceSource, "sales", "spaces and empty text are not a new plant");
  const changed = mergeLines(stored, [{ ...stored[0], pricing: undefined, cultivar: "Tonda di Giffoni" }]);
  assert.equal(changed[0].pricing, null);
  assert.equal(changed[0].priceSource, "none");
  assert.equal(changed[0].unitPrice, 0);
  const dup = mergeLines(stored, [stored[0], stored[0], { latin: "Juglans regia", qty: 1, unitPrice: 0 }]);
  assert.equal(dup.length, 2);
  assert.equal(dup[1].priceSource, "none");
});

test("Dinero: lines without a cultivar are counted as unsorted", () => {
  const d = dineroLines({
    lines: [
      line({ nameDa: "Hassel", propagation: "grafted", cultivar: "Corabel", qty: 100, unitPrice: 1 }),
      line({ nameDa: "Hassel", propagation: "grafted", qty: 15, unitPrice: 1 }),
    ],
    discountPct: 7.5,
  });
  assert.equal(d[0].text, "Hassel, podet, Corabel + 15 usorteret: 115 stk.");
  assert.equal(d[1].text, "Rabat 7,5 %");
});

test("øre rounding: 1.005 kr is 1.01", () => {
  assert.equal(offerTotals({ lines: [line({ qty: 1, unitPrice: 1.005 })] }).subtotal, 1.01);
});

test("a conventional client gets organic stock when that's all there is; ticking organic later switches", () => {
  const onlyOrganic = { ...pb, salesPrices: pb.salesPrices.filter((p: any) => p.organicStatus === "organic") };
  const l = priceLine(hazel(), onlyOrganic, rates, undefined, false);
  assert.equal(l.unitPrice, 150);
  assert.equal(l.organic, true);
  const first = priceLine(hazel(), pb, rates, undefined, false);
  assert.equal(first.organic, false);
  const again = priceLine(first, pb, rates, undefined, true); // client now organic, line still open
  assert.equal(again.organic, true);
  assert.equal(again.unitPrice, 150);
});

// ---- products picked from the pricebook ----
test("a picked supplier product is priced from exactly that row", () => {
  const two = (buildPricebook({
    ...pbFiles,
    supplierPrices:
      pbFiles.supplierPrices + "x2,d1,n1,Corylus avellana,Hazel,Corabel,Corylus colurna,grafted,organic,9,EUR,excl. VAT,plant\n",
    salesPrices: "sales_price_id,latin,common_name_da,cultivar,propagation,rootstock,organic_status,price_excl_vat,currency\n",
  }) as any).data;
  const picked = priceLine(hazel({ pricebookRef: { kind: "supplier", id: "x1" } }), two, rates, undefined, false);
  assert.equal(picked.pricing?.supplierPriceId, "x1", "not the cheaper x2");
  assert.equal(picked.unitPrice, 135); // 14 EUR x 7 x 1.4 = 137.2 -> nearest 5 kr
  assert.equal(picked.organic, true);
});

test("a picked Grove sales price is used as listed; an unknown row falls back to matching", () => {
  const s = priceLine(hazel({ pricebookRef: { kind: "sales", id: "s2" } }), pb, rates, undefined, true);
  assert.equal(s.unitPrice, 110, "the conventional row the user picked, even for an organic client");
  assert.equal(s.organic, false);
  const gone = priceLine(hazel({ pricebookRef: { kind: "sales", id: "nope" } }), pb, rates, undefined, false);
  assert.equal(gone.unitPrice, 110);
  const m = mergeLines([{ _id: "a", ...hazel(), unitPrice: 110, priceSource: "sales", pricing: {} }], [{ _id: "a", ...hazel(), unitPrice: 110, pricebookRef: { kind: "sales", id: "s1" } }]);
  assert.equal(m[0].priceSource, "none", "picking another product means pricing again");
  assert.equal("pricebookRefKey" in m[0], false);
});

test("re-picking a product on a priced line prices it again", () => {
  const stored = [{ _id: "a", ...hazel({ organic: false }), unitPrice: 110, priceSource: "sales", pricing: { salesPriceId: "s2" }, pricebookRef: { kind: "sales", id: "s2" } }];
  const m = mergeLines(stored, [{ _id: "a", ...hazel(), qty: 10, unitPrice: 0, priceSource: "none", pricebookRef: { kind: "sales", id: "s1" } }]);
  assert.equal(m[0].priceSource, "none");
  const priced = priceLine(m[0], pb, rates, undefined, false);
  assert.equal(priced.unitPrice, 150);
  assert.equal(priced.pricing?.salesPriceId, "s1");
  const kept = mergeLines(stored, [{ _id: "a", ...hazel(), qty: 10, unitPrice: 110, priceSource: "sales", pricebookRef: { kind: "sales", id: "s1" } }]);
  assert.equal(kept[0].priceSource, "none", "a different product is priced again even if the old price comes along");
  const same = mergeLines(stored, [{ _id: "a", ...hazel({ organic: false }), unitPrice: 110, priceSource: "sales", pricebookRef: { kind: "sales", id: "s2" } }]);
  assert.equal(same[0].unitPrice, 110, "the same product again leaves the price alone");
  assert.equal(same[0].priceSource, "sales");
});

test("a picked product is not used once the plant is edited (and the line says so)", () => {
  const l = priceLine(hazel({ latin: "Juglans regia", cultivar: "", pricebookRef: { kind: "sales", id: "s1" } }), pb, rates, undefined, false);
  assert.equal(l.pricing?.pickedMissing, true);
  assert.notEqual(l.pricing?.salesPriceId, "s1");
});
