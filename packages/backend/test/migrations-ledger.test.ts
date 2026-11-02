// Migrations ledger rules (packages/db/migrations/ledger.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MARKER, checkRecord, checkRun, formatStatus, migrationName, readFlag } from "@rw/db/migrations/ledger.ts";

const base = {
	name: "plans-2027-01",
	source: `${MARKER}\nconsole.log("hi")`,
	apply: true,
	backup: "atlas 2027-01-10 06:00",
	existing: null,
	git: { sha: "abcdef1234", dirty: false, pushed: true },
};

test("names come from the file", () => {
	assert.equal(migrationName("packages/db/migrations/plant-catalogue-2026-11.ts"), "plant-catalogue-2026-11");
	assert.equal(migrationName("C:\\repo\\migrations\\x-1.ts"), "x-1");
});

test("only marked scripts run, even as a dry run", () => {
	assert.equal(checkRun({ ...base, apply: false, source: "await User.updateMany({}, {})" }).ok, false);
	assert.ok(checkRun({ ...base, apply: false, source: `\n\n${MARKER}\n` }).ok);
});

test("dry runs ignore backup, ledger and git state", () => {
	assert.ok(checkRun({ ...base, apply: false, backup: undefined, existing: { state: "done" }, git: { sha: "unknown", dirty: true, pushed: false } }).ok);
});

test("applying needs a backup, no ledger entry, and committed + pushed code", () => {
	assert.ok(checkRun(base).ok);
	assert.equal(checkRun({ ...base, backup: " " }).ok, false);
	for (const state of ["done", "running", "failed"] as const) assert.equal(checkRun({ ...base, existing: { state } }).ok, false);
	assert.equal(checkRun({ ...base, git: { sha: "unknown", dirty: false, pushed: false } }).ok, false);
	assert.equal(checkRun({ ...base, git: { ...base.git, dirty: true } }).ok, false);
	assert.equal(checkRun({ ...base, git: { ...base.git, pushed: false } }).ok, false);
	assert.equal(checkRun({ ...base, name: "../evil" }).ok, false);
});

test("recording an earlier migration needs a note and a new name", () => {
	assert.ok(checkRecord({ name: "plant-catalogue-2026-11", note: "Kris, staging + production, Nov 2026" }).ok);
	assert.equal(checkRecord({ name: "plant-catalogue-2026-11", note: "" }).ok, false);
	assert.equal(checkRecord({ name: "plant-catalogue-2026-11", note: "x", existing: { state: "done" } }).ok, false);
});

test("flags never take another flag as their value", () => {
	assert.equal(readFlag(["--backup", "--apply"], "--backup"), undefined);
	assert.equal(readFlag(["--note"], "--note"), undefined);
	assert.equal(readFlag(["--apply", "--backup", "snap 1"], "--backup"), "snap 1");
});

test("status lists oldest first and flags unfinished runs", () => {
	const out = formatStatus([
		{ name: "b", state: "failed", exitCode: 1, startedAt: new Date("2027-01-02"), how: "runner", gitSha: "abcdef1234", backup: "snap-2", by: "kris" },
		{ name: "a", state: "done", startedAt: new Date("2026-11-01"), how: "recorded", gitSha: "unknown", backup: "", by: "kris", note: "earlier" },
	]).split("\n");
	assert.match(out[0], /2026-11-01 {2}a /);
	assert.doesNotMatch(out[0], /!!/);
	assert.match(out[1], /abcdef1.*backup snap-2.*!! FAILED \(1\)/);
	assert.equal(formatStatus([]), "No migrations recorded in this database.");
});
