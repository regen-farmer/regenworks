// A · Clients & deals: pure logic (tested). Input cleaning for clients and
// deals, default funnels, stage moves, card order, and the one-off import
// of Dashboard projects.
import { CLIENT_KINDS } from "@rw/db/schemas/internal/client.ts";
import type { IFunnelStage } from "@rw/db/schemas/internal/funnel.ts";

type Cleaned<T> = { ok: true; value: T } | { ok: false; errors: string[] };
type Stage = Pick<IFunnelStage, "key" | "name" | "kind">;
type FunnelLike = { _id?: unknown; key?: string; stages: Stage[] };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
export const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v);

function dateOrNull(v: unknown, name: string, errors: string[]) {
  if (v === null || v === "") return null;
  if (typeof v !== "string" && typeof v !== "number") {
    errors.push(`${name} is not a date`);
    return undefined;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    errors.push(`${name} is not a date`);
    return undefined;
  }
  return d;
}

function idOrNull(v: unknown, name: string, errors: string[]) {
  if (v === null || v === "") return null;
  if (!isId(v)) {
    errors.push(`${name} is not a valid id`);
    return undefined;
  }
  return v;
}

/** The four funnels Grove starts with (Kris, 2 Nov). Stages can be edited later. */
const lead = { key: "lead", name: "Lead", kind: "open" } as const;
const contacted = { key: "contacted", name: "Contacted", kind: "open" } as const;
const won = { key: "won", name: "Won", kind: "won" } as const;
const lost = { key: "lost", name: "Lost", kind: "lost" } as const;
export const DEFAULT_FUNNELS = [
  {
    key: "design",
    name: "Design clients",
    description: "Design only",
    order: 1,
    stages: [lead, contacted, { key: "meeting", name: "Meeting / site visit", kind: "open" }, { key: "offer", name: "Offer sent", kind: "open" }, won, lost],
  },
  {
    key: "tree-sales",
    name: "Tree sales",
    description: "Trees only, incl. forward orders",
    order: 2,
    stages: [lead, { key: "quote", name: "Quote sent", kind: "open" }, { key: "negotiation", name: "Negotiation", kind: "open" }, won, lost],
  },
  {
    key: "development",
    name: "Project development",
    description: "Design, trees and planting",
    order: 3,
    stages: [lead, contacted, { key: "meeting", name: "Meeting / site visit", kind: "open" }, { key: "offer", name: "Offer sent", kind: "open" }, { key: "negotiation", name: "Negotiation", kind: "open" }, won, lost],
  },
  {
    key: "management",
    name: "Management clients",
    description: "Care and management contracts",
    order: 4,
    stages: [lead, { key: "meeting", name: "Meeting", kind: "open" }, { key: "offer", name: "Offer sent", kind: "open" }, won, lost],
  },
] as const;

export const stageOf = (funnel: FunnelLike, key: unknown): Stage | undefined =>
  typeof key === "string" ? funnel.stages.find((s) => s.key === key) : undefined;
export const firstOpenStage = (funnel: FunnelLike): Stage | undefined => funnel.stages.find((s) => s.kind === "open") ?? funnel.stages[0];
export const firstStageOfKind = (funnel: FunnelLike, kind: Stage["kind"]): Stage | undefined => funnel.stages.find((s) => s.kind === kind);

