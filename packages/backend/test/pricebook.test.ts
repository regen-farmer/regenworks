// Pricebook: CSV reading, checks, matching and price suggestions, using the
// real file layout of the private grove-pricebook repo (made-up prices).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/internal/csv.ts";
import { buildPricebook, isOutdated, round5, suggestPrice } from "../src/internal/pricebook.ts";

const suppliers = `supplier_id,name,country,contact,organic_certification,price_basis,vat_note,order_discounts,payment_terms,notes
nurseryA,Nursery A,NL,,SKAL,ex nursery,excl VAT,,,
nurseryB,"Nursery B, Ltd",FR,,,,,,,`;
const documents = `doc_id,supplier_id,file,title,document_date,date_basis,season,currency,entered,entered_by,notes
a-2025,nurseryA,x.xlsx,List A,2025-09-01,assumed,2025-26,EUR,2026-11-01,Claude,
b-2021,nurseryB,y.pdf,List B,2021-01-15,printed,2021,EUR,2026-11-01,Claude,`;
const supplierPrices = `price_id,doc_id,supplier_id,document_date,outdated,category,latin,common_name,cultivar,rootstock,propagation,size_raw,container,height_cm_min,height_cm_max,age,organic_status,cert_raw,price,currency,vat,unit,available_qty,supplier_code,notes,product_key
p1,a-2025,nurseryA,2025-09-01,,,Corylus avellana,Hazel,Corabel,Corylus colurna,grafted,100-150,,100,150,,organic,BIO,12.50,EUR,excl,plant,,,,k1
p2,b-2021,nurseryB,2021-01-15,,,Corylus avellana,Hazel,Corabel,Corylus colurna,grafted,100-150,,100,150,,organic,BIO,9.00,EUR,excl,plant,,,"note, with comma",k2
p3,a-2025,nurseryA,2025-09-01,,,Corylus avellana,Hazel,Tonda di Giffoni,,grafted,60-80,,60,80,,not-organic,SG.,8.00,EUR,excl,plant,,,,k3
p4,a-2025,nurseryA,2025-09-01,,,Castanea sativa,Chestnut,Marigoule,,grafted,,,,,,organic,BIO,25,EUR,excl,plant,,,,k4`;
const salesPrices = `sales_price_id,doc_id,season,group,latin,common_name_da,cultivar,propagation,rootstock,organic_status,height_cm_min,height_cm_max,form,listed_supplier,listed_country,price_excl_vat,price_incl_vat,currency,stock_status,notes
s1,g,2026,Hassel,Corylus avellana,Hassel,Corabel,grafted,Corylus colurna,not-organic,100,150,bare root,A,NL,120,150,DKK,,`;

const files = { suppliers, documents, supplierPrices, salesPrices };
const built = buildPricebook(files);
assert.ok(built.ok);
const data = (built as any).data;

test("CSV: quotes, commas and line breaks in fields", () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\r\n1,"two\nlines",3\n'), [
    ["a", "b, c", 'd "e"'],
    ["1", "two\nlines", "3"],
  ]);
});

test("build: all four files, unknown references and missing columns are refused", () => {
  assert.equal(data.supplierPrices.length, 4);
  assert.equal(data.suppliers[1].name, "Nursery B, Ltd");
  assert.equal(buildPricebook({ ...files, salesPrices: undefined }).ok, false);
  assert.equal(buildPricebook({ ...files, documents: documents.replace("b-2021,nurseryB", "b-2021,nobody") }).ok, false);
  assert.equal(buildPricebook({ ...files, supplierPrices: supplierPrices.replace("organic_status", "status") }).ok, false);
});

test("outdated: more than 3 years before today", () => {
  const now = new Date("2026-11-02T00:00:00Z");
  assert.equal(isOutdated("2025-09-01", now), false);
  assert.equal(isOutdated("2023-11-03", now), false);
  assert.equal(isOutdated("2023-11-01", now), true);
  assert.equal(isOutdated(undefined, now), true);
});

test("rounding to the nearest 5 kr", () => {
  assert.deepEqual([112.4, 112.5, 117.49, 117.5, 0].map(round5), [110, 115, 115, 120, 0]);
});

const opts = { marginPct: 40, eurDkk: 7, now: new Date("2026-11-02T00:00:00Z") };

test("Grove's sales price wins where one exists", () => {
  const s = suggestPrice(data, { latin: "Corylus avellana", cultivar: "Corabel", rootstock: "Corylus colurna seedling", organic: false }, opts)!;
  assert.equal(s.source, "sales");
  assert.equal(s.unitPrice, 120);
});

