// Migrations ledger rules (packages/db/migrations/ledger.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRecord, checkRun, formatStatus, migrationName } from "@rw/db/migrations/ledger.ts";

const base = { name: "plans-2027-01", apply: true, backup: "atlas 2027-01-10 06:00", alreadyApplied: false, gitDirty: false };

test("names come from the file", () => {
	assert.equal(migrationName("packages/db/migrations/plant-catalogue-2026-11.ts"), "plant-catalogue-2026-11");
	assert.equal(migrationName("C:\\repo\\migrations\\x-1.ts"), "x-1");
});

test("dry runs are always allowed", () => {
	assert.ok(checkRun({ ...base, apply: false, backup: undefined, alreadyApplied: true, gitDirty: true }).ok);
});

test("applying needs a backup, a new name and committed code", () => {
	assert.ok(checkRun(base).ok);
	assert.equal(checkRun({ ...base, backup: " " }).ok, false);
	assert.equal(checkRun({ ...base, alreadyApplied: true }).ok, false);
	assert.equal(checkRun({ ...base, gitDirty: true }).ok, false);
	assert.equal(checkRun({ ...base, name: "../evil" }).ok, false);
});

test("recording an earlier migration needs a note and a new name", () => {
	assert.ok(checkRecord({ name: "plant-catalogue-2026-11", note: "Kris, staging + production, Nov 2026", alreadyApplied: false }).ok);
	assert.equal(checkRecord({ name: "plant-catalogue-2026-11", note: "", alreadyApplied: false }).ok, false);
	assert.equal(checkRecord({ name: "plant-catalogue-2026-11", note: "x", alreadyApplied: true }).ok, false);
});

test("status lists oldest first", () => {
	const out = formatStatus([
		{ name: "b", appliedAt: new Date("2027-01-02"), how: "runner", gitSha: "abcdef1234", gitDirty: false, backup: "snap-2", by: "kris" },
		{ name: "a", appliedAt: new Date("2026-11-01"), how: "recorded", gitSha: "unknown", gitDirty: false, backup: "", by: "kris", note: "earlier" },
	]);
	assert.match(out.split("\n")[0], /2026-11-01 {2}a /);
	assert.match(out.split("\n")[1], /abcdef1.*backup snap-2/);
	assert.equal(formatStatus([]), "No migrations recorded in this database.");
});
