// Tree register (pure, tested): trees from a design with the same IDs as the
// RTK stake-out files, per-tree checks (status and cause of death), and
// survival per row and field. For following mortality from the first season,
// e.g. the guarantee count on 1 September.
import { plantLabel, stakeoutTrees } from "@rw/modelling/planting/stakeout.ts";

export { defaultPrefix } from "@rw/modelling/planting/stakeout.ts";

export const TREE_STATUSES = ["alive", "weak", "dead", "missing"] as const;
export type TreeStatus = (typeof TREE_STATUSES)[number];

/** Causes of death or damage, as Grove sees them in the field. */
export const CAUSES = [
  ["drought", "Drought"],
  ["waterlogging", "Waterlogging"],
  ["deer", "Deer browsing"],
  ["hare", "Hare or rabbit"],
  ["voles", "Voles or mice"],
  ["weeds", "Weeds or grass competition"],
  ["frost", "Frost"],
  ["wind", "Wind"],
  ["machine", "Mower or machine"],
  ["planting", "Planting fault"],
  ["plant-quality", "Poor plant quality"],
  ["disease", "Disease or pests"],
  ["unknown", "Unknown"],
  ["other", "Other (see note)"],
] as const;
const CAUSE_KEYS: readonly string[] = CAUSES.map(([k]) => k);

/** The most history entries kept per tree. */
export const HISTORY_MAX = 50;

export type RegisterTree = { name: string; row: number; tree: number; species: string; label: string; lon: number; lat: number };

/**
 * Every tree of a laid-out design, named and ordered exactly like the stake-out
 * files (so a stake, the register and an as-staked file share the ID).
 */
export function treesFromLayout(
  layout: { treeMarkerArray?: any[]; treeRowLines?: any[] },
  names: { varieties: Record<string, string>; rootstocks: Record<string, string> },
  prefix: string,
): RegisterTree[] {
  const rows = stakeoutTrees(layout, {
    prefix,
    labelOf: (t) => plantLabel(t, names),
  });
  return rows.flatMap((r) => r.trees.map((t) => ({ name: t.name, row: t.row, tree: t.tree, species: t.species, label: t.label, lon: t.lon, lat: t.lat })));
}

export type TreeCheck = { status?: TreeStatus; cause?: string | null; note?: string; replanted?: boolean };

/**
 * One check of one tree. A dead or missing tree may have a cause; alive trees
 * lose the cause. "Replanted" sets the tree alive again and counts it.
 */
export function cleanTreeCheck(body: any): { ok: true; value: TreeCheck } | { ok: false; error: string } {
  const out: TreeCheck = {};
  if (body?.status !== undefined) {
    if (!TREE_STATUSES.includes(body.status)) return { ok: false, error: `Status must be one of ${TREE_STATUSES.join(", ")}` };
    out.status = body.status;
  }
  if (body?.cause !== undefined && body.cause !== null && body.cause !== "") {
    if (typeof body.cause !== "string" || !CAUSE_KEYS.includes(body.cause)) return { ok: false, error: "Unknown cause" };
    out.cause = body.cause;
  } else if (body?.cause === null || body?.cause === "") out.cause = null;
  if (body?.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") return { ok: false, error: "Note must be text" };
    out.note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  }
  if (body?.replanted !== undefined) {
    if (typeof body.replanted !== "boolean") return { ok: false, error: "Replanted must be true or false" };
    if (body.replanted) {
      out.replanted = true;
      out.status = "alive";
      out.cause = null;
    }
  }
  if (out.status === "alive") out.cause = null;
  if (out.status === undefined && out.cause === undefined && out.note === undefined && !out.replanted) return { ok: false, error: "Send a status, cause, note or replanted" };
  return { ok: true, value: out };
}

