// Scorecard for the Grove Dashboard (pure, tested): margin won and
// forward-order deposits against targets set in the app, the open pipeline,
// and what is needed per week to close the gap. Grove team only.
import { offerMargin, offerTotals, VAT_RATE, type OfferLike } from "./offers.ts";
import { danishDay } from "./services.ts";

export type ScorecardTargets = {
  label?: string;
  /** period, YYYY-MM-DD */
  from?: string;
  to?: string;
  /** gross margin on deals won in the period (kr excl. VAT; real from accepted offers, else estimated) */
  margin?: number | null;
  /** deposits on forward orders won in the period (kr excl. VAT, as in the sales plan) */
  deposits?: number | null;
  /** margin assumed on a won deal until its offer has real costs (%, default 25) */
  standardMarginPct?: number | null;
};

export const DEFAULT_STANDARD_MARGIN = 25;
/** Deposit on a forward-order deal without an offer: the forward-order rule. */
export const FORWARD_DEPOSIT_PCT = 20;
const VAT = VAT_RATE;

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
  if (body?.standardMarginPct !== undefined) {
    if (body.standardMarginPct === null || body.standardMarginPct === "") out.standardMarginPct = null;
    else {
      const p = typeof body.standardMarginPct === "number" ? body.standardMarginPct : Number(body.standardMarginPct);
      if (!Number.isFinite(p) || p < 0 || p > 90) return { ok: false, error: "Standard margin must be 0 to 90 %" };
      out.standardMarginPct = Math.round(p * 10) / 10;
    }
  }
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

type WonDeal = { _id: unknown; title?: string; client?: string; funnelName?: string; management?: boolean; archived?: boolean; value?: number | null; forwardOrder?: boolean; wonAt?: Date | string | null; updatedAt?: Date | string | null; groveProject?: unknown };

/**
 * Won business in the period, shown per deal (A · Deals) where there is one.
 * Each accepted offer on a won deal counts once, on the later of the day the
 * deal was won and the day the offer was accepted, so a sale is never moved
 * back into an earlier period (a deal won on a handshake in October with its
 * offer accepted in November counts in November). Spring work counts margin,
 * forward orders their deposit (excl. VAT). A won deal without an accepted
 * offer is estimated from its value (so deals count now; real costs come
 * with the offers): the standard margin, or a 20 % deposit for a deal ticked
 * "Forward order". Management deals are billed monthly: never estimated. Accepted offers not
 * on a won deal (plant-list sales, older offers) count by acceptance date.
 * `closedDealIds`: won and lost deals, whose sent offers are no longer
 * counted as "in sent offers".
 */