test("otherwise the matching supplier price + margin, rounded; a current list beats a cheaper old one", () => {
  // organic Corabel: the sales price is not organic, so cost + margin. The
  // 2021 list is cheaper but over 3 years old: the current one is used.
  const s = suggestPrice(data, { latin: "Corylus avellana", cultivar: "Corabel", rootstock: "Corylus colurna", organic: true }, opts)!;
  assert.equal(s.source, "cost+margin");
  assert.equal(s.supplierPriceId, "p1");
  assert.equal(s.outdated, false);
  assert.equal(s.unitPrice, round5(12.5 * 7 * 1.4)); // 122.5 -> 125
  assert.equal(s.vatUnclear, false);
});

test("only an old list: used, but flagged outdated", () => {
  const onlyOld = { ...data, supplierPrices: data.supplierPrices.filter((p: any) => p.priceId !== "p1") };
  const s = suggestPrice(onlyOld, { latin: "Corylus avellana", cultivar: "Corabel", organic: true }, opts)!;
  assert.equal(s.supplierPriceId, "p2");
  assert.equal(s.outdated, true);
});

test("a named cultivar never matches another cultivar's price", () => {
  assert.equal(suggestPrice(data, { latin: "Corylus avellana", cultivar: "Barcelona" }, opts), null);
  assert.equal(suggestPrice(data, { latin: "Juglans regia" }, opts), null);
});

test("accents and case don't matter", () => {
  const s = suggestPrice(data, { latin: "castanea SATIVA", cultivar: "marigoulé" }, opts)!;
  assert.equal(s.supplierPriceId, "p4");
});

test("hybrid groups match the pricebook's 'x' names in any order", async () => {
  const { hybridMatches } = await import("../src/internal/pricebook.ts");
  const euroJap = { genus: "Castanea", parents: ["Castanea sativa", "Castanea crenata"] };
  assert.equal(hybridMatches("Castanea crenata x sativa", euroJap), true);
  assert.equal(hybridMatches("Castanea sativa x crenata", euroJap), true);
  assert.equal(hybridMatches("Castanea mollisima x sativa", euroJap), false);
  assert.equal(hybridMatches("Castanea sativa", euroJap), false);
  assert.equal(hybridMatches("Corylus avellana x colurna", euroJap), false);
});

// ---- after review: grafted vs seedling, size, no cultivar, rootstocks ----

const sales2 = `sales_price_id,doc_id,season,group,latin,common_name_da,cultivar,propagation,rootstock,organic_status,height_cm_min,height_cm_max,form,listed_supplier,listed_country,price_excl_vat,price_incl_vat,currency,stock_status,notes
s1,g,2026,K,Castanea,Kastanje,Marigoule,seedling,,organic,60,80,bare root,A,NL,80,100,DKK,,
s2,g,2026,K,Castanea,Kastanje,Marigoule,grafted,,organic,100,150,bare root,A,NL,300,375,DKK,,
s3,g,2026,V,Juglans regia,Valnød,Fernor,grafted,Juglans regia,not-organic,100,150,,A,FR,180,225,DKK,,`;
const sup2 = `price_id,doc_id,supplier_id,document_date,outdated,category,latin,common_name,cultivar,rootstock,propagation,size_raw,container,height_cm_min,height_cm_max,age,organic_status,cert_raw,price,currency,vat,unit,available_qty,supplier_code,notes,product_key
q1,a-2025,nurseryA,,,,Malus domestica,Apple,Discovery,"M106, M111, M25",grafted,,,100,150,,not-organic,,10,EUR,excl,plant,,,,k
q2,a-2025,nurseryA,,,,Malus domestica,Apple,Discovery,MM111,grafted,,,100,150,,not-organic,,9,EUR,excl,plant,,,,k
q3,a-2025,nurseryA,,,,Corylus avellana,Hazel,,Corylus,grafted,,,100,150,,organic,,20,EUR,not stated,plant,,,,k
q4,a-2025,nurseryA,,,,Corylus avellana,Hazel,,,seedling,,,40,60,,organic,,1,EUR,excl,plant,,,,k
q5,a-2025,nurseryA,,,,Corylus avellana,Hazel,,,seedling,,,100,150,,organic,,3,EUR,excl,plant,,,,k
q6,a-2025,nurseryA,,,,,Guard,,,,,,,,,not-organic,,2,EUR,excl,item,,,,k`;
const b2 = buildPricebook({ ...files, salesPrices: sales2, supplierPrices: sup2 }) as any;

test("grafted and seedling plants of one cultivar are never mixed up, whatever the row order", () => {
  assert.ok(b2.ok);
  const q = { latin: "Castanea", cultivar: "Marigoule", organic: true, propagation: "grafted" as const };
  assert.equal(suggestPrice(b2.data, q, opts)!.unitPrice, 300);
  const reversed = { ...b2.data, salesPrices: [...b2.data.salesPrices].reverse() };
  assert.equal(suggestPrice(reversed, q, opts)!.unitPrice, 300);
  assert.equal(suggestPrice(b2.data, { ...q, propagation: "seedling" }, opts)!.unitPrice, 80);
});

