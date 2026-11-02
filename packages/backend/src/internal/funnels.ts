// A · Deals: funnel editor, deal sources and the deal report (pure, tested).
// Funnels and their stages are edited in "Funnels & sources", like Pipedrive.
// Deals point at a stage by its key, so a rename never touches a deal; a
// stage can only be removed once no deal is in it.
import type { IFunnelStage } from "@rw/db/schemas/internal/funnel.ts";

type Stage = Pick<IFunnelStage, "key" | "name" | "kind"> & { targetDays?: number | null };
const KINDS = ["open", "won", "lost"] as const;
const DAY = 86_400_000;

/** Where deals come from (Kris, 2 Nov: ØRD is a source, not a funnel). Editable in the app. */
export const DEFAULT_SOURCES = [
  "ØRD (Omlægningstjek)",
  "FØL agroforestry check",
  "Dairy / co-op supplier",
  "Forest owners' association",
  "Corporate campaign",
  "Website",
  "Ads (Meta, Google)",
  "Newsletter",
  "Referral from a client",
  "Event / farm walk",
  "Own network",
  "Re-purchase",
  "Cold outreach",
  "Other",
];

/** Starting points for a new funnel. */
export const FUNNEL_TEMPLATES: { key: string; name: string; description: string; stages: Stage[] }[] = [
  {
    key: "blank",
    name: "Blank",
    description: "Lead, Won and Lost; add your own stages",
    stages: [
      { key: "lead", name: "Lead", kind: "open" },
      { key: "won", name: "Won", kind: "won" },
      { key: "lost", name: "Lost", kind: "lost" },
    ],
  },
  {
    key: "corporate",
    name: "Corporate pilots",
    description: "Companies funding trees and monitoring",
    stages: [
      { key: "idea", name: "Idea", kind: "open" },
      { key: "researched", name: "Researched", kind: "open" },
      { key: "contact-found", name: "Contact found", kind: "open" },
      { key: "first-contact", name: "First contact", kind: "open" },
      { key: "meeting", name: "Meeting", kind: "open" },
      { key: "proposal", name: "Proposal", kind: "open" },
      { key: "won", name: "Pilot / contract", kind: "won" },
      { key: "lost", name: "Lost", kind: "lost" },
    ],
  },
  {
    key: "forward",
    name: "Forward orders",
    description: "Nursery trees for a later season, 20 % deposit",
    stages: [
      { key: "interest", name: "Interest", kind: "open" },
      { key: "offer", name: "Offer sent", kind: "open" },
      { key: "won", name: "Signed + deposit", kind: "won" },
      { key: "lost", name: "Lost", kind: "lost" },
    ],
  },
];

