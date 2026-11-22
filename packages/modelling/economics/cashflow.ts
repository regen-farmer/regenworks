// Economics v1 (22 Nov 2026): a farm plan's cash flow per year, as three coherent cases
// (pessimistic, likely, optimistic), from design quantities, Grove Data's assumptions and the
// economic scenario's own choices (value chain, costs, today's land use and area payments).
//
// Pure functions, no I/O: the backend fills the inputs (layout quantities per field, the assumptions
// version, the scenario) and the page shows the result. Tested in tests/economics.test.ts.
//
// Rules (Tech/Economic Model.md, decided with Kris 2 Nov and 22 Nov):
//  - every number is a range; a missing number is "no data" and listed, never a quiet zero in disguise;
//  - the baseline is what the land does today: the crop or grazing lost under the trees (option A: one
//    opportunity cost per ha of tree cover) and today's area payments; the trees' effect on payments is
//    a change from today (basic payment kept or lost, the organic fruit/berry supplement gained when
//    the declared main crop reaches its minimum density and rows are at most 10 m apart);
//  - year 1 is the planting year.

export type Band = { low: number; likely: number; high: number };
export type Case = "low" | "likely" | "high";
export const CASES: Case[] = ["low", "likely", "high"];

/** One parameter row from Grove Data's assumption_ranges.csv. */
export type RangeRow = { parameter: string; crop_id: string; age: number | null; low: number; likely: number; high: number; unit?: string; sources?: string; note?: string };
export type PaymentRow = { payment_id: string; scheme: string; scheme_da?: string; rate: number; currency: string };
export type FruitBerryRule = { crop_id: string; min_plants_per_ha: number };

export type Assumptions = {
	version: number;
	ranges: RangeRow[];
	payments: PaymentRow[];
	fruitBerry: FruitBerryRule[];
	eurDkk: number;
};

/** A field in the plan: its area, tree cover and plants per crop (from the generated layout). */
export type FieldPlan = {
	fieldId: string;
	name: string;
	fieldHa: number;
	treeHa: number;
	/** widest distance between neighbouring tree rows (m), for the payment rules; null if unknown */
	maxRowSpacingM: number | null;
	plants: { crop_id: string | null; label: string; count: number }[];
	plantingYear: number;
};

export type CropChoice = {
	crop_id: string;
	/** farm-gate price of the product sold (kr/kg); null = use the assumptions */
	price?: Band | null;
	/** extra processing or packing cost on the value chain (kr/kg sold) */
	processingPerKg?: number | null;
	/** share of the harvest lost in processing (0-1): drying, husk, grading */
	processingLoss?: number | null;
	/** overrides (kr/plant, kr/kg, fraction); null = assumptions */
	plantCost?: number | null;
	replacementRate?: number | null;
	pruningPerPlant?: number | null;
	harvestPerKg?: number | null;
	postharvestPerKg?: number | null;
	/** yield multiplier from the field (Grove Twin later); 1 = the assumptions as they are */
	yieldFactor?: Band | null;
};

export type Scenario = {
	horizonYears: number;
	discountRate?: number | null;
	crops: CropChoice[];
	/** establishment per ha of tree cover and per plant, and fencing per m (kr) */
	establishment: { sitePrepPerHa?: number | null; plantingPerPlant?: number | null; protectionPerPlant?: number | null; irrigationPerHa?: number | null; fencingTotal?: number | null; other?: number | null };
	/** management per year (kr): mowing per ha of tree cover, other fixed costs */
	management: { mowingPerHa?: number | null; otherPerYear?: number | null };
	baseline: {
		/** what the land under the trees earned before (kr/ha/yr, excl. payments); null = assumptions */
		opportunityPerHa?: Band | null;
		organic: boolean;
		/** payment ids the field gets today */
		paymentsToday: string[];
		/** payment ids the field gets with the trees; null = from the rules */
		paymentsWithTrees?: string[] | null;
	};
};

