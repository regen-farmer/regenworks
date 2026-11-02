// Value-chain flow: a processing line as a graph of inputs (harvests),
// machines, stores and outputs (products / channels), run week by week.
//
// Each week, in graph order:
//  - an input sends its harvest for that week (the season's kg spread over its
//    harvest weeks, peaking in the middle);
//  - a machine adds what arrives to what is already waiting, processes up to its
//    weekly capacity, keeps the rest waiting, loses a share (drying, husk) and
//    splits the rest over its outgoing arrows;
//  - a store holds stock and releases up to its release rate (no rate = all);
//    stock above its capacity is flagged;
//  - an output adds up what it receives.
// The busiest machine relative to its capacity is the bottleneck.
//
// Pure functions: no I/O, used by the browser and tested in tests/valuechain.test.ts.

export type Crop = "hazel" | "walnut" | "chestnut" | "blackcurrant" | "redcurrant";

export type FlowNode =
	| { id: string; kind: "input"; label: string; x: number; y: number; crop: Crop; form?: string; kg: number; weekFrom: number; weekTo: number }
	| {
			id: string;
			kind: "machine";
			label: string;
			x: number;
			y: number;
			equipmentId?: string;
			mode: "rate" | "batch";
			/** kg per hour (rate) */
			kgPerHour?: number | null;
			/** kg per batch and hours per batch (batch) */
			kgPerBatch?: number | null;
			batchHours?: number | null;
			hoursPerDay: number;
			daysPerWeek: number;
			/** share of the input weight lost (moisture, husk), 0-1 */
			loss?: number;
			/** how many machines of this kind run side by side */
			count?: number;
	  }
	| { id: string; kind: "store"; label: string; x: number; y: number; equipmentId?: string; capacityKg?: number | null; releaseKgPerWeek?: number | null }
	| { id: string; kind: "output"; label: string; x: number; y: number; form?: string };

export type FlowEdge = { id: string; from: string; to: string; share?: number | null };
export type FlowLine = { nodes: FlowNode[]; edges: FlowEdge[] };

export type NodeResult = {
	id: string;
	kind: FlowNode["kind"];
	label: string;
	/** kg arriving over the season */
	inKg: number;
	/** kg leaving (after loss) over the season */
	outKg: number;
	/** machines: weekly capacity in kg; null = unknown */
	weeklyCapacityKg: number | null;
	/** machines: highest (waiting + arriving) / capacity in any week */
	peakLoad: number | null;
	peakWeek: number | null;
	/** machines: processed / capacity over the weeks it had work */
	avgUse: number | null;
	weeksOverCapacity: number;
	/** machines: most kg waiting at the end of a week; stores: most kg in stock */
	maxWaitingKg: number;
	/** kg still waiting or in stock after the last week */
	leftKg: number;
	/** per week, for charts */
	weeks: { week: number; arrivedKg: number; doneKg: number; waitingKg: number }[];
	warnings: string[];
};

export type FlowResult = {
	weeks: number[];
	nodes: NodeResult[];
	bottleneck: string | null;
	warnings: string[];
};

/** Weekly capacity of a machine in kg, or null when its capacity is unknown. */
export function weeklyCapacityKg(n: Extract<FlowNode, { kind: "machine" }>): number | null {
	const hours = Math.max(0, n.hoursPerDay) * Math.max(0, n.daysPerWeek);
	const count = Math.max(1, Math.floor(n.count ?? 1));
	if (n.mode === "rate") {
		if (!(Number(n.kgPerHour) > 0)) return null;
		return Number(n.kgPerHour) * hours * count;
	}
	if (!(Number(n.kgPerBatch) > 0) || !(Number(n.batchHours) > 0)) return null;
	// fractional batches: a batch started late in the week finishes next week, so on
	// average hours / batchHours batches a week (a 48 h batch on an 8 h x 5 day week: 0.83)
	return (Number(n.kgPerBatch) * hours * count) / Number(n.batchHours);
}

/** Spread a season's kg over its harvest weeks: a triangle peaking in the middle week(s). */
export function harvestWeeks(kg: number, from: number, to: number): Map<number, number> {
	const out = new Map<number, number>();
	if (!(kg > 0) || !Number.isFinite(from) || !Number.isFinite(to) || to < from) return out;
	const n = to - from + 1;
	const weights = Array.from({ length: n }, (_, i) => Math.min(i + 1, n - i));
	const total = weights.reduce((a, b) => a + b, 0);
	weights.forEach((w, i) => out.set(from + i, (kg * w) / total));
	return out;
}

