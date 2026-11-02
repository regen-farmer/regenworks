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
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    errors.push(`${name} is not a date`);
    return undefined;
  }
  return d;
}

function numOrNull(v: unknown, name: string, max: number, errors: string[]) {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
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
    out.client = {
      name: text(body.client?.name, 200),
      contactPerson: text(body.client?.contactPerson, 200),
      email: text(body.client?.email, 200),
      phone: text(body.client?.phone, 50),
    };
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
    const date = body.nextAction?.date === undefined ? undefined : dateOrNull(body.nextAction.date, "Next action date", errors);
    out.nextAction = { text: text(body.nextAction?.text, 500), date: date ?? null };
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
