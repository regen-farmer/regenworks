// Tree register (pure, tested): trees from a design with the same IDs as the
// RTK stake-out files, per-tree checks (status and cause of death), and
// survival per row and field. For following mortality from the first season,
// e.g. the guarantee count on 1 September.
import { cleanPrefix, stakeoutTrees } from "@rw/modelling/planting/stakeout.ts";

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

/** "Mark 1 Hassel" -> "M1H", as the stake-out export suggests. */
export const defaultPrefix = (name: string | undefined) =>
  cleanPrefix(
    (name ?? "")
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase())
      .join(""),
  ).slice(0, 4);

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
    labelOf: (t) => {
      const species = t.species?.nameCommon || [t.species?.genus, t.species?.species].filter(Boolean).join(" ") || "Tree";
      const cultivar = t.variety ? names.varieties[t.variety] : undefined;
      const rootstock = t.rootstock ? names.rootstocks[t.rootstock] : undefined;
      let label = cultivar ? `${species} ${cultivar}` : species;
      if (rootstock) label += ` on ${rootstock}`;
      else if (t.ownRoots) label += " own roots";
      if (t.organic === true) label += " (organic)";
      return { label, species };
    },
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

type TreeLike = { row: number; status: string; cause?: string | null; checkedAt?: Date | string | null; replanted?: number };

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : null);

/**
 * Survival per row and for the field. Survival counts alive and weak trees;
 * mortality counts dead and missing. Causes are counted over dead, missing
 * and weak trees.
 */
export function survival(trees: TreeLike[]) {
  type Acc = { total: number; alive: number; weak: number; dead: number; missing: number; checked: number; replanted: number; causes: Record<string, number> };
  const empty = (): Acc => ({ total: 0, alive: 0, weak: 0, dead: 0, missing: 0, checked: 0, replanted: 0, causes: {} });
  const all = empty();
  const rows = new Map<number, Acc>();
  for (const t of trees) {
    const r = rows.get(t.row) ?? empty();
    for (const a of [all, r]) {
      a.total += 1;
      if (t.status === "weak") a.weak += 1;
      else if (t.status === "dead") a.dead += 1;
      else if (t.status === "missing") a.missing += 1;
      else a.alive += 1;
      if (t.checkedAt) a.checked += 1;
      a.replanted += t.replanted ?? 0;
      if (t.cause && t.status !== "alive") a.causes[t.cause] = (a.causes[t.cause] ?? 0) + 1;
    }
    rows.set(t.row, r);
  }
  const shape = (a: Acc) => ({ ...a, survivalPct: pct(a.alive + a.weak, a.total), mortalityPct: pct(a.dead + a.missing, a.total) });
  return {
    field: shape(all),
    rows: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([row, a]) => ({ row, ...shape(a) })),
  };
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
