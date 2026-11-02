// Scorecard for the Grove Dashboard (pure, tested): margin won and
// forward-order deposits against targets set in the app, the open pipeline,
// and what is needed per week to close the gap. Grove team only.
import { offerMargin, offerTotals, type OfferLike } from "./offers.ts";
import { danishDay } from "./services.ts";

export type ScorecardTargets = {
  label?: string;
  /** period, YYYY-MM-DD */
  from?: string;
  to?: string;
  /** gross margin on offers accepted in the period (kr, excl. VAT) */
  margin?: number | null;
  /** deposits on forward orders accepted in the period (kr incl. VAT) */
  deposits?: number | null;
};

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

/** Only known fields; amounts 0 to 100M kr; the period must run forwards. */
export function cleanTargets(body: any): { ok: true; value: ScorecardTargets } | { ok: false; error: string } {
  const out: ScorecardTargets = {};
  if (body?.label !== undefined) out.label = typeof body.label === "string" ? body.label.trim().slice(0, 100) : "";
  for (const k of ["from", "to"] as const) {
    if (body?.[k] === undefined || body[k] === null || body[k] === "") continue;
    if (!isDay(body[k])) return { ok: false, error: `${k} must be a date (YYYY-MM-DD)` };
    out[k] = body[k];
  }
  if (out.from && out.to && out.from > out.to) return { ok: false, error: "The period must end after it starts" };
  for (const k of ["margin", "deposits"] as const) {
    if (body?.[k] === undefined) continue;
    if (body[k] === null || body[k] === "") {
      out[k] = null;
      continue;
    }
    const n = typeof body[k] === "number" ? body[k] : Number(body[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return { ok: false, error: `${k} must be 0 to 100,000,000 kr` };
    out[k] = Math.round(n);
  }
  return { ok: true, value: out };
}

type ScoredOffer = OfferLike & {
  _id?: unknown;
  title?: string;
  client?: { name?: string };
  status: string;
  acceptedAt?: Date | string | null;
  updatedAt?: Date | string;
  deal?: unknown;
  groveProject?: unknown;
};

/** The Danish calendar day of a timestamp (00:30 on 1 Nov in Denmark is 1 Nov, not 31 Oct). */
const day = (d: Date | string | null | undefined) => {
  if (!d) return undefined;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? undefined : danishDay(x);
};

export function scorecard(
  input: { offers: ScoredOffer[]; openDeals: { value?: number | null; funnelName?: string }[]; targets: ScorecardTargets; now?: Date },
) {
  const now = input.now ?? new Date();
  const t = input.targets;
  const inPeriod = (d: string | undefined) => !!d && (!t.from || d >= t.from) && (!t.to || d <= t.to);
  // accepted offers: when accepted (older ones: last change)
  const won = input.offers
    .filter((o) => o.status === "accepted" && inPeriod(day(o.acceptedAt)))
    .map((o) => {
      const totals = offerTotals(o);
      const m = offerMargin(o);
      const forward = !!o.terms?.forwardOrder;
      return {
        _id: o._id,
        title: o.title,
        client: o.client?.name,
        acceptedOn: day(o.acceptedAt),
        forwardOrder: forward,
        net: totals.net,
        margin: m.margin,
        marginPct: m.marginPct,
        withoutCost: m.withoutCost,
        deposit: totals.deposit.amount,
        depositPct: totals.deposit.pct,
        deal: o.deal ?? null,
        groveProject: o.groveProject ?? null,
      };
    })
    .sort((a, b) => (b.acceptedOn ?? "").localeCompare(a.acceptedOn ?? ""));
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  // spring deals count their margin; forward orders count their deposit
  const margin = sum(won.filter((w) => !w.forwardOrder).map((w) => w.margin));
  const deposits = sum(won.filter((w) => w.forwardOrder).map((w) => w.deposit));
  const withoutCost = sum(won.filter((w) => !w.forwardOrder).map((w) => w.withoutCost));
  const sent = input.offers.filter((o) => o.status === "sent");
  const sentMargin = sum(sent.filter((o) => !o.terms?.forwardOrder).map((o) => offerMargin(o).margin));
  const sentDeposits = sum(sent.filter((o) => o.terms?.forwardOrder).map((o) => offerTotals(o).deposit.amount));
  const byFunnel = new Map<string, { count: number; value: number }>();
  for (const d of input.openDeals) {
    const k = d.funnelName ?? "Other";
    const v = byFunnel.get(k) ?? { count: 0, value: 0 };
    v.count += 1;
    v.value += d.value ?? 0;
    byFunnel.set(k, v);
  }
  // whole Danish days from today to the end of the period, in weeks (rounded up)
  const daysLeft = t.to ? Math.round((Date.parse(`${t.to}T00:00:00Z`) - Date.parse(`${danishDay(now)}T00:00:00Z`)) / 86_400_000) + 1 : null;
  const weeksLeft = daysLeft === null ? null : Math.max(0, Math.ceil(daysLeft / 7));
  const gap = (target: number | null | undefined, actual: number) => (typeof target === "number" ? Math.max(0, Math.round(target - actual)) : null);
  const perWeek = (g: number | null) => (g === null || weeksLeft === null ? null : weeksLeft > 0 ? Math.round(g / weeksLeft) : g);
  const marginGap = gap(t.margin, margin);
  const depositGap = gap(t.deposits, deposits);
  return {
    targets: t,
    weeksLeft,
    margin: { actual: margin, target: t.margin ?? null, gap: marginGap, perWeek: perWeek(marginGap), withoutCost, inSentOffers: sentMargin },
    deposits: { actual: deposits, target: t.deposits ?? null, gap: depositGap, perWeek: perWeek(depositGap), inSentOffers: sentDeposits },
    pipeline: [...byFunnel.entries()].map(([funnel, v]) => ({ funnel, ...v })).sort((a, b) => b.value - a.value),
    won,
  };
}