export type Line = { key: string; label: string; group: "establishment" | "management" | "revenue" | "baseline" | "payments"; years: number[] };
export type CaseResult = {
	years: number[];
	net: number[];
	cumulative: number[];
	lines: Line[];
	npv: number;
	paybackYear: number | null;
	worstYear: { year: number; net: number };
	cumulativeLowest: { year: number; value: number };
};
export type PaymentCheck = { payment_id: string; scheme: string; today: boolean; withTrees: boolean; reason: string; kr_per_year: number };
export type EconomicsResult = {
	cases: Record<Case, CaseResult>;
	noData: { crop_id: string | null; what: string }[];
	payments: PaymentCheck[];
	totals: { fieldHa: number; treeHa: number; plants: number; plantsByCrop: Record<string, number> };
	assumptionsVersion: number;
};

const FALLBACK_DISCOUNT = 0.04;

/** The range for a parameter and crop (no age), or null. */
export function rangeOf(a: Assumptions, parameter: string, crop: string | null, age: number | null = null): Band | null {
	const r = a.ranges.find((x) => x.parameter === parameter && (x.crop_id || "") === (crop ?? "") && (age === null ? x.age === null : x.age === age));
	return r ? { low: r.low, likely: r.likely, high: r.high } : null;
}

/** kg per plant in a year after planting (year 1 = planting year), per case. */
export function yieldPerPlant(a: Assumptions, crop: string, year: number, c: Case): number | null {
	const atAge = rangeOf(a, "yield_at_age", crop, year);
	if (atAge) return atAge[c];
	const anyAge = a.ranges.some((x) => x.parameter === "yield_at_age" && x.crop_id === crop);
	if (anyAge) {
		// a curve that stops before this year: keep its last value
		const ages = a.ranges.filter((x) => x.parameter === "yield_at_age" && x.crop_id === crop && x.age !== null && x.age < year).sort((p, q) => (q.age ?? 0) - (p.age ?? 0));
		if (ages.length) return ages[0][c];
	}
	const first = rangeOf(a, "first_yield_year", crop);
	const full = rangeOf(a, "full_yield_year", crop);
	const top = rangeOf(a, "yield_full", crop);
	if (!first || !full || !top) return null;
	// pessimistic: late start and late full yield; optimistic: early
	const f = c === "low" ? first.high : c === "high" ? first.low : first.likely;
	const u = Math.max(f, c === "low" ? full.high : c === "high" ? full.low : full.likely);
	if (year < f) return 0;
	if (year >= u) return top[c];
	const share = 0.1 + (0.9 * (year - f)) / Math.max(1, u - f);
	return top[c] * share;
}

const pick = (b: Band | null | undefined, c: Case, invert = false): number | null => {
	if (!b) return null;
	if (!invert) return b[c];
	return c === "low" ? b.high : c === "high" ? b.low : b.likely; // costs: pessimistic = high
};

