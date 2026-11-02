// Price overview: grouping, DKK costs, ranges, sources, margins. Made-up numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPricebook } from "../src/internal/pricebook.ts";
import { priceOverview, productKey } from "../src/internal/priceOverview.ts";

const files = {
  suppliers: "supplier_id,name\na,Nursery A\nb,Nursery B\ngrove,Grove",
  documents: "doc_id,supplier_id,file,title,document_date\nda,a,sources/a-2025.xlsx,A list 2025,2025-09-01\ndb,b,sources/b-2019.pdf,B list 2019,2019-01-01\ngs,grove,sources/grove-2026.pdf,Grove 2026,2026-01-01",
  supplierPrices:
    "price_id,doc_id,supplier_id,latin,common_name,cultivar,rootstock,propagation,size_raw,height_cm_min,height_cm_max,organic_status,price,currency,vat,unit\n" +
    "a1,da,a,Corylus avellana,Hazel,Corabel,Corylus colurna,grafted,100-150,100,150,not-organic,10,EUR,excl. VAT,plant\n" +
    "b1,db,b,Corylus avellana,Hazel,Corabel,Corylus colurna,grafted,60-80,60,80,not-organic,60,DKK,not stated,plant\n" +
    "a2,da,a,Corylus avellana,Hazel,,,seedling,40-60,40,60,organic,2,EUR,excl. VAT,plant",
  salesPrices:
    "sales_price_id,doc_id,latin,common_name_da,cultivar,propagation,rootstock,organic_status,height_cm_min,height_cm_max,price_excl_vat,currency\n" +
    "s1,gs,Corylus avellana,Hassel,Corabel,grafted,Corylus colurna,not-organic,100,150,120,DKK",
  settings: "key,value\neur_dkk,7\ntarget_margin_services,40",
  services: "service_id,section,name_da,unit_da,basis,supplier_price_id\nnet,protection,Net,stk.,tree,a2",
};

test("price overview: one product per species, cultivar, rootstock and type; costs in DKK with sources", () => {
  const b = buildPricebook(files);
  assert.ok(b.ok);
  if (!b.ok) return;
  assert.equal(b.data.documents[0].file, "sources/a-2025.xlsx");
  assert.equal(b.data.salesPrices[0].docId, "gs");
  const o = priceOverview(b.data, { eurDkk: 7, now: new Date("2026-11-02") });
  assert.equal(o.products.length, 2, "Corabel, and hazel without a cultivar");
  const corabel = o.products.find((p) => p.cultivar === "Corabel")!;
  assert.deepEqual(corabel.costs.map((c) => c.unitCostDkk), [60, 70], "cheapest first; 10 EUR x 7");
  assert.equal(corabel.summary.costMin, 60);
  assert.equal(corabel.summary.costMax, 70);
  assert.equal(corabel.summary.suppliers, 2);
  assert.equal(corabel.summary.outdated, 1, "the 2019 list");
  assert.equal(corabel.summary.vatUnclear, 1);
  assert.equal(corabel.costs[1].source.file, "sources/a-2025.xlsx");
  assert.equal(corabel.costs[1].source.supplierName, "Nursery A");
  const sale = corabel.sales[0];
  assert.equal(sale.priceExclVat, 120);
  assert.equal(sale.source.file, "sources/grove-2026.pdf");
  assert.equal(sale.costReference.supplierPriceId, "a1", "same size as the sales price");
  assert.equal(sale.costReference.sameProduct, true);
  assert.deepEqual(sale.costReference.unknown, ["years"], "Grove's own grafted plant is 1+1; the supplier list doesn't say");
  assert.equal(sale.costReference.exact, false);
  assert.equal(corabel.costs[0].rootstock, "Corylus colurna");
  assert.equal(sale.marginPct, 41.67);
  assert.equal(priceOverview(b.data, { eurDkk: 7, q: "corabel colurna" }).products.length, 1, "all words must match");
  assert.equal(priceOverview(b.data, { eurDkk: 7, q: "walnut" }).products.length, 0);
  const net = o.services[0];
  assert.equal(net.costLikely, 14);
  assert.equal(net.unitPrice, 23.5, "14 / 0.6 = 23.33 -> up to 0.50 kr");
  assert.equal(net.source.file, "sources/a-2025.xlsx");
  assert.equal(productKey({ latin: "Corylus avellana", cultivar: " corabel" }), productKey({ latin: "corylus  avellana", cultivar: "Corabel" }));
  // a supplier row without rootstock or type still sits with the sales price
  const loose = buildPricebook({ ...files, supplierPrices: files.supplierPrices.replace("b1,db,b,Corylus avellana,Hazel,Corabel,Corylus colurna,grafted", "b1,db,b,Corylus avellana,Hazel,Corabel,,") });
  assert.ok(loose.ok && priceOverview(loose.data, { eurDkk: 7 }).products.find((p) => p.cultivar === "Corabel")!.costs.length === 2);
});