/** Nodes in an order where every arrow points forward, or null when there is a loop. */
export function graphOrder(line: FlowLine): string[] | null {
	const ids = new Set(line.nodes.map((n) => n.id));
	const indeg = new Map<string, number>([...ids].map((id) => [id, 0]));
	const next = new Map<string, string[]>();
	for (const e of line.edges) {
		if (!ids.has(e.from) || !ids.has(e.to)) continue;
		indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
		next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
	}
	const queue = line.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
	const order: string[] = [];
	while (queue.length) {
		const id = queue.shift()!;
		order.push(id);
		for (const t of next.get(id) ?? []) {
			indeg.set(t, (indeg.get(t) ?? 0) - 1);
			if (indeg.get(t) === 0) queue.push(t);
		}
	}
	return order.length === ids.size ? order : null;
}

/** Shares of a node's outgoing arrows: given shares scaled to 1; unset ones split what is left equally. */
export function edgeShares(edges: FlowEdge[]): Map<string, number> {
	const out = new Map<string, number>();
	if (!edges.length) return out;
	const set = edges.filter((e) => e.share != null && Number(e.share) >= 0);
	const unset = edges.filter((e) => !(e.share != null && Number(e.share) >= 0));
	const given = set.reduce((a, e) => a + Number(e.share), 0);
	if (!unset.length) {
		for (const e of set) out.set(e.id, given > 0 ? Number(e.share) / given : 1 / set.length);
		return out;
	}
	const rest = Math.max(0, 1 - given);
	const scale = given > 1 ? 1 / given : 1;
	for (const e of set) out.set(e.id, Number(e.share) * scale);
	for (const e of unset) out.set(e.id, given >= 1 ? 0 : rest / unset.length);
	return out;
}

