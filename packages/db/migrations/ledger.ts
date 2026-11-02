// Rules for the migrations ledger: which data changes ran on which database.
// Pure functions, so they can be tested without a database. The CLI that
// uses them is `migrate.ts` in this folder.

export const LEDGER_COLLECTION = "migrations";

/** First line a migration script must carry, so the runner only starts scripts written to dry-run by default. */
export const MARKER = "// migration: dry-run-by-default";

export type LedgerState = "running" | "done" | "failed";

export interface LedgerEntry {
	name: string; // file name without extension, e.g. "plant-catalogue-2026-11"
	state: LedgerState; // "running" is written before the script starts, so a crash leaves a trace
	startedAt: Date;
	finishedAt?: Date;
	exitCode?: number | string; // for "failed": exit code or signal
	how: "runner" | "recorded"; // run by migrate.ts, or applied earlier and recorded by hand
	gitSha: string; // commit the script came from ("unknown" only for recorded entries)
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

type Check = { ok: true } | { ok: false; error: string };

/** The script must start with the marker line (leading blank lines allowed). */
export function hasMarker(source: string): boolean {
	return source.trimStart().startsWith(MARKER);
}

/**
 * Decide whether a run may go ahead.
 * - a dry run is allowed for any marked script (it is how a migration is tried);
 * - applying needs a backup reference, a name with no ledger entry in any state,
 *   and committed code that has been pushed, so the logged commit is the code that ran.
 */
export function checkRun(opts: {
	name: string;
	source: string;
	apply: boolean;
	backup?: string;
	existing?: Pick<LedgerEntry, "state"> | null;
	git: { sha: string; dirty: boolean; pushed: boolean };
}): Check {
	if (!NAME.test(opts.name)) return { ok: false, error: `bad migration name "${opts.name}" (use lower-case letters, digits and dashes)` };
	if (!hasMarker(opts.source)) {
		return { ok: false, error: `the script does not start with "${MARKER}". Only scripts that dry-run by default and write only with --apply may run here.` };
	}
	if (!opts.apply) return { ok: true };
	if (opts.existing) {
		const why =
			opts.existing.state === "done"
				? "is already applied in this database. Write a new migration instead of re-running it."
				: opts.existing.state === "running"
					? "is marked as running (someone else may be applying it, or a run crashed). Check before doing anything."
					: "failed earlier. Restore the backup or check the data, then delete its ledger entry by hand before trying again.";
		return { ok: false, error: `"${opts.name}" ${why}` };
	}
	if (!opts.backup?.trim()) {
		return { ok: false, error: `--apply needs --backup "<snapshot id or time>": take a backup first (see MAINTENANCE.md, "Changing the database").` };
	}
	if (opts.git.sha === "unknown") return { ok: false, error: "not in a git checkout: apply from a clone of the repository." };
	if (opts.git.dirty) {
		return { ok: false, error: "uncommitted changes in the working tree: commit the migration first, so the ledger points at the code that ran." };
	}
	if (!opts.git.pushed) return { ok: false, error: "this commit is not on any remote branch: push it first, so others can see the code that ran." };
	return { ok: true };
}

/** Check a manual record of a migration that was applied before the ledger existed. */
export function checkRecord(opts: { name: string; note?: string; existing?: Pick<LedgerEntry, "state"> | null }): Check {
	if (!NAME.test(opts.name)) return { ok: false, error: `bad migration name "${opts.name}"` };
	if (opts.existing) return { ok: false, error: `"${opts.name}" is already in the ledger (${opts.existing.state}).` };
	if (!opts.note?.trim()) return { ok: false, error: `record needs --note "<who applied it, when, where>"` };
	return { ok: true };
}

/** Read `--flag value` from argv; a missing value or one that is another flag counts as absent. */
export function readFlag(args: string[], flag: string): string | undefined {
	const i = args.indexOf(flag);
	const v = i >= 0 ? args[i + 1] : undefined;
	return v === undefined || v.startsWith("--") ? undefined : v;
}

/** One line per entry for `migrate.ts status`, oldest first; entries that are not done are flagged. */
export function formatStatus(entries: LedgerEntry[]): string {
	if (!entries.length) return "No migrations recorded in this database.";
	return [...entries]
		.sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt))
		.map((e) => {
			const date = new Date(e.startedAt).toISOString().slice(0, 10);
			const sha = e.gitSha === "unknown" ? "unknown" : e.gitSha.slice(0, 7);
			const flag = e.state === "done" ? "" : `  !! ${e.state.toUpperCase()}${e.exitCode !== undefined ? ` (${e.exitCode})` : ""}`;
			return `${date}  ${e.name}  (${e.how}, ${sha}, by ${e.by}${e.backup ? `, backup ${e.backup}` : ""})${e.note ? ` · ${e.note}` : ""}${flag}`;
		})
		.join("\n");
}
