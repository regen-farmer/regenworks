import assert from "node:assert/strict";
import { test } from "node:test";
import { type Assumptions, type FieldPlan, type Scenario, cropOf, economics, paymentRules, yieldPerPlant } from "../economics/cashflow.ts";

const band = (low: number, likely: number, high: number) => ({ low, likely, high });
const row = (parameter: string, crop_id: string, v: [number, number, number], age: number | null = null) => ({ parameter, crop_id, age, low: v[0], likely: v[1], high: v[2] });

const A: Assumptions = {
	version: 3,
	eurDkk: 7.46,
	ranges: [
		row("first_yield_year", "hazel", [3, 4, 4]),
		row("full_yield_year", "hazel", [11, 15, 15]),
		row("yield_full", "hazel", [3, 4, 5]), // invented test numbers
		row("price", "hazel", [30, 40, 50]),
		row("harvest_cost", "hazel", [3, 3, 3]),
		row("pruning_cost", "hazel", [3, 4, 5]),
		row("replacement_rate", "hazel", [0.05, 0.1, 0.15]),
		row("plant_cost", "hazel", [50, 60, 70]),
		row("yield_at_age", "blackcurrant", [0, 0, 0], 1),
		row("yield_at_age", "blackcurrant", [1, 1.4, 2], 3),
		row("opportunity_cost", "", [2000, 3000, 4000]),
		row("discount_rate", "", [0.04, 0.04, 0.04]),
	],
	payments: [
		{ payment_id: "gb-2026", scheme: "basic income support", rate: 211.23, currency: "EUR" },
		{ payment_id: "oa-basis-2026", scheme: "organic area support: basic", rate: 181.21, currency: "EUR" },
		{ payment_id: "oa-fruitberry-2026", scheme: "organic area support: fruit/berry supplement", rate: 536.91, currency: "EUR" },
		{ payment_id: "grass-2026", scheme: "environment- and climate-friendly grass", rate: 201.34, currency: "EUR" },
	],
	fruitBerry: [{ crop_id: "hazel", min_plants_per_ha: 225 }],
};

const field = (plants: FieldPlan["plants"], over: Partial<FieldPlan> = {}): FieldPlan => ({ fieldId: "f1", name: "Mark 1", fieldHa: 2, treeHa: 0.5, maxRowSpacingM: 8, plants, plantingYear: 2027, ...over });
const scen = (over: Partial<Scenario> = {}): Scenario => ({
	horizonYears: 20,
	crops: [],
	establishment: { sitePrepPerHa: 1000, plantingPerPlant: 10, protectionPerPlant: 5 },
	management: { mowingPerHa: 500 },
	baseline: { organic: true, paymentsToday: ["gb-2026", "oa-basis-2026"] },
	...over,
});

test("yield per plant: the ramp from the three parameters, an age curve when there is one", () => {
	assert.equal(yieldPerPlant(A, "hazel", 3, "likely"), 0);
	assert.equal(yieldPerPlant(A, "hazel", 4, "likely"), 0.4); // 10 % of 4 kg in the first harvest year
	assert.equal(yieldPerPlant(A, "hazel", 15, "likely"), 4);
	assert.equal(yieldPerPlant(A, "hazel", 3, "low"), 0, "pessimistic: no harvest before year 4");
	assert.ok(Math.abs(yieldPerPlant(A, "hazel", 4, "low")! - 0.3) < 1e-9, "then 10 % of the low full yield");
	assert.equal(yieldPerPlant(A, "hazel", 3, "high"), 0.5, "optimistic: from year 3");
	assert.equal(yieldPerPlant(A, "blackcurrant", 3, "likely"), 1.4);
	assert.equal(yieldPerPlant(A, "blackcurrant", 10, "likely"), 1.4, "after the curve: its last value");
	assert.equal(yieldPerPlant(A, "chestnut", 10, "likely"), null);
});

test("cash flow: establishment in year 1, sales from the first harvest, the land lost under the trees", () => {
	const r = economics(A, [field([{ crop_id: "hazel", label: "Hazel", count: 500 }])], scen());
	const L = r.cases.likely;
	const est = L.lines.filter((l) => l.group === "establishment").reduce((k, l) => k + l.years[0], 0);
	assert.equal(est, -(1000 * 0.5 + 10 * 500 + 5 * 500 + 60 * 500));
	assert.equal(L.lines.find((l) => l.key === "replant-hazel")!.years[1], -Math.round(0.1 * 500 * 70));
	assert.equal(L.lines.find((l) => l.key === "rev-hazel")!.years[14], 4 * 500 * 40);
	assert.equal(L.lines.find((l) => l.key === "baseline-lost")!.years[0], -3000 * 0.5);
	assert.ok(r.cases.low.npv < L.npv && L.npv < r.cases.high.npv, "the cases are ordered");
	assert.ok(L.paybackYear !== null && L.paybackYear > 4);
	assert.equal(L.worstYear.year, 1);
	assert.equal(r.totals.plants, 500);
});

test("missing numbers are listed, never hidden", () => {
	const r = economics(A, [field([{ crop_id: "chestnut", label: "Chestnut", count: 50 }, { crop_id: null, label: "Hawthorn", count: 20 }])], scen({ management: {} }));
	const what = r.noData.map((d) => `${d.crop_id}:${d.what}`);
	assert.ok(what.includes("chestnut:price") && what.includes("chestnut:yield curve") && what.includes("chestnut:plant cost"));
	assert.ok(what.some((w) => w.includes("Hawthorn")));
	assert.ok(what.includes("null:management: mowing per ha"));
});

