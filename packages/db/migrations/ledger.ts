// Rules for the migrations ledger: which data changes ran on which database.
// Pure functions, so they can be tested without a database. The CLI that
// uses them is `migrate.ts` in this folder.

export const LEDGER_COLLECTION = "migrations";

export interface LedgerEntry {
	name: string; // file name without extension, e.g. "plant-catalogue-2026-11"
	appliedAt: Date;
	how: "runner" | "recorded"; // run by migrate.ts, or applied earlier and recorded by hand
	gitSha: string; // commit the script came from ("unknown" if not in a git checkout)
	gitDirty: boolean; // true if the working tree had uncommitted changes
	backup: string; // what backup was taken before applying (snapshot id, time, file)
	by: string; // who ran it
	note?: string;
}

/** Name a migration by its file: "packages/db/migrations/foo-2026-12.ts" → "foo-2026-12". */
export function migrationName(path: string): string {
	const file = path.split(/[\\/]/).pop() ?? path;
	return file.replace(/\.(m?[jt]s)$/, "");
}

const NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Decide whether a run may go ahead.
 * - a dry run is always allowed (it is how a migration is tried);
 * - applying needs a backup reference and a name not already in the ledger;
 * - applying from uncommitted code is refused, so the logged commit is the code that ran.
 */
export function checkRun(opts: {
	name: string;
	apply: boolean;
	backup?: string;
	alreadyApplied: boolean;
	gitDirty: boolean;
}): { ok: true } | { ok: false; error: string } {
	if (!NAME.test(opts.name)) return { ok: false, error: `bad migration name "${opts.name}" (use lower-case letters, digits and dashes)` };
	if (!opts.apply) return { ok: true };
	if (opts.alreadyApplied) {
		return { ok: false, error: `"${opts.name}" is already in this database's ledger. Write a new migration instead of re-running it.` };
	}
	if (!opts.backup?.trim()) {
		return { ok: false, error: `--apply needs --backup "<snapshot id or time>": take a backup first (see MAINTENANCE.md, "Changing the database").` };
	}
	if (opts.gitDirty) {
		return { ok: false, error: "uncommitted changes in the working tree: commit the migration first, so the ledger points at the code that ran." };
	}
	return { ok: true };
}

/** Check a manual record of a migration that was applied before the ledger existed. */
export function checkRecord(opts: { name: string; note?: string; alreadyApplied: boolean }): { ok: true } | { ok: false; error: string } {
	if (!NAME.test(opts.name)) return { ok: false, error: `bad migration name "${opts.name}"` };
	if (opts.alreadyApplied) return { ok: false, error: `"${opts.name}" is already recorded.` };
	if (!opts.note?.trim()) return { ok: false, error: `record needs --note "<who applied it, when, how>"` };
	return { ok: true };
}

/** One line per entry for `migrate.ts status`, oldest first. */
export function formatStatus(entries: LedgerEntry[]): string {
	if (!entries.length) return "No migrations recorded in this database.";
	return [...entries]
		.sort((a, b) => +new Date(a.appliedAt) - +new Date(b.appliedAt))
		.map((e) => {
			const date = new Date(e.appliedAt).toISOString().slice(0, 10);
			const sha = e.gitSha === "unknown" ? "unknown" : e.gitSha.slice(0, 7);
			return `${date}  ${e.name}  (${e.how}, ${sha}${e.gitDirty ? "+dirty" : ""}, by ${e.by}${e.backup ? `, backup ${e.backup}` : ""})${e.note ? ` · ${e.note}` : ""}`;
		})
		.join("\n");
}
