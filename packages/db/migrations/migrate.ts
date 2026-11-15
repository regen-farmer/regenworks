// Run data migrations and keep a ledger of what ran on which database.
// See MAINTENANCE.md, "Changing the database".
//
//   DATABASEURL=... node packages/db/migrations/migrate.ts status
//   DATABASEURL=... node packages/db/migrations/migrate.ts run <file.ts>                       (dry run)
//   DATABASEURL=... node packages/db/migrations/migrate.ts run <file.ts> --apply --backup "<id>"
//   DATABASEURL=... node packages/db/migrations/migrate.ts record <name> --note "<who, when>"
//
// A migration is a standalone script in this folder that starts with the
// line "// migration: dry-run-by-default", reads DATABASEURL, does a dry run by
// default, writes only with --apply and exits non-zero on any error (see
// plant-catalogue-2026-11.ts). The runner starts it as a child process.
//
// On --apply the name is claimed in the ledger first (state "running"; the
// unique index stops a second person applying it at the same time), then set
// to "done" or "failed" when the script ends. `status` and dry runs only read.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, resolve } from "node:path";
import mongoose from "mongoose";
import { LEDGER_COLLECTION, type LedgerEntry, checkRecord, checkRun, formatStatus, migrationName, readFlag } from "./ledger.ts";

const [cmd, target, ...rest] = process.argv.slice(2);
const apply = rest.includes("--apply");

function fail(msg: string): never {
	console.error(msg);
	process.exit(1);
}

const url = process.env.DATABASEURL;
if (!url) fail("Set DATABASEURL");
if (!cmd || !["status", "run", "record"].includes(cmd)) {
	fail("Usage: migrate.ts status | run <file.ts> [--apply --backup <id>] | record <name> --note <text>");
}

function git(cwd: string, args: string[]): string | undefined {
	try {
		return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return undefined;
	}
}

const by = process.env.MIGRATION_BY || userInfo().username;

try {
	await mongoose.connect(url as string);
} catch (e: any) {
	// Not e.message: for a malformed URL it contains the URL, password included.
	fail(`Could not connect to DATABASEURL (${e?.name ?? "error"})`);
}
let exitCode = 0;
try {
	const db = mongoose.connection.db!;
	const ledger = db.collection<LedgerEntry>(LEDGER_COLLECTION);
	const ensureIndex = () => ledger.createIndex({ name: 1 }, { unique: true });
	console.log(`Database: ${db.databaseName}`);

	if (cmd === "status") {
		console.log(formatStatus(await ledger.find({}).toArray()));
	} else if (cmd === "record") {
		if (!target) fail("record needs a migration name");
		const name = migrationName(target);
		const note = readFlag(rest, "--note");
		const check = checkRecord({ name, note, existing: await ledger.findOne({ name }) });
		if (!check.ok) fail(check.error);
		await ensureIndex();
		const now = new Date();
		await ledger.insertOne({ name, state: "done", startedAt: now, finishedAt: now, how: "recorded", gitSha: "unknown", backup: "", by, note });
		console.log(`Recorded ${name} as applied earlier.`);
	} else {
		if (!target) fail("run needs a migration file");
		const file = resolve(target);
		const name = migrationName(file);
		let source = "";
		try {
			source = readFileSync(file, "utf8");
		} catch {
			fail(`cannot read ${file}`);
		}
		const cwd = dirname(file);
		const sha = git(cwd, ["rev-parse", "HEAD"]) ?? "unknown";
		const dirty = (git(cwd, ["status", "--porcelain"]) ?? "") !== "";
		const pushed = sha !== "unknown" && (git(cwd, ["branch", "-r", "--contains", sha]) ?? "") !== "";
		const backup = readFlag(rest, "--backup");
		const check = checkRun({ name, source, apply, backup, existing: await ledger.findOne({ name }), git: { sha, dirty, pushed } });
		if (!check.ok) fail(check.error);

		if (apply) {
			await ensureIndex();
			try {
				await ledger.insertOne({ name, state: "running", startedAt: new Date(), how: "runner", gitSha: sha, backup: backup as string, by, note: readFlag(rest, "--note") });
			} catch (e: any) {
				if (e?.code === 11000) fail(`"${name}" was just claimed by another run. Check \`migrate.ts status\`.`);
				throw e;
			}
		}

		console.log(`${apply ? "Applying" : "Dry run of"} ${name} …\n`);
		const child = spawnSync(process.execPath, [file, ...(apply ? ["--apply"] : [])], { stdio: "inherit", env: process.env });
		const ok = child.status === 0;

		if (apply) {
			await ledger.updateOne(
				{ name },
				{ $set: ok ? { state: "done", finishedAt: new Date() } : { state: "failed", finishedAt: new Date(), exitCode: child.status ?? child.signal ?? "unknown" } },
			);
			console.log(ok ? `\n${name} applied and marked done in the ledger.` : `\n${name} FAILED; marked failed in the ledger. Check the data or restore the backup.`);
		} else {
			console.log(ok ? "\nDry run finished. Nothing recorded." : `\nDry run exited with ${child.status ?? child.signal}.`);
		}
		if (!ok) exitCode = 1;
	}
} finally {
	await mongoose.disconnect();
}
process.exit(exitCode);