export function runFlow(line: FlowLine, opts: { extraWeeks?: number } = {}): FlowResult {
	const warnings: string[] = [];
	const order = graphOrder(line);
	if (!order) return { weeks: [], nodes: [], bottleneck: null, warnings: ["The line has a loop: arrows must run one way."] };
	const byId = new Map(line.nodes.map((n) => [n.id, n]));
	const outEdges = new Map<string, FlowEdge[]>();
	const inCount = new Map<string, number>();
	for (const e of line.edges) {
		if (!byId.has(e.from) || !byId.has(e.to)) continue;
		outEdges.set(e.from, [...(outEdges.get(e.from) ?? []), e]);
		inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
	}

	const harvest = new Map<string, Map<number, number>>();
	let first = Infinity;
	let last = -Infinity;
	for (const n of line.nodes) {
		if (n.kind !== "input") continue;
		const w = harvestWeeks(n.kg, Math.round(n.weekFrom), Math.round(n.weekTo));
		harvest.set(n.id, w);
		for (const wk of w.keys()) {
			first = Math.min(first, wk);
			last = Math.max(last, wk);
		}
	}
	if (!Number.isFinite(first)) return { weeks: [], nodes: [], bottleneck: null, warnings: ["Add an input with kg and harvest weeks."] };
	// weeks run on past 52 for the extra weeks (53 = week 1 next year); harvests within one calendar year
	const weeks = Array.from({ length: last - first + 1 + (opts.extraWeeks ?? 12) }, (_, i) => first + i);

	const res = new Map<string, NodeResult>();
	for (const n of line.nodes) {
		const r: NodeResult = { id: n.id, kind: n.kind, label: n.label, inKg: 0, outKg: 0, weeklyCapacityKg: null, peakLoad: null, peakWeek: null, avgUse: null, weeksOverCapacity: 0, maxWaitingKg: 0, leftKg: 0, weeks: [], warnings: [] };
		if (n.kind === "machine") {
			r.weeklyCapacityKg = weeklyCapacityKg(n);
			if (r.weeklyCapacityKg == null) r.warnings.push("No capacity: counted as unlimited");
			else if (r.weeklyCapacityKg === 0) r.warnings.push("Capacity is 0 a week: check hours per day, days per week and batch time");
		}
		if (n.kind !== "output" && !(outEdges.get(n.id)?.length)) r.warnings.push("Nothing leaves this box: connect it to the next step");
		if (n.kind !== "input" && !inCount.get(n.id)) r.warnings.push("Nothing arrives here");
		res.set(n.id, r);
	}

	const waiting = new Map<string, number>(); // machine queue or store stock
	const used = new Map<string, { done: number; cap: number }>();
	for (const week of weeks) {
		const arriving = new Map<string, number>();
		for (const id of order) {
			const n = byId.get(id)!;
			const r = res.get(id)!;
			let out = 0;
			let arrived = arriving.get(id) ?? 0;
			let done = 0;
			if (n.kind === "input") {
				arrived = harvest.get(id)?.get(week) ?? 0;
				done = arrived;
				out = arrived;
			} else if (n.kind === "machine") {
				const avail = (waiting.get(id) ?? 0) + arrived;
				const cap = r.weeklyCapacityKg;
				done = cap == null ? avail : Math.min(avail, cap);
				const left = avail - done;
				waiting.set(id, left);
				r.maxWaitingKg = Math.max(r.maxWaitingKg, left);
				if (cap != null && avail > 0) {
					const load = cap > 0 ? avail / cap : Infinity; // a machine that can't run is the worst bottleneck
					if (r.peakLoad == null || load > r.peakLoad) {
						r.peakLoad = load;
						r.peakWeek = week;
					}
					if (load > 1 + 1e-9) r.weeksOverCapacity++;
					const u = used.get(id) ?? { done: 0, cap: 0 };
					used.set(id, { done: u.done + done, cap: u.cap + cap });
				}
				out = done * (1 - Math.min(1, Math.max(0, n.loss ?? 0)));
			} else if (n.kind === "store") {
				const stock = (waiting.get(id) ?? 0) + arrived;
				const rate = n.releaseKgPerWeek != null && n.releaseKgPerWeek >= 0 ? n.releaseKgPerWeek : Infinity;
				done = Math.min(stock, rate);
				waiting.set(id, stock - done);
				r.maxWaitingKg = Math.max(r.maxWaitingKg, stock);
				// what it must hold that week: stock plus arrivals, before sending on
				if (n.capacityKg != null && n.capacityKg > 0 && stock > n.capacityKg + 1e-9) r.weeksOverCapacity++;
				out = done;
			} else {
				done = arrived;
			}
			r.inKg += arrived;
			r.outKg += n.kind === "output" ? 0 : out;
			r.weeks.push({ week, arrivedKg: arrived, doneKg: done, waitingKg: waiting.get(id) ?? 0 });
			const shares = edgeShares(outEdges.get(id) ?? []);
			for (const e of outEdges.get(id) ?? []) arriving.set(e.to, (arriving.get(e.to) ?? 0) + out * (shares.get(e.id) ?? 0));
		}
	}

	for (const r of res.values()) {
		r.leftKg = waiting.get(r.id) ?? 0;
		const u = used.get(r.id);
		if (u && u.cap > 0) r.avgUse = u.done / u.cap;
		const n = byId.get(r.id)!;
		if (n.kind === "store" && n.capacityKg != null && n.capacityKg > 0 && r.maxWaitingKg > n.capacityKg) r.warnings.push(`Must hold up to ${Math.round(r.maxWaitingKg)} kg in a week (stock + arrivals), above the ${Math.round(n.capacityKg)} kg it holds`);
		if (n.kind === "machine" && r.leftKg > 0.5) r.warnings.push(`${Math.round(r.leftKg)} kg still waiting after week ${weeks[weeks.length - 1]}`);
		const outs = outEdges.get(r.id) ?? [];
		const shares = outs.filter((e) => e.share != null);
		const sum = shares.reduce((a, e) => a + Number(e.share), 0);
		if (shares.length && shares.length === outs.length && sum === 0) r.warnings.push("All arrow shares are 0 %: split equally instead");
		else if (shares.length && shares.length === outs.length && Math.abs(sum - 1) > 0.001) r.warnings.push(`Arrow shares add up to ${Math.round(sum * 100)} %; scaled to 100 %`);
		else if (shares.length < outs.length && sum >= 1) r.warnings.push(`Arrow shares already add up to ${Math.round(sum * 100)} %: arrows without a share get nothing`);
	}

	let bottleneck: string | null = null;
	let worst = 0;
	for (const r of res.values()) {
		if (r.kind === "machine" && r.peakLoad != null && r.peakLoad > worst) {
			worst = r.peakLoad;
			bottleneck = r.id;
		}
	}
	return { weeks, nodes: line.nodes.map((n) => res.get(n.id)!), bottleneck, warnings };
}