/** A stage or funnel key from a name: "Meeting / site visit" -> "meeting-site-visit". */
export function keyFrom(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    name
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "stage";
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}-${i}`;
  return key;
}

type Cleaned<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A funnel from the editor: name, description and the stages in order.
 * Existing stages keep their key (sent back as `key`); new ones get one from
 * their name. Needs at least one open, one won and one lost stage, so moves,
 * "offer accepted" and lost reasons keep working. `removed` lists the keys of
 * stages that are no longer there (the route refuses while deals are in them).
 */
export function cleanFunnel(
  body: any,
  existing?: { stages: Stage[]; usedKeys?: string[] },
): Cleaned<{ name: string; description: string; stages: Stage[]; removed: string[]; kindChanged: string[]; usedKeys: string[] }> {
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return { ok: false, error: "The funnel needs a name" };
  if (body?.description !== undefined && body.description !== null && typeof body.description !== "string") return { ok: false, error: "Description must be text" };
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
  if (!Array.isArray(body?.stages) || body.stages.length < 3 || body.stages.length > 20) return { ok: false, error: "A funnel has 3 to 20 stages" };
  const oldKeys = new Set((existing?.stages ?? []).map((s) => s.key));
  const keys = new Set<string>();
  const stages: Stage[] = [];
  for (const [i, s] of body.stages.entries()) {
    const sName = typeof s?.name === "string" ? s.name.trim().slice(0, 80) : "";
    if (!sName) return { ok: false, error: `Stage ${i + 1} needs a name` };
    if (!KINDS.includes(s?.kind)) return { ok: false, error: `Stage ${i + 1}: kind must be open, won or lost` };
    let key: string;
    if (s?.key !== undefined && s.key !== null && s.key !== "") {
      if (typeof s.key !== "string" || !oldKeys.has(s.key)) return { ok: false, error: `Stage ${i + 1}: unknown stage` };
      if (keys.has(s.key)) return { ok: false, error: `Stage ${i + 1} appears twice` };
      key = s.key;
    } else {
      key = keyFrom(sName, [...oldKeys, ...keys, ...(existing?.usedKeys ?? [])]);
    }
    let targetDays: number | null = null;
    if (s?.targetDays !== undefined && s.targetDays !== null && s.targetDays !== "") {
      const n = typeof s.targetDays === "number" ? s.targetDays : typeof s.targetDays === "string" ? Number(s.targetDays) : NaN;
      if (!Number.isInteger(n) || n < 1 || n > 365) return { ok: false, error: `Stage ${i + 1}: target time must be 1 to 365 days` };
      targetDays = s.kind === "open" ? n : null;
    }
    keys.add(key);
    stages.push({ key, name: sName, kind: s.kind, targetDays });
  }
  for (const kind of KINDS) if (!stages.some((s) => s.kind === kind)) return { ok: false, error: `A funnel needs at least one ${kind} stage` };
  if (stages[0].kind !== "open") return { ok: false, error: "The first stage must be an open stage (new deals start there)" };
  const oldKind = new Map((existing?.stages ?? []).map((s) => [s.key, s.kind]));
  return {
    ok: true,
    value: {
      name,
      description,
      stages,
      removed: [...oldKeys].filter((k) => !keys.has(k)),
      // a stage that changes between open, won and lost: its deals would no longer match it
      kindChanged: stages.filter((s) => oldKind.has(s.key) && oldKind.get(s.key) !== s.kind).map((s) => s.key),
      usedKeys: [...new Set([...(existing?.usedKeys ?? []), ...oldKeys, ...keys])],
    },
  };
}

/** The deal sources list from Settings: 1–50 unique names. */
export function cleanSources(body: any): Cleaned<string[]> {
  if (!Array.isArray(body?.sources) || body.sources.length < 1 || body.sources.length > 50) return { ok: false, error: "Send 1 to 50 sources" };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of body.sources) {
    if (typeof s !== "string") return { ok: false, error: "Sources must be text" };
    const v = s.trim().slice(0, 100);
    if (!v) continue;
    if (seen.has(v.toLowerCase())) return { ok: false, error: `"${v}" is in the list twice` };
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.length ? { ok: true, value: out } : { ok: false, error: "Send at least one source" };
}

type HistoryEntry = { stage: string; funnel?: unknown; status?: string; at: Date | string };
type DealLike = {
  _id?: unknown;
  funnel: unknown;
  stage: string;
  status: string;
  source?: string;
  value?: number | null;
  archived?: boolean;
  createdAt?: Date | string;
  history?: HistoryEntry[];
};

/** When the deal came into its current stage (the last move there), else when it was made. */
export function stageSince(deal: DealLike): string | null {
  const h = [...(deal.history ?? [])].reverse().find((e) => e.stage === deal.stage && (e.funnel === undefined || String(e.funnel) === String(deal.funnel)));
  const at = h?.at ?? deal.createdAt;
  return at ? new Date(at).toISOString() : null;
}

/** Whole days in the current stage, and whether that's past the stage's target. */
export function stageAge(deal: DealLike, stage: Stage | undefined, now = new Date()) {
  const since = stageSince(deal);
  const days = since ? Math.floor((now.getTime() - new Date(since).getTime()) / DAY) : null;
  const over = deal.status === "open" && !!stage?.targetDays && days !== null && days > stage.targetDays;
  return { since, days, over };
}

const winRate = (won: number, lost: number) => (won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : null);

/**
 * Deals by source (all funnels) and per funnel: win rate, and per stage how
 * many deals came in, how many moved on, and the average days spent there
 * (from the history; a stay ends at the next move). Optional period on the
 * deal's creation date. Archived deals count: they were real deals.
 */
export function dealReport(deals: DealLike[], funnels: { _id: unknown; name: string; stages: Stage[] }[], period: { from?: Date | null; to?: Date | null } = {}, now = new Date()) {
  const inPeriod = deals.filter((d) => {
    const c = d.createdAt ? new Date(d.createdAt).getTime() : NaN;
    if (period.from && !(c >= period.from.getTime())) return false;
    if (period.to && !(c < period.to.getTime() + DAY)) return false;
    return true;
  });
  // by source
  const src = new Map<string, { source: string; deals: number; open: number; won: number; lost: number; value: number; wonValue: number }>();
  for (const d of inPeriod) {
    const k = d.source?.trim() || "(no source)";
    const s = src.get(k) ?? { source: k, deals: 0, open: 0, won: 0, lost: 0, value: 0, wonValue: 0 };
    s.deals += 1;
    if (d.status === "won") {
      s.won += 1;
      s.wonValue += d.value ?? 0;
    } else if (d.status === "lost") s.lost += 1;
    else s.open += 1;
    s.value += d.value ?? 0;
    src.set(k, s);
  }
  const bySource = [...src.values()].map((s) => ({ ...s, winRate: winRate(s.won, s.lost) })).sort((a, b) => b.deals - a.deals || a.source.localeCompare(b.source));

  // by funnel and stage
  const byFunnel = funnels.map((f) => {
    const fid = String(f._id);
    const mine = inPeriod.filter((d) => String(d.funnel) === fid);
    const stats = new Map(f.stages.map((s) => [s.key, { entered: 0, movedOn: 0, days: 0, stays: 0, now: 0 }]));
    for (const d of inPeriod) {
      const hist = (d.history ?? []).filter((e) => e.at);
      for (const [i, e] of hist.entries()) {
        if (e.funnel !== undefined && String(e.funnel) !== fid) continue;
        if (e.funnel === undefined && String(d.funnel) !== fid) continue;
        const st = stats.get(e.stage);
        if (!st) continue;
        st.entered += 1;
        const next = hist[i + 1];
        const end = next ? new Date(next.at) : null;
        if (end) {
          st.movedOn += 1;
          st.days += (end.getTime() - new Date(e.at).getTime()) / DAY;
          st.stays += 1;
        } else if (d.status === "open" && !d.archived) {
          // still there: counts towards the average so slow stages show
          st.days += (now.getTime() - new Date(e.at).getTime()) / DAY;
          st.stays += 1;
        }
      }
    }
    for (const d of mine) if (!d.archived && stats.has(d.stage)) stats.get(d.stage)!.now += 1;
    const won = mine.filter((d) => d.status === "won").length;
    const lost = mine.filter((d) => d.status === "lost").length;
    return {
      _id: f._id,
      name: f.name,
      deals: mine.length,
      won,
      lost,
      winRate: winRate(won, lost),
      stages: f.stages.map((s) => {
        const st = stats.get(s.key)!;
        return {
          key: s.key,
          name: s.name,
          kind: s.kind,
          targetDays: s.targetDays ?? null,
          entered: st.entered,
          movedOn: st.movedOn,
          now: st.now,
          avgDays: s.kind === "open" && st.stays ? Math.round((st.days / st.stays) * 10) / 10 : null,
        };
      }),
    };
  });
  return { deals: inPeriod.length, bySource, byFunnel, truncated: false };
}

/**
 * Why an open deal needs attention today: next action overdue or missing,
 * longer in its stage than the stage's target, expected close passed or
 * within two weeks. Empty when it's fine.
 */
export function attentionReasons(
  deal: DealLike & { nextAction?: { text?: string; date?: Date | string | null }; expectedClose?: Date | string | null },
  stage: Stage | undefined,
  now = new Date(),
) {
  const out: { key: "overdue" | "no-action" | "slow" | "closing" | "close-passed"; text: string }[] = [];
  if (deal.status !== "open" || deal.archived) return out;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const next = deal.nextAction?.date ? new Date(deal.nextAction.date) : null;
  if (next && next.getTime() < today.getTime()) out.push({ key: "overdue", text: "Next action overdue" });
  if (!next) out.push({ key: "no-action", text: "No next action" });
  const age = stageAge(deal, stage, now);
  if (age.over) out.push({ key: "slow", text: `${age.days} days in ${stage?.name ?? "stage"} (target ${stage?.targetDays})` });
  const close = deal.expectedClose ? new Date(deal.expectedClose) : null;
  if (close && close.getTime() < today.getTime()) out.push({ key: "close-passed", text: "Expected close has passed" });
  else if (close && close.getTime() - today.getTime() <= 14 * DAY) out.push({ key: "closing", text: "Expected to close within 2 weeks" });
  return out;
}