/** Which payments the field gets with the trees, by the 2026 rules, and why. */
export function paymentRules(a: Assumptions, fields: FieldPlan[], s: Scenario): PaymentCheck[] {
	const fieldHa = fields.reduce((n, f) => n + f.fieldHa, 0);
	const plants = new Map<string, number>();
	for (const f of fields) for (const p of f.plants) if (p.crop_id) plants.set(p.crop_id, (plants.get(p.crop_id) ?? 0) + p.count);
	const fruitTrees = [...plants.entries()].filter(([c]) => c !== "walnut_timber").reduce((n, [, v]) => n + v, 0);
	const perHa = fieldHa > 0 ? fruitTrees / fieldHa : 0;
	const spacing = fields.map((f) => f.maxRowSpacingM).filter((x): x is number => x !== null);
	const maxSpacing = spacing.length ? Math.max(...spacing) : null;
	// the declared main crop: the crop with most plants; supplement when it reaches its minimum density
	const main = [...plants.entries()].sort((p, q) => q[1] - p[1])[0];
	const rule = main ? a.fruitBerry.find((r) => r.crop_id === main[0]) : undefined;
	const mainPerHa = main && fieldHa > 0 ? main[1] / fieldHa : 0;
	const out: PaymentCheck[] = [];
	for (const p of a.payments) {
		const today = s.baseline.paymentsToday.includes(p.payment_id);
		let withTrees = today;
		let reason = today ? "kept with the trees" : "not claimed today";
		if (p.payment_id.startsWith("gb-")) {
			if (!today) reason = "not claimed today";
			else if (perHa <= 100) reason = `kept: ${Math.round(perHa)} trees/ha, at most 100 are allowed outside agroforestry`;
			else if (maxSpacing !== null && maxSpacing > 80) {
				withTrees = false;
				reason = `at risk: ${Math.round(perHa)} trees/ha but rows up to ${Math.round(maxSpacing)} m apart (no point may be more than 40 m from a tree for agroforestry)`;
			} else reason = `kept as agroforestry (skovlandbrug): ${Math.round(perHa)} trees/ha in rows${maxSpacing !== null ? `, rows at most ${Math.round(maxSpacing)} m apart` : ""}; check belts are at most 3 rows wide`;
		} else if (p.payment_id.startsWith("oa-fruitberry")) {
			if (!s.baseline.organic) {
				withTrees = false;
				reason = "only on organic area";
			} else if (!main || !rule) {
				withTrees = false;
				reason = main ? `${main[0]} is not a fruit/berry supplement crop` : "no plants";
			} else if (mainPerHa < rule.min_plants_per_ha) {
				withTrees = false;
				reason = `${main[0]}: ${Math.round(mainPerHa)} plants/ha on the field, needs ${rule.min_plants_per_ha} (declare blocks as separate fields or plant denser)`;
			} else if (maxSpacing !== null && maxSpacing > 10) {
				withTrees = false;
				reason = `rows up to ${Math.round(maxSpacing)} m apart; the supplement needs rows at most 10 m apart`;
			} else {
				withTrees = true;
				reason = `${main[0]}: ${Math.round(mainPerHa)} plants/ha (minimum ${rule.min_plants_per_ha}), rows close enough`;
			}
		} else if (p.payment_id.startsWith("grass-") || p.payment_id.startsWith("varied-")) {
			if (today) {
				withTrees = false;
				reason = "assumed lost when the field becomes agroforestry (check the scheme's conditions)";
			}
		}
		if (s.baseline.paymentsWithTrees) {
			const chosen = s.baseline.paymentsWithTrees.includes(p.payment_id);
			if (chosen !== withTrees) reason = `set by hand (the rules said: ${reason})`;
			withTrees = chosen;
		}
		const rateDkk = p.currency === "EUR" ? p.rate * a.eurDkk : p.rate;
		out.push({ payment_id: p.payment_id, scheme: p.scheme, today, withTrees, reason, kr_per_year: Math.round((Number(withTrees) - Number(today)) * rateDkk * fieldHa) });
	}
	return out;
}