test("payments: basic kept as agroforestry, the fruit/berry supplement when hazel reaches 225/ha in rows ≤10 m, grass scheme lost", () => {
	const dense = paymentRules(A, [field([{ crop_id: "hazel", label: "Hazel", count: 500 }])], scen({ baseline: { organic: true, paymentsToday: ["gb-2026", "oa-basis-2026", "grass-2026"] } }));
	const by = Object.fromEntries(dense.map((p) => [p.payment_id, p]));
	assert.equal(by["gb-2026"].withTrees, true);
	assert.equal(by["oa-fruitberry-2026"].withTrees, true);
	assert.equal(by["oa-fruitberry-2026"].kr_per_year, Math.round(536.91 * 7.46 * 2));
	assert.equal(by["grass-2026"].withTrees, false);
	assert.equal(by["grass-2026"].kr_per_year, -Math.round(201.34 * 7.46 * 2));
	const sparse = paymentRules(A, [field([{ crop_id: "hazel", label: "Hazel", count: 224 }], { maxRowSpacingM: 24 })], scen());
	assert.equal(sparse.find((p) => p.payment_id === "oa-fruitberry-2026")!.withTrees, false);
	assert.match(sparse.find((p) => p.payment_id === "oa-fruitberry-2026")!.reason, /112 plants\/ha.*225/);
	const wide = paymentRules(A, [field([{ crop_id: "hazel", label: "Hazel", count: 500 }], { maxRowSpacingM: 90 })], scen());
	assert.equal(wide.find((p) => p.payment_id === "gb-2026")!.withTrees, false);
	const conventional = paymentRules(A, [field([{ crop_id: "hazel", label: "Hazel", count: 500 }])], scen({ baseline: { organic: false, paymentsToday: ["gb-2026"] } }));
	assert.equal(conventional.find((p) => p.payment_id === "oa-fruitberry-2026")!.withTrees, false);
	const byHand = paymentRules(A, [field([{ crop_id: "hazel", label: "Hazel", count: 500 }])], scen({ baseline: { organic: true, paymentsToday: ["gb-2026"], paymentsWithTrees: [] } }));
	assert.match(byHand.find((p) => p.payment_id === "gb-2026")!.reason, /set by hand/);
});

test("value chain: a price, processing cost and loss chosen for the crop replace the assumptions", () => {
	const s = scen({ crops: [{ crop_id: "hazel", price: band(60, 80, 100), processingPerKg: 10, processingLoss: 0.5 }] });
	const L = economics(A, [field([{ crop_id: "hazel", label: "Hazel", count: 500 }])], s).cases.likely;
	assert.equal(L.lines.find((l) => l.key === "rev-hazel")!.years[14], 4 * 500 * 0.5 * 80);
	assert.equal(L.lines.find((l) => l.key === "proc-hazel")!.years[14], -4 * 500 * 0.5 * 10);
});

test("library species map to crops", () => {
	assert.equal(cropOf({ genus: "Corylus", species: "avellana" }), "hazel");
	assert.equal(cropOf({ genus: "Corylus", species: "maxima" }), "hazel");
	assert.equal(cropOf({ genus: "Ribes", species: "nigrum" }), "blackcurrant");
	assert.equal(cropOf({ genus: "Crataegus", species: "monogyna" }), null);
});

test("fields planted in different years start their own lines later; payments are checked field by field", () => {
	const a = field([{ crop_id: "hazel", label: "Hazel", count: 500 }], { fieldId: "a", name: "A", plantingYear: 2027 });
	const b = field([{ crop_id: "hazel", label: "Hazel", count: 100 }], { fieldId: "b", name: "B", plantingYear: 2030, maxRowSpacingM: 24 });
	const r = economics(A, [a, b], scen());
	const L = r.cases.likely;
	const plants = L.lines.find((l) => l.key === "plants-hazel")!;
	assert.equal(plants.years[0], -500 * 60);
	assert.equal(plants.years[3], -100 * 60, "field B's plants in plan year 4");
	assert.equal(L.lines.find((l) => l.key === "rev-hazel")!.years[3], 0.4 * 500 * 40, "only A harvests in year 4");
	const fb = r.payments.find((p) => p.payment_id === "oa-fruitberry-2026")!;
	assert.deepEqual(fb.fields!.map((f) => f.withTrees), [true, false], "A dense with close rows; B too sparse");
	assert.equal(fb.kr_per_year, Math.round(536.91 * 7.46 * 2), "only A's 2 ha");
	const pay = L.lines.find((l) => l.key === "payments")!;
	assert.equal(pay.years[0], Math.round(536.91 * 7.46 * 2));
});

test("every planted tree counts towards the 100 trees/ha limit; an empty plan has no payback", () => {
	const mixed = paymentRules(A, [field([{ crop_id: "hazel", label: "Hazel", count: 120 }, { crop_id: null, label: "Oak", count: 180 }], { maxRowSpacingM: 90 })], scen());
	assert.match(mixed.find((p) => p.payment_id === "gb-2026")!.reason, /150 trees\/ha/);
	assert.equal(mixed.find((p) => p.payment_id === "gb-2026")!.withTrees, false);
	const none = economics(A, [], scen());
	assert.equal(none.cases.likely.paybackYear, null);
});

test("a crop without a yield curve still costs its pruning and care", () => {
	const r = economics(A, [field([{ crop_id: "chestnut", label: "Chestnut", count: 50 }])], scen({ crops: [{ crop_id: "chestnut", pruningPerPlant: 10 }] }));
	assert.equal(r.cases.likely.lines.find((l) => l.key === "prune-chestnut")!.years[4], -50 * 10);
});
