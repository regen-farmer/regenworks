// Run data migrations and keep a ledger of what ran on which database.
// See MAINTENANCE.md, "Changing the database".
//
//   DATABASEURL=... node packages/db/migrations/migrate.ts status
//   DATABASEURL=... node packages/db/migrations/migrate.ts run <file.ts>                       (dry run)
//   DATABASEURL=... node packages/db/migrations/migrate.ts run <file.ts> --apply --backup "<id>"
//   DATABASEURL=... node packages/db/migrations/migrate.ts record <name> --note "<who, when>"
//
// A migration is a standalone script in this folder that reads DATABASEURL,
// does a dry run by default and writes only with --apply (like
// plant-catalogue-2026-11.ts). The runner starts it as a child process, and
// writes a ledger entry only if the applied run exits cleanly.
import { spawnSync, execFileSync } from "node:child_process";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import mongoose from "mongoose";
import { LEDGER_COLLECTION, type LedgerEntry, checkRecord, checkRun, formatStatus, migrationName } from "./ledger.ts";

const [cmd, target, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
	const i = rest.indexOf(name);
	return i >= 0 ? rest[i + 1] : undefined;
};
const apply = rest.includes("--apply");

const url = process.env.DATABASEURL;
if (!url) fail("Set DATABASEURL");
if (!cmd || !["status", "run", "record"].includes(cmd)) {
	fail("Usage: migrate.ts status | run <file.ts> [--apply --backup <id>] | record <name> --note <text>");
}

function fail(msg: string): never {
	console.error(msg);
	process.exit(1);
}

function git(args: string[]): string | undefined {
	try {
		return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return undefined;
	}
}

const by = process.env.MIGRATION_BY || userInfo().username;

await mongoose.connect(url as string);
try {
	const db = mongoose.connection.db!;
	const ledger = db.collection<LedgerEntry>(LEDGER_COLLECTION);
	await ledger.createIndex({ name: 1 }, { unique: true });
	console.log(`Database: ${db.databaseName}`);

	if (cmd === "status") {
		console.log(formatStatus(await ledger.find({}).toArray()));
	} else if (cmd === "record") {
		if (!target) fail("record needs a migration name");
		const name = migrationName(target);
		const note = flag("--note");
		const check = checkRecord({ name, note, alreadyApplied: !!(await ledger.findOne({ name })) });
		if (!check.ok) fail(check.error);
		await ledger.insertOne({ name, appliedAt: new Date(), how: "recorded", gitSha: "unknown", gitDirty: false, backup: "", by, note });
		console.log(`Recorded ${name} as applied earlier.`);
	} else {
		if (!target) fail("run needs a migration file");
		const file = resolve(target);
		const name = migrationName(file);
		const gitSha = git(["rev-parse", "HEAD"]) ?? "unknown";
		const gitDirty = (git(["status", "--porcelain"]) ?? "") !== "";
		const backup = flag("--backup");
		const check = checkRun({ name, apply, backup, alreadyApplied: !!(await ledger.findOne({ name })), gitDirty });
		if (!check.ok) fail(check.error);

		console.log(`${apply ? "Applying" : "Dry run of"} ${name} …\n`);
		const child = spawnSync(process.execPath, [file, ...(apply ? ["--apply"] : [])], { stdio: "inherit", env: process.env });
		if (child.status !== 0) fail(`\n${name} exited with ${child.status ?? child.signal}; nothing recorded.`);

		if (apply) {
			await ledger.insertOne({ name, appliedAt: new Date(), how: "runner", gitSha, gitDirty, backup: backup as string, by, note: flag("--note") });
			console.log(`\nRecorded ${name} in the ledger.`);
		} else {
			console.log(`\nDry run finished. Nothing recorded.`);
		}
	}
} finally {
	await mongoose.disconnect();
}