/** Fields that can be set on a client; everything else is ignored. */
export function cleanClient(body: any, { creating = false } = {}): Cleaned<Record<string, any>> {
  const errors: string[] = [];
  const out: Record<string, any> = {};
  if (body?.name !== undefined || creating) {
    const name = text(body?.name, 200);
    if (!name) errors.push("Client name is required");
    else out.name = name;
  }
  if (body?.kind !== undefined) {
    if (!(CLIENT_KINDS as readonly unknown[]).includes(body.kind)) errors.push("Unknown client kind");
    else out.kind = body.kind;
  }
  for (const [k, max] of [["contactPerson", 200], ["email", 200], ["phone", 50], ["address", 300], ["region", 100], ["source", 100], ["notes", 5000]] as const) {
    if (body?.[k] === undefined) continue;
    if (body[k] !== null && typeof body[k] !== "string") errors.push(`${k} must be text`);
    else out[k] = text(body[k] ?? "", max);
  }
  if (body?.archived !== undefined) {
    if (typeof body.archived !== "boolean") errors.push("archived must be true or false");
    else out.archived = body.archived;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

/**
 * Fields that can be set on a deal with a plain edit. Funnel, stage, status
 * and order only change through a move (see moveDeal), so history stays right.
 */
export function cleanDeal(body: any, { creating = false } = {}): Cleaned<Record<string, any>> {
  const errors: string[] = [];
  const out: Record<string, any> = {};
  if (body?.title !== undefined || creating) {
    const title = text(body?.title, 200);
    if (!title) errors.push("Title is required");
    else out.title = title;
  }
  if (body?.value !== undefined) {
    if (body.value === null || body.value === "") out.value = null;
    else {
      const n = typeof body.value === "number" ? body.value : typeof body.value === "string" ? Number(body.value) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) errors.push("Value must be a number from 0 to 1,000,000,000");
      else out.value = Math.round(n);
    }
  }
  if (body?.expectedClose !== undefined) {
    const d = dateOrNull(body.expectedClose, "Expected close", errors);
    if (d !== undefined) out.expectedClose = d;
  }
  for (const [k, label] of [["client", "Client"], ["owner", "Owner"], ["farm", "Farm"], ["groveProject", "Project"]] as const) {
    if (body?.[k] === undefined) continue;
    const id = idOrNull(body[k], label, errors);
    if (id !== undefined) out[k] = id;
  }
  if (out.client === null) errors.push("A deal needs a client");
  for (const [k, max] of [["source", 100], ["sourceDetail", 200], ["lostReason", 500], ["notes", 5000]] as const) {
    if (body?.[k] === undefined) continue;
    if (body[k] !== null && typeof body[k] !== "string") errors.push(`${k} must be text`);
    else out[k] = text(body[k] ?? "", max);
  }
  if (body?.nextAction !== undefined) {
    const n = body.nextAction;
    if (n === null || typeof n !== "object" || Array.isArray(n)) errors.push("Next action must be an object");
    else {
      const next: Record<string, any> = {};
      if (n.text !== undefined) {
        if (n.text !== null && typeof n.text !== "string") errors.push("Next action text must be text");
        else next.text = text(n.text ?? "", 500);
      }
      if (n.date !== undefined) {
        const d = dateOrNull(n.date, "Next action date", errors);
        if (d !== undefined) next.date = d;
      }
      out.nextAction = next;
    }
  }
  if (body?.archived !== undefined) {
    if (typeof body.archived !== "boolean") errors.push("archived must be true or false");
    else out.archived = body.archived;
  }
  if (body?.forwardOrder !== undefined) {
    if (typeof body.forwardOrder !== "boolean") errors.push("forwardOrder must be true or false");
    else out.forwardOrder = body.forwardOrder;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

/**
 * What changes when a deal moves to `stageKey` of `funnel`. Null if the
 * stage doesn't exist. Won/lost dates are set when the status changes and
 * cleared when a deal is reopened; the move is added to the history.
 */
export function moveDeal(
  deal: { stage?: string; funnel?: unknown; status?: string; history?: any[]; lostReason?: string },
  funnel: FunnelLike,
  stageKey: unknown,
  { now = new Date(), by = null as unknown, lostReason = undefined as string | undefined, note = undefined as string | undefined } = {},
) {
  const stage = stageOf(funnel, stageKey);
  if (!stage) return null;
  const sameFunnel = String(deal.funnel ?? "") === String(funnel._id ?? "");
  const changed = !sameFunnel || deal.stage !== stage.key;
  const status = stage.kind;
  const patch: Record<string, any> = { funnel: funnel._id, stage: stage.key, status };
  if (status !== deal.status) {
    patch.wonAt = status === "won" ? now : null;
    patch.lostAt = status === "lost" ? now : null;
  }
  if (status === "lost" && lostReason !== undefined) patch.lostReason = lostReason.trim().slice(0, 500);
  if (status === "open" && deal.status !== "open") patch.lostReason = "";
  if (changed) {
    const entry: Record<string, any> = { stage: stage.key, funnel: funnel._id, status, at: now, by };
    if (note) entry.note = note.slice(0, 200);
    patch.history = [...(deal.history ?? []), entry].slice(-200);
  }
  return { patch, changed, wonNow: status === "won" && deal.status !== "won", stage };
}

/**
 * New card order for a stage: `ids` as they are now (top to bottom), with
 * `moving` taken out and put in front of `beforeId` (or at the end when
 * beforeId is missing or not in the stage).
 */
export function reorder(ids: string[], moving: string, beforeId?: string | null): string[] {
  const rest = ids.filter((id) => id !== moving);
  const at = beforeId ? rest.indexOf(beforeId) : -1;
  if (at < 0) return [...rest, moving];
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

/**
 * Dashboard project → which funnel and stage its deal goes into. Projects
 * still in screening or design are open sales; later ones were sold.
 * (Old stage names from before 2 Nov are understood too.)
 */
export function dealPlaceForProject(p: { type?: string; stage?: string }): { funnel: string; stage: string; status: "open" | "won" | "lost" } {
  const funnel = p.type === "tree-sale" ? "tree-sales" : p.type === "own" ? "management" : "development";
  if (p.stage === "prospect" || p.stage === "screening") return { funnel, stage: "lead", status: "open" };
  if (p.stage === "design-offer" || p.stage === "design" || p.stage === "economics") return { funnel, stage: funnel === "tree-sales" ? "quote" : "offer", status: "open" };
  // preparation, planting, handed over: the sale is won; the work continues in B and C
  return { funnel, stage: "won", status: "won" };
}

/** Escape text for a case-insensitive "contains" search. */
export const searchPattern = (q: string) => new RegExp(q.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/**
 * May an imported project reuse an existing client of the same name? Only
 * if their contact details don't contradict each other (two different
 * emails or phones mean two different people).
 */
export function sameClient(a: { email?: string; phone?: string }, b: { email?: string; phone?: string }) {
  const norm = (v?: string) => (v ?? "").trim().toLowerCase();
  const digits = (v?: string) => (v ?? "").replace(/\D/g, "");
  if (norm(a.email) && norm(b.email) && norm(a.email) !== norm(b.email)) return false;
  if (digits(a.phone) && digits(b.phone) && digits(a.phone) !== digits(b.phone)) return false;
  return true;
}