/** The MongoDB update for a check: current values plus a history entry (newest kept). */
export function checkUpdate(check: TreeCheck, by: unknown, at = new Date()) {
  const set: Record<string, unknown> = { checkedAt: at, checkedBy: by ?? null };
  const unset: Record<string, ""> = {};
  if (check.status !== undefined) set.status = check.status;
  if (check.cause === null) unset.cause = "";
  else if (check.cause !== undefined) set.cause = check.cause;
  if (check.note !== undefined) set.note = check.note;
  const entry: Record<string, unknown> = { at, by: by ?? undefined };
  if (check.status !== undefined) entry.status = check.status;
  if (check.cause) entry.cause = check.cause;
  if (check.note) entry.note = check.note;
  if (check.replanted) entry.replanted = true;
  return {
    $set: set,
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
    ...(check.replanted ? { $inc: { replanted: 1 } } : {}),
    $push: { history: { $each: [entry], $slice: -HISTORY_MAX } },
  };
}

type TreeLike = { row: number; status: string; cause?: string | null; checkedAt?: Date | string | boolean | null; replanted?: number; n?: number };

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : null);

/**
 * Survival per row and for the field, over the trees someone has looked at:
 * trees logged one by one, and every tree in a row marked walked. A register
 * nobody has walked has no survival yet (not 100 %). Survival counts alive and
 * weak trees; mortality dead and missing. Causes count dead, missing and weak
 * trees. `n` lets grouped counts (from an aggregation) be passed in.
 */
export function survival(trees: TreeLike[], walkedRows: Iterable<number> = []) {
  const walked = new Set(walkedRows);
  type Acc = { total: number; seen: number; alive: number; weak: number; dead: number; missing: number; checked: number; replanted: number; causes: Record<string, number> };
  const empty = (): Acc => ({ total: 0, seen: 0, alive: 0, weak: 0, dead: 0, missing: 0, checked: 0, replanted: 0, causes: {} });
  const all = empty();
  const rows = new Map<number, Acc>();
  for (const t of trees) {
    const n = t.n ?? 1;
    const r = rows.get(t.row) ?? empty();
    const seen = !!t.checkedAt || walked.has(t.row);
    for (const a of [all, r]) {
      a.total += n;
      if (t.checkedAt) a.checked += n;
      a.replanted += t.replanted ?? 0;
      if (!seen) continue;
      a.seen += n;
      if (t.status === "weak") a.weak += n;
      else if (t.status === "dead") a.dead += n;
      else if (t.status === "missing") a.missing += n;
      else a.alive += n;
      if (t.cause && t.status !== "alive") a.causes[t.cause] = (a.causes[t.cause] ?? 0) + n;
    }
    rows.set(t.row, r);
  }
  const shape = (a: Acc) => ({ ...a, survivalPct: pct(a.alive + a.weak, a.seen), mortalityPct: pct(a.dead + a.missing, a.seen) });
  return {
    field: { ...shape(all), rowsWalked: [...rows.keys()].filter((k) => walked.has(k)).length },
    rows: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([row, a]) => ({ row, walked: walked.has(row), ...shape(a) })),
  };
}

/**
 * Keeps a spreadsheet from running a cell as a formula (leading = + - @, tab
 * or return, also after spaces) and quotes it for CSV. For text columns.
 */
export function csvText(v: unknown) {
  let s = String(v ?? "").replace(/[\r\n]+/g, " ");
  while (/^[\s=+\-@]/.test(s)) s = s.replace(/^[\s=+\-@]+/, "");
  return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The trees nearest a point (metres, small distances), for "which tree am I at?" on a phone. */
export function nearest<T extends { lon: number; lat: number }>(trees: T[], lon: number, lat: number, count = 5) {
  const k = Math.cos((lat * Math.PI) / 180);
  return trees
    .map((t) => ({ t, m: Math.hypot((t.lon - lon) * k, t.lat - lat) * 111_320 }))
    .sort((a, b) => a.m - b.m)
    .slice(0, count)
    .map(({ t, m }) => ({ ...t, distanceM: Math.round(m * 10) / 10 }));
}