test("chestnut hybrid group finds Grove's genus-only sales rows", () => {
  const s = suggestPrice(b2.data, { latin: "Castanea hybrid", hybrid: { genus: "Castanea", parents: ["sativa", "crenata"] }, cultivar: "Marigoule", propagation: "grafted" }, opts)!;
  assert.equal(s.source, "sales");
  assert.equal(s.unitPrice, 300);
});

test("no cultivar: never another cultivar's price; species rows only", () => {
  assert.equal(suggestPrice(b2.data, { latin: "Juglans regia" }, opts), null);
  const s = suggestPrice(b2.data, { latin: "Corylus avellana", organic: true, propagation: "seedling", heightMin: 100, heightMax: 150 }, opts)!;
  assert.equal(s.supplierPriceId, "q5", "the size asked for, not the cheapest small plant");
});

test("rootstocks: whole names, lists split; genus alone is not a match; M111 is not MM111", () => {
  const s = suggestPrice(b2.data, { latin: "Malus domestica", cultivar: "Discovery", rootstock: "M111", propagation: "grafted" }, opts)!;
  assert.equal(s.supplierPriceId, "q1");
  assert.match(s.matchNote, /rootstock matches/);
  const g = suggestPrice(b2.data, { latin: "Corylus avellana", rootstock: "Corylus colurna", propagation: "grafted", organic: true }, opts)!;
  assert.match(g.matchNote, /listed on Corylus/);
  assert.equal(g.vatUnclear, true, "'not stated' VAT is flagged");
});

test("items (guards, mulch) never match plants", () => {
  assert.ok(!b2.data.supplierPrices.some((p: any) => p.priceId === "q6" && suggestPrice({ ...b2.data, supplierPrices: [p] }, { latin: "" }, opts)));
});

test("currencies: unknown supplier currency or non-DKK sales prices are refused", () => {
  assert.equal(buildPricebook({ ...files, supplierPrices: supplierPrices.replace("12.50,EUR", "12.50,GBP") }).ok, false);
  assert.equal(buildPricebook({ ...files, salesPrices: salesPrices.replace(",DKK,", ",EUR,") }).ok, false);
  assert.ok(buildPricebook({ ...files, supplierPrices: supplierPrices.replace("12.50,EUR", "12.50,eur") }).ok);
});

test("dates: exactly 3 years old is not outdated yet; impossible dates refused", () => {
  assert.equal(isOutdated("2023-11-02", new Date("2026-11-02T15:00:00Z")), false);
  assert.equal(isOutdated("2023-11-01", new Date("2026-11-02T15:00:00Z")), true);
  assert.equal(buildPricebook({ ...files, documents: documents.replace("2025-09-01", "2025-02-30") }).ok, false);
});

test("CSV: a stray quote inside a field doesn't swallow the file; oversized files refused fast", () => {
  assert.deepEqual(parseCsv('12" pot,3\nx,y'), [['12" pot', "3"], ["x", "y"]]);
  const t = Date.now();
  const r = buildPricebook({ ...files, supplierPrices: `${",".repeat(5000)}\n${"a\n".repeat(5000)}` });
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t < 1000);
});

test("settings.csv gives the default margin and rate; nothing built in", async () => {
  const { pricingRates } = await import("../src/internal/pricebookRoutes.ts");
  const withSettings = buildPricebook({ ...files, settings: "key,value\ndefault_margin_pct,33\neur_dkk,7.1\n" }) as any;
  assert.deepEqual(withSettings.data.settings, { defaultMarginPct: 33, eurDkk: 7.1 });
  assert.deepEqual(pricingRates({}, withSettings.data.settings), { marginPct: 33, eurDkk: 7.1 });
  assert.ok("error" in pricingRates({}, {}));
  assert.ok("error" in pricingRates({ marginPct: "40%", eurDkk: "7" }, {}));
  assert.deepEqual(pricingRates({ marginPct: "40", eurDkk: "7" }, {}), { marginPct: 40, eurDkk: 7 });
});

test("unspecified grafted/organic: same price whatever the row order, and flagged ambiguous", () => {
  const q = { latin: "Castanea", cultivar: "Marigoule" };
  const a = suggestPrice(b2.data, q, opts)!;
  const reversed = { ...b2.data, salesPrices: [...b2.data.salesPrices].reverse() };
  const b = suggestPrice(reversed, q, opts)!;
  assert.equal(a.unitPrice, b.unitPrice);
  assert.equal(a.unitPrice, 300, "a cultivar defaults to grafted");
  assert.equal(a.ambiguous, true);
  assert.equal(suggestPrice(b2.data, { ...q, propagation: "grafted" }, opts)!.ambiguous, false);
});

test("Danish words: frøformeret rootstock is a seedling rootstock", async () => {
  const { rootstockMatches } = await import("../src/internal/pricebook.ts");
  assert.equal(rootstockMatches("Corylus colurna frøformeret", "Corylus colurna"), true);
});