/** The plan's cash flow per year for one case: change against today, in kr. */
export function cashFlow(a: Assumptions, fields: FieldPlan[], s: Scenario, c: Case, payments: PaymentCheck[], noData?: Map<string, { crop_id: string | null; what: string }>): CaseResult {
	const n = Math.max(1, Math.min(60, Math.round(s.horizonYears || 30)));
	const years = Array.from({ length: n }, (_, i) => i + 1);
	const lines = new Map<string, Line>();
	const add = (key: string, label: string, group: Line["group"], year: number, kr: number) => {
		if (!kr || !Number.isFinite(kr)) return;
		const l = lines.get(key) ?? { key, label, group, years: new Array(n).fill(0) };
		l.years[year - 1] += kr;
		lines.set(key, l);
	};
	const miss = (crop: string | null, what: string) => noData?.set(`${crop}|${what}`, { crop_id: crop, what });
	const choice = new Map(s.crops.map((x) => [x.crop_id, x]));
	const treeHa = fields.reduce((m, f) => m + f.treeHa, 0);
	const allPlants = fields.reduce((m, f) => m + f.plants.reduce((k, p) => k + p.count, 0), 0);

	// establishment, year 1 (protection, planting and plants per plant; site, irrigation per ha of tree cover)
	const e = s.establishment ?? {};
	add("est-site", "Site preparation", "establishment", 1, -(e.sitePrepPerHa ?? 0) * treeHa);
	add("est-planting", "Planting", "establishment", 1, -(e.plantingPerPlant ?? 0) * allPlants);
	add("est-protection", "Tree protection", "establishment", 1, -(e.protectionPerPlant ?? 0) * allPlants);
	add("est-irrigation", "Irrigation", "establishment", 1, -(e.irrigationPerHa ?? 0) * treeHa);
	add("est-fencing", "Fencing", "establishment", 1, -(e.fencingTotal ?? 0));
	add("est-other", "Other establishment", "establishment", 1, -(e.other ?? 0));
	for (const k of ["sitePrepPerHa", "plantingPerPlant", "protectionPerPlant"] as const) if (e[k] === null || e[k] === undefined) miss(null, `establishment: ${k}`);

	const m = s.management ?? {};
	for (const y of years) {
		add("man-mowing", "Mowing", "management", y, -(m.mowingPerHa ?? 0) * treeHa);
		add("man-other", "Other management", "management", y, -(m.otherPerYear ?? 0));
	}
	if (m.mowingPerHa === null || m.mowingPerHa === undefined) miss(null, "management: mowing per ha");

	// per crop
	const byCrop = new Map<string, number>();
	for (const f of fields) for (const p of f.plants) {
		if (!p.crop_id) {
			miss(null, `no economics crop for "${p.label}" (${p.count} plants): left out`);
			continue;
		}
		byCrop.set(p.crop_id, (byCrop.get(p.crop_id) ?? 0) + p.count);
	}
	for (const [crop, count] of byCrop) {
		const ch = choice.get(crop) ?? { crop_id: crop };
		const plantCost = ch.plantCost ?? pick(rangeOf(a, "plant_cost", crop), c, true);
		if (plantCost === null) miss(crop, "plant cost");
		add(`plants-${crop}`, `Plants: ${crop}`, "establishment", 1, -(plantCost ?? 0) * count);
		const repl = ch.replacementRate ?? pick(rangeOf(a, "replacement_rate", crop), c, true);
		if (repl === null) miss(crop, "replacement rate");
		add(`replant-${crop}`, `Replanting: ${crop}`, "establishment", 2, -(repl ?? 0) * count * ((plantCost ?? 0) + (e.plantingPerPlant ?? 0)));

		const price = pick(ch.price ?? rangeOf(a, "price", crop), c);
		if (price === null) miss(crop, "price");
		const harvest = ch.harvestPerKg ?? pick(rangeOf(a, "harvest_cost", crop), c, true);
		if (harvest === null) miss(crop, "harvest cost");
		const post = ch.postharvestPerKg ?? pick(rangeOf(a, "postharvest_cost", crop), c, true);
		const prune = ch.pruningPerPlant ?? pick(rangeOf(a, "pruning_cost", crop), c, true);
		if (prune === null) miss(crop, "pruning cost");
		const factor = ch.yieldFactor ? ch.yieldFactor[c] : 1;
		const loss = Math.min(0.95, Math.max(0, ch.processingLoss ?? 0));
		let anyYield = false;
		for (const y of years) {
			const kgPlant = yieldPerPlant(a, crop, y, c);
			if (kgPlant === null) continue;
			anyYield = true;
			const kg = kgPlant * count * factor;
			const sold = kg * (1 - loss);
			add(`rev-${crop}`, `Sales: ${crop}`, "revenue", y, sold * (price ?? 0));
			add(`harvest-${crop}`, `Harvest: ${crop}`, "management", y, -kg * ((harvest ?? 0) + (post ?? 0)));
			add(`proc-${crop}`, `Processing: ${crop}`, "management", y, -sold * (ch.processingPerKg ?? 0));
			// care rises with the trees to full by year 5
			if (y >= 2) add(`prune-${crop}`, `Pruning and care: ${crop}`, "management", y, -count * (prune ?? 0) * Math.min(1, y / 5));
		}
		if (!anyYield) miss(crop, "yield curve");
	}

	// today's land use lost under the trees, and the change in area payments
	const opp = pick(s.baseline.opportunityPerHa ?? rangeOf(a, "opportunity_cost", null), c, true);
	if (opp === null) miss(null, "opportunity cost (what the land earns today)");
	const payDelta = payments.reduce((k, p) => k + p.kr_per_year, 0);
	for (const y of years) {
		add("baseline-lost", "Crop or grazing lost under the trees", "baseline", y, -(opp ?? 0) * treeHa);
		add("payments", "Change in area payments", "payments", y, payDelta);
	}

	const order: Line["group"][] = ["revenue", "establishment", "management", "baseline", "payments"];
	const all = [...lines.values()].sort((p, q) => order.indexOf(p.group) - order.indexOf(q.group) || p.label.localeCompare(q.label));
	const net = years.map((_, i) => all.reduce((k, l) => k + l.years[i], 0));
	const cumulative: number[] = [];
	net.reduce((k, v, i) => ((cumulative[i] = k + v), k + v), 0);
	const r = s.discountRate ?? rangeOf(a, "discount_rate", null)?.likely ?? FALLBACK_DISCOUNT;
	const npv = net.reduce((k, v, i) => k + v / (1 + r) ** (i + 1), 0);
	// payback: the first year from which the cumulative stays at or above zero
	let paybackYear: number | null = null;
	for (let i = cumulative.length - 1; i >= 0; i--) {
		if (cumulative[i] >= 0) paybackYear = i + 1;
		else break;
	}
	const wi = net.indexOf(Math.min(...net));
	const ci = cumulative.indexOf(Math.min(...cumulative));
	return {
		years,
		net: net.map(Math.round),
		cumulative: cumulative.map(Math.round),
		lines: all.map((l) => ({ ...l, years: l.years.map(Math.round) })),
		npv: Math.round(npv),
		paybackYear,
		worstYear: { year: wi + 1, net: Math.round(net[wi]) },
		cumulativeLowest: { year: ci + 1, value: Math.round(cumulative[ci]) },
	};
}

