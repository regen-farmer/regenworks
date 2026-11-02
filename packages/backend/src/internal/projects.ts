// Grove Dashboard logic (pure, tested): input cleaning, stage moves from
// offers, and what field users may see.
import { PROJECT_STAGES, PROJECT_STATUSES, PROJECT_TYPES } from "@rw/db/schemas/internal/groveProject.ts";

type Cleaned<T> = { ok: true; value: T } | { ok: false; errors: string[] };
type Stage = (typeof PROJECT_STAGES)[number];

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]) =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v);

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

function numOrNull(v: unknown, name: string, max: number, errors: string[]) {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > max) {
    errors.push(`${name} must be a number from 0 to ${max}`);
    return undefined;
  }
  return n;
}

/** Fields that can be set on a project; everything else is ignored. */
export function cleanProject(body: any, { creating = false } = {}): Cleaned<Record<string, any>> {
  const errors: string[] = [];
  const out: Record<string, any> = {};
  if (body?.name !== undefined || creating) {
    const name = text(body?.name, 200);
    if (!name) errors.push("Name is required");
    else out.name = name;
  }
  for (const [key, list] of [
    ["type", PROJECT_TYPES],
    ["stage", PROJECT_STAGES],
    ["status", PROJECT_STATUSES],
  ] as const) {
    if (body?.[key] !== undefined) {
      const v = oneOf(body[key], list as readonly string[]);
      if (!v) errors.push(`Unknown ${key}`);
      else out[key] = v;
    }
  }
  if (body?.client !== undefined) {
    // only the keys that were sent; the route merges them into what is stored
    const c: Record<string, string | undefined> = {};
    for (const [k, max] of [["name", 200], ["contactPerson", 200], ["email", 200], ["phone", 50]] as const) {
      if (body.client?.[k] !== undefined) c[k] = text(body.client[k], max);
    }
    out.client = c;
  }
  if (body?.farm !== undefined) {
    if (body.farm === null || body.farm === "") out.farm = null;
    else if (isId(body.farm)) out.farm = body.farm;
    else errors.push("Farm must be a farm id");
  }
  if (body?.assignees !== undefined) {
    if (!Array.isArray(body.assignees) || body.assignees.length > 50 || !body.assignees.every(isId)) errors.push("Assignees must be user ids");
    else out.assignees = [...new Set(body.assignees as string[])];
  }
  for (const k of ["region", "responsible"]) if (body?.[k] !== undefined) out[k] = text(body[k], 100);
  if (body?.notes !== undefined) out.notes = text(body.notes, 5000);
  if (body?.nextAction !== undefined) {
    const n: Record<string, unknown> = {};
    if (body.nextAction?.text !== undefined) n.text = text(body.nextAction.text, 500);
    if (body.nextAction?.date !== undefined) {
      const date = dateOrNull(body.nextAction.date, "Next action date", errors);
      if (date !== undefined) n.date = date;
    }
    out.nextAction = n;
  }
  for (const k of ["plantingDate", "contractEnd"]) {
    if (body?.[k] !== undefined) {
      const d = dateOrNull(body[k], k, errors);
      if (d !== undefined) out[k] = d;
    }
  }
  if (body?.plannedHa !== undefined) {
    const n = numOrNull(body.plannedHa, "Planned ha", 100000, errors);
    if (n !== undefined) out.plannedHa = n;
  }
  if (body?.trees !== undefined) {
    const n = numOrNull(body.trees, "Trees", 10_000_000, errors);
    if (n !== undefined) out.trees = n;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

const order = (s: string) => PROJECT_STAGES.indexOf(s as Stage);

/**
 * Stage after an offer event: making an offer moves a prospect to
 * "design & offer"; an accepted offer moves it to "signed". Never moves a
 * project backwards.
 */
export function stageAfterOffer(current: string, event: "offer-made" | "offer-accepted"): Stage | null {
  const target: Stage = event === "offer-accepted" ? "signed" : "design-offer";
  return order(current) < order(target) ? target : null;
}

/** What a field user may see: no client money, no offer values. */
export function forFieldUser(p: Record<string, any>) {
  const { offerValue: _o, signedValue: _s, client, notes: _n, ...rest } = p;
  return { ...rest, client: client ? { name: client.name } : undefined };
}

/** Mongo filter for the projects a user may see. */
export function visibleFilter(user: { _id?: unknown; isAdmin?: boolean | null; roles?: readonly string[] | null } | undefined, canSeeMoney: (u: any) => boolean) {
  return canSeeMoney(user) ? {} : { assignees: user?._id ?? null };
}

/**
 * Offer value: sent offers (what is out with clients); signed value and
 * trees: accepted offers. Drafts and declined offers don't count. Values
 * excl. VAT.
 */
export function summariseOffers(offers: { status: string; net: number; trees: number }[]) {
  const v = { offers: offers.length, offerValue: 0, signedValue: 0, signedTrees: 0, drafts: 0 };
  for (const o of offers) {
    if (o.status === "sent") v.offerValue += o.net;
    else if (o.status === "accepted") {
      v.signedValue += o.net;
      v.signedTrees += o.trees;
    } else if (o.status === "draft") v.drafts += 1;
  }
  return v;
}