export function scorecard(input: {
  offers: ScoredOffer[];
  openDeals: { value?: number | null; funnelName?: string; forwardOrder?: boolean; management?: boolean }[];
  wonDeals?: WonDeal[];
  closedDealIds?: unknown[];
  targets: ScorecardTargets;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const t = input.targets;
  const inPeriod = (d: string | undefined) => !!d && (!t.from || d >= t.from) && (!t.to || d <= t.to);
  const wonDeals = input.wonDeals ?? [];
  const wonBy = new Map(wonDeals.map((d) => [String(d._id), d]));
  const priced = (o: ScoredOffer) => {
    const totals = offerTotals(o);
    const m = offerMargin(o);
    return { o, net: totals.net, margin: m.margin, marginPct: m.marginPct, withoutCost: m.withoutCost, deposit: totals.deposit.amount, depositPct: totals.deposit.pct, forward: !!o.terms?.forwardOrder };
  };
  const later = (a: string | undefined, b: string | undefined) => (!a ? b : !b ? a : a > b ? a : b);
  const wonDay = (d: WonDeal) => day(d.wonAt) ?? day(d.updatedAt);
  const accepted = input.offers.filter((o) => o.status === "accepted");
  type P = ReturnType<typeof priced> & { on: string | undefined };
  const offersOf = new Map<string, P[]>();
  for (const o of accepted) {
    const d = o.deal ? wonBy.get(String(o.deal)) : undefined;
    if (!d) continue;
    const k = String(d._id);
    offersOf.set(k, [...(offersOf.get(k) ?? []), { ...priced(o), on: later(wonDay(d), day(o.acceptedAt)) }]);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const stdPct = typeof t.standardMarginPct === "number" ? t.standardMarginPct : DEFAULT_STANDARD_MARGIN;
  const fromDeals = wonDeals.flatMap((d) => {
    const all = offersOf.get(String(d._id)) ?? [];
    if (!all.length) {
      // management is invoiced monthly; a hidden (archived) deal isn't estimated either
      if (!inPeriod(wonDay(d)) || d.management || d.archived) return [];
      const value = d.value ?? 0;
      const fwd = !!d.forwardOrder;
      return [
        {
          kind: "deal" as const,
          _id: d._id,
          offers: 0,
          estimated: true,
          title: d.title,
          client: d.client,
          funnel: d.funnelName,
          acceptedOn: wonDay(d),
          forwardOrder: fwd,
          net: value,
          margin: fwd ? 0 : round((value * stdPct) / 100),
          marginPct: fwd ? null : (stdPct as number | null),
          withoutCost: 0,
          deposit: fwd ? round((value * FORWARD_DEPOSIT_PCT) / 100) : 0,
          withoutOffer: value,
          deal: d._id,
          groveProject: d.groveProject ?? null,
        },
      ];
    }
    const list = all.filter((x) => inPeriod(x.on));
    if (!list.length) return [];
    const spring = list.filter((x) => !x.forward);
    const fwd = list.filter((x) => x.forward);
    const margin = round(spring.reduce((n, x) => n + x.margin, 0));
    const springNet = spring.reduce((n, x) => n + x.net, 0);
    return [
      {
        kind: "deal" as const,
        _id: d._id,
        offers: list.length,
        title: d.title,
        client: d.client,
        funnel: d.funnelName,
        acceptedOn: list.map((x) => x.on).sort().at(-1),
        forwardOrder: fwd.length > 0 && spring.length === 0,
        net: round(list.reduce((n, x) => n + x.net, 0)),
        margin,
        marginPct: springNet > 0 && spring.every((x) => x.marginPct !== null) ? Math.round((margin / springNet) * 1000) / 10 : null,
        withoutCost: round(spring.reduce((n, x) => n + x.withoutCost, 0)),
        deposit: round(fwd.reduce((n, x) => n + x.deposit / (1 + VAT), 0)),
        withoutOffer: 0,
        estimated: false,
        deal: d._id,
        groveProject: d.groveProject ?? null,
      },
    ];
  });
  const fromOffers = accepted
    .filter((o) => !(o.deal && wonBy.has(String(o.deal))) && inPeriod(day(o.acceptedAt)))
    .map((o) => {
      const x = priced(o);
      return {
        kind: "offer" as const,
        _id: o._id,
        offers: 1,
        title: o.title,
        client: o.client?.name,
        funnel: undefined as string | undefined,
        acceptedOn: day(o.acceptedAt),
        forwardOrder: x.forward,
        net: x.net,
        margin: x.forward ? 0 : x.margin,
        marginPct: x.forward ? null : x.marginPct,
        withoutCost: x.forward ? 0 : x.withoutCost,
        deposit: x.forward ? round(x.deposit / (1 + VAT)) : 0,
        withoutOffer: 0,
        estimated: false,
        deal: o.deal ?? null,
        groveProject: o.groveProject ?? null,
      };
    });
  const won = [...fromDeals, ...fromOffers].sort((a, b) => (b.acceptedOn ?? "").localeCompare(a.acceptedOn ?? ""));
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  // spring deals count their margin; forward orders count their deposit
  // spring business counts margin, forward orders their deposit (a deal can hold both)
  const margin = sum(won.map((w) => w.margin));
  const deposits = sum(won.map((w) => w.deposit));
  const withoutCost = sum(won.map((w) => w.withoutCost));
  // won deals counted from their value (no accepted offer yet)
  const estimated = won.filter((w) => w.estimated);
  const withoutOffer = { count: estimated.length, value: sum(estimated.map((w) => w.withoutOffer)), margin: sum(estimated.map((w) => w.margin)), deposits: sum(estimated.map((w) => w.deposit)) };
  // sent offers still in play: not on a deal that is already won or lost
  const closed = new Set((input.closedDealIds ?? []).map(String));
  const sent = input.offers.filter((o) => o.status === "sent" && !(o.deal && closed.has(String(o.deal))));
  const sentMargin = sum(sent.filter((o) => !o.terms?.forwardOrder).map((o) => offerMargin(o).margin));
  const sentDeposits = sum(sent.filter((o) => o.terms?.forwardOrder).map((o) => offerTotals(o).deposit.amount / (1 + VAT)));
  const byFunnel = new Map<string, { count: number; value: number; estMargin: number; estDeposits: number }>();
  for (const d of input.openDeals) {
    const k = d.funnelName ?? "Other";
    const v = byFunnel.get(k) ?? { count: 0, value: 0, estMargin: 0, estDeposits: 0 };
    v.count += 1;
    v.value += d.value ?? 0;
    // what the open deals would bring if won: margin, or a deposit for forward orders; management billed monthly
    if (d.forwardOrder) v.estDeposits += ((d.value ?? 0) * FORWARD_DEPOSIT_PCT) / 100;
    else if (!d.management) v.estMargin += ((d.value ?? 0) * stdPct) / 100;
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
    withoutOffer,
    deposits: { actual: deposits, target: t.deposits ?? null, gap: depositGap, perWeek: perWeek(depositGap), inSentOffers: sentDeposits },
    standardMarginPct: stdPct,
    forwardDepositPct: FORWARD_DEPOSIT_PCT,
    pipeline: [...byFunnel.entries()].map(([funnel, v]) => ({ funnel, ...v, estMargin: Math.round(v.estMargin), estDeposits: Math.round(v.estDeposits) })).sort((a, b) => b.value - a.value),
    won,
  };
}