/** The whole economics: three cases, the payment checks and what has no data. */
export function economics(a: Assumptions, fields: FieldPlan[], s: Scenario): EconomicsResult {
	const payments = paymentRules(a, fields, s);
	const noData = new Map<string, { crop_id: string | null; what: string }>();
	const cases = Object.fromEntries(CASES.map((c) => [c, cashFlow(a, fields, s, c, payments, noData)])) as Record<Case, CaseResult>;
	const plantsByCrop: Record<string, number> = {};
	for (const f of fields) for (const p of f.plants) plantsByCrop[p.crop_id ?? `(${p.label})`] = (plantsByCrop[p.crop_id ?? `(${p.label})`] ?? 0) + p.count;
	return {
		cases,
		noData: [...noData.values()],
		payments,
		totals: {
			fieldHa: Math.round(fields.reduce((k, f) => k + f.fieldHa, 0) * 100) / 100,
			treeHa: Math.round(fields.reduce((k, f) => k + f.treeHa, 0) * 100) / 100,
			plants: fields.reduce((k, f) => k + f.plants.reduce((j, p) => j + p.count, 0), 0),
			plantsByCrop,
		},
		assumptionsVersion: a.version,
	};
}

/** Library species to Grove Data crop ids (genus + species, lower case; then genus). */
const BY_LATIN: Record<string, string> = {
	"corylus avellana": "hazel",
	"juglans regia": "walnut",
	"castanea sativa": "chestnut",
	"ribes nigrum": "blackcurrant",
	"ribes rubrum": "redcurrant",
	"ribes uva-crispa": "gooseberry",
	"hippophae rhamnoides": "sea_buckthorn",
	"elaeagnus umbellata": "autumn_olive",
	"juglans ailantifolia": "heartnut",
	"malus domestica": "apple",
	"pyrus communis": "pear",
	"prunus domestica": "plum",
	"prunus avium": "sweet_cherry",
	"prunus cerasus": "sour_cherry",
	"aronia melanocarpa": "aronia",
	"aronia prunifolia": "aronia",
	"sambucus nigra": "elderberry",
	"vaccinium corymbosum": "blueberry",
	"lonicera caerulea": "haskap",
};
const BY_GENUS: Record<string, string> = { corylus: "hazel", juglans: "walnut", castanea: "chestnut", morus: "mulberry", amelanchier: "serviceberry", aronia: "aronia", hippophae: "sea_buckthorn" };

export function cropOf(sp: { genus?: string; species?: string } | null | undefined): string | null {
	if (!sp) return null;
	const latin = `${sp.genus ?? ""} ${sp.species ?? ""}`.trim().toLowerCase();
	return BY_LATIN[latin] ?? BY_GENUS[(sp.genus ?? "").trim().toLowerCase()] ?? null;
}
