// Value-chain flow engine (valuechain/flow.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeShares, graphOrder, harvestWeeks, runFlow, weeklyCapacityKg, type FlowLine } from "../valuechain/flow.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("harvest is spread over the weeks, peaking in the middle, and adds up", () => {
	const w = harvestWeeks(9000, 36, 40);
	assert.deepEqual([...w.keys()], [36, 37, 38, 39, 40]);
	close([...w.values()].reduce((a, b) => a + b, 0), 9000);
	assert.ok(w.get(38)! > w.get(37)! && w.get(37)! > w.get(36)!);
	close(w.get(36)!, w.get(40)!);
	assert.equal(harvestWeeks(100, 40, 36).size, 0);
});

test("weekly capacity: rate, batch (whole batches only), count, unknown", () => {
	const base = { id: "m", kind: "machine" as const, label: "", x: 0, y: 0, hoursPerDay: 10, daysPerWeek: 6 };
	assert.equal(weeklyCapacityKg({ ...base, mode: "rate", kgPerHour: 100 }), 6000);
	assert.equal(weeklyCapacityKg({ ...base, mode: "rate", kgPerHour: 100, count: 2 }), 12000);
	assert.equal(weeklyCapacityKg({ ...base, mode: "batch", kgPerBatch: 5000, batchHours: 24 }), 10000); // 60 h -> 2 batches
	assert.equal(weeklyCapacityKg({ ...base, mode: "batch", kgPerBatch: 5000, batchHours: null }), null);
	assert.equal(weeklyCapacityKg({ ...base, mode: "rate", kgPerHour: null }), null);
});

test("arrow shares: given ones scale to 1, unset ones share what is left", () => {
	const s = edgeShares([{ id: "a", from: "x", to: "y", share: 0.7 }, { id: "b", from: "x", to: "z" }, { id: "c", from: "x", to: "w" }]);
	close(s.get("a")!, 0.7);
	close(s.get("b")!, 0.15);
	close(s.get("c")!, 0.15);
	const t = edgeShares([{ id: "a", from: "x", to: "y", share: 3 }, { id: "b", from: "x", to: "z", share: 1 }]);
	close(t.get("a")!, 0.75);
});

test("a loop is refused", () => {
	const line: FlowLine = {
		nodes: [
			{ id: "a", kind: "store", label: "A", x: 0, y: 0 },
			{ id: "b", kind: "store", label: "B", x: 0, y: 0 },
		],
		edges: [
			{ id: "1", from: "a", to: "b" },
			{ id: "2", from: "b", to: "a" },
		],
	};
	assert.equal(graphOrder(line), null);
	assert.match(runFlow(line).warnings[0], /loop/);
});

const hazelLine = (dryerKgPerBatch: number): FlowLine => ({
	nodes: [
		{ id: "in", kind: "input", label: "Hazel", x: 0, y: 0, crop: "hazel", kg: 30000, weekFrom: 36, weekTo: 40 },
		{ id: "dry", kind: "machine", label: "Dryer", x: 0, y: 0, mode: "batch", kgPerBatch: dryerKgPerBatch, batchHours: 24, hoursPerDay: 24, daysPerWeek: 7, loss: 0.2 },
		{ id: "grade", kind: "machine", label: "Grader", x: 0, y: 0, mode: "rate", kgPerHour: 600, hoursPerDay: 8, daysPerWeek: 5 },
		{ id: "a", kind: "output", label: "Grade A", x: 0, y: 0 },
		{ id: "b", kind: "output", label: "Grade B", x: 0, y: 0 },
	],
	edges: [
		{ id: "e1", from: "in", to: "dry" },
		{ id: "e2", from: "dry", to: "grade" },
		{ id: "e3", from: "grade", to: "a", share: 0.7 },
		{ id: "e4", from: "grade", to: "b", share: 0.3 },
	],
});

test("mass balance: what comes in comes out, minus the loss", () => {
	const r = runFlow(hazelLine(5000));
	const byId = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
	close(byId.in.outKg, 30000, 1e-6);
	close(byId.dry.inKg, 30000, 1e-6);
	close(byId.dry.outKg, 24000, 1e-6);
	close(byId.a.inKg + byId.b.inKg, 24000, 1e-6);
	close(byId.a.inKg, 16800, 1e-6);
});

test("a small dryer is the bottleneck, builds a queue and works it off later", () => {
	const r = runFlow(hazelLine(1000)); // 7,000 kg a week vs a 10,000 kg peak week
	const dry = r.nodes.find((n) => n.id === "dry")!;
	assert.equal(r.bottleneck, "dry");
	assert.ok(dry.peakLoad! > 1);
	assert.equal(dry.peakWeek! >= 38, true);
	assert.ok(dry.weeksOverCapacity >= 2);
	assert.ok(dry.maxWaitingKg > 0);
	close(dry.leftKg, 0, 1e-6); // the extra weeks are enough to dry everything
	close(dry.inKg, 30000, 1e-6);
});

test("a store releases at its rate and flags stock above its size", () => {
	const r = runFlow({
		nodes: [
			{ id: "in", kind: "input", label: "Chestnut", x: 0, y: 0, crop: "chestnut", kg: 12000, weekFrom: 40, weekTo: 42 },
			{ id: "cold", kind: "store", label: "20 ft container", x: 0, y: 0, capacityKg: 8000, releaseKgPerWeek: 1000 },
			{ id: "sale", kind: "output", label: "Direct sale", x: 0, y: 0 },
		],
		edges: [
			{ id: "1", from: "in", to: "cold" },
			{ id: "2", from: "cold", to: "sale" },
		],
	});
	const cold = r.nodes.find((n) => n.id === "cold")!;
	assert.ok(cold.maxWaitingKg > 8000);
	assert.ok(cold.warnings.some((w) => /above the 8000 kg/.test(w)));
	const sale = r.nodes.find((n) => n.id === "sale")!;
	assert.ok(sale.inKg <= 1000 * r.weeks.length + 1e-6);
	close(sale.inKg + cold.leftKg, 12000, 1e-6);
});

test("unknown capacity counts as unlimited and is flagged", () => {
	const line = hazelLine(5000);
	(line.nodes[2] as any).kgPerHour = null;
	const grade = runFlow(line).nodes.find((n) => n.id === "grade")!;
	assert.ok(grade.warnings.some((w) => /No capacity/.test(w)));
	close(grade.inKg, 24000, 1e-6);
	assert.equal(grade.peakLoad, null);
});