test("price overview: products by rootstock, propagation, form and years; margins only against costs that fit", async () => {
  const b = buildPricebook({
    ...files,
    services: "service_id,section,name_da,unit_da,basis,supplier_price_id\nnet,protection,Net,stk.,tree,c2",
    supplierPrices:
      "price_id,doc_id,supplier_id,latin,common_name,cultivar,rootstock,propagation,size_raw,container,age,height_cm_min,height_cm_max,organic_status,price,currency,vat,unit\n" +
      "c1,da,a,Corylus avellana,Hazel,Corabel,Corylus colurna,grafted,100-150,WG,1+1,100,150,organic,10,EUR,excl. VAT,plant\n" +
      "c2,da,a,Corylus avellana,Hazel,Corabel,,own-rooted,100-150,C3,,100,150,organic,4,EUR,excl. VAT,plant\n" +
      "c3,da,a,Corylus avellana,Hazel,Corabel,Corylus avellana,grafted,100-150,WG,2 ans,100,150,organic,12,EUR,excl. VAT,plant",
    salesPrices:
      "sales_price_id,doc_id,latin,common_name_da,cultivar,propagation,rootstock,organic_status,height_cm_min,height_cm_max,form,price_excl_vat,currency\n" +
      "s1,gs,Corylus avellana,Hassel,Corabel,grafted,Corylus colurna seedling,organic,100,150,bare root,120,DKK",
  });
  assert.ok(b.ok);
  if (!b.ok) return;
  const g = priceOverview(b.data, { eurDkk: 7 }).products.find((p) => p.cultivar === "Corabel")!;
  assert.equal(g.products.length, 3, "colurna 1+1 bare root (sale + c1), own-rooted container, avellana rootstock 2 years");
  const main = g.products.find((p) => p.sales)!;
  assert.equal(main.costs, 1);
  assert.equal(main.summary.compatiblePoints, 1, "c1 only: not the own-rooted plant, not the one on avellana");
  assert.equal(main.summary.costMin, 70);
  assert.equal(main.summary.marginLow, 41.67);
  assert.equal(main.summary.approx, false);
  assert.equal(main.spec.years, "1+1");
  assert.equal(main.spec.form, "bare-root");
  assert.ok(g.products.some((p) => p.spec.rootstock === "Corylus avellana" && p.spec.years === "2"));
  // pricing a line: the same form and years rank first
  const { suggestPrice } = await import("../src/internal/pricebook.ts");
  const pick = (form: string, years?: string) => suggestPrice(b.data, { latin: "Corylus avellana", cultivar: "Corabel", form, years }, { marginPct: 25, eurDkk: 7 })?.supplierPriceId;
  assert.equal(pick("container"), "c2");
  assert.equal(pick("bare-root", "2"), "c3");
  // a leftover form never pulls the price to another rootstock
  const onColurna = suggestPrice(b.data, { latin: "Corylus avellana", cultivar: "Corabel", rootstock: "Corylus colurna", form: "container", years: "2" }, { marginPct: 25, eurDkk: 7 })?.supplierPriceId;
  assert.equal(onColurna, "c1");
});
