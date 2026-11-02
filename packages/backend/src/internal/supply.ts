// Forward-order supply (pure, tested): plants promised in forward orders
// against what Grove can deliver per species and season: own grafting at the
// expected take rate plus supplier capacity. Grove team only.
import { norm } from "./pricebook.ts";
import { isService, type OfferLike } from "./offers.ts";
import { danishDay } from "./services.ts";

/** A season from the delivery date (Jul–Dec: autumn; Jan–Jun: spring) or the season text. */
export function seasonOf(terms: { deliveryDate?: Date | string | null; deliverySeason?: string } | undefined): string {
  const d = terms?.deliveryDate ? new Date(terms.deliveryDate) : null;
  if (d && !Number.isNaN(d.getTime())) {
    const [y, m] = danishDay(d).split("-").map(Number);
    return `${m >= 7 ? "Autumn" : "Spring"} ${y}`;
  }
  return terms?.deliverySeason?.trim() || "No season set";
}

/** Species key: genus + species, so cultivars and rootstocks of one species share supply. */
export const speciesKey = (latin: string | undefined) => norm(latin).split(" ").slice(0, 2).join(" ");

export type SupplyRow = {
  /** species, as Latin (genus species) */
  latin: string;
  season: string;
  ownGrafts?: number;
  takePct?: number;
  suppliers?: { name: string; qty: number }[];
  note?: string;
};

type SupplyOffer = OfferLike & { _id?: unknown; title?: string; client?: { name?: string }; status: string };

/** Forward-order demand per species and season: signed (accepted) and likely (sent or draft). */
export function forwardDemand(offers: SupplyOffer[]) {
  const groups = new Map<string, { latin: string; name?: string; season: string; signed: number; likely: number; cultivars: Map<string, number>; offers: any[] }>();
  for (const o of offers) {
    if (!o.terms?.forwardOrder || o.status === "declined") continue;
    const season = seasonOf(o.terms as any);
    for (const l of o.lines) {
      if (isService(l) || !(l.qty > 0) || !l.latin) continue;
      const key = `${speciesKey(l.latin)}|${season}`;
      const g = groups.get(key) ?? { latin: l.latin.split(" ").slice(0, 2).join(" "), name: l.nameDa, season, signed: 0, likely: 0, cultivars: new Map(), offers: [] };
      if (o.status === "accepted") g.signed += l.qty;
      else g.likely += l.qty;
      const c = l.cultivar?.trim() || "(no cultivar)";
      g.cultivars.set(c, (g.cultivars.get(c) ?? 0) + l.qty);
      if (!g.offers.some((x) => String(x._id) === String(o._id))) g.offers.push({ _id: o._id, title: o.title, client: o.client?.name, status: o.status });
      g.name ??= l.nameDa;
      groups.set(key, g);
    }
  }
  return [...groups.values()].map((g) => ({ ...g, cultivars: [...g.cultivars.entries()].map(([cultivar, qty]) => ({ cultivar, qty })).sort((a, b) => b.qty - a.qty) }));
}

/** Cleaned supply plan: species, season, own grafts, take %, suppliers. */
export function cleanSupplyPlan(body: any): { ok: true; value: SupplyRow[] } | { ok: false; error: string } {
  if (!Array.isArray(body?.rows) || body.rows.length > 200) return { ok: false, error: "Send rows (max 200)" };
  const out: SupplyRow[] = [];
  for (const [i, r] of body.rows.entries()) {
    const latin = typeof r?.latin === "string" ? r.latin.trim().slice(0, 100) : "";
    const season = typeof r?.season === "string" ? r.season.trim().slice(0, 40) : "";
    if (!latin || !season) return { ok: false, error: `Row ${i + 1}: species and season are needed` };
    const n = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : typeof v === "number" || typeof v === "string" ? Number(v) : Number.NaN);
    const ownGrafts = n(r.ownGrafts);
    const takePct = n(r.takePct);
    if (ownGrafts !== undefined && !(ownGrafts >= 0 && ownGrafts <= 10_000_000)) return { ok: false, error: `Row ${i + 1}: own grafts` };
    if (takePct !== undefined && !(takePct >= 0 && takePct <= 100)) return { ok: false, error: `Row ${i + 1}: take % must be 0-100` };
    if (r.suppliers !== undefined && (!Array.isArray(r.suppliers) || r.suppliers.length > 20)) return { ok: false, error: `Row ${i + 1}: suppliers` };
    const suppliers: { name: string; qty: number }[] = [];
    for (const s of r.suppliers ?? []) {
      const name = typeof s?.name === "string" ? s.name.trim().slice(0, 100) : "";
      const qty = Number(s?.qty);
      if (!name || !(qty >= 0 && qty <= 10_000_000) || typeof s?.qty === "object") return { ok: false, error: `Row ${i + 1}: each supplier needs a name and a quantity` };
      suppliers.push({ name, qty: Math.round(qty) });
    }
    out.push({
      latin,
      season,
      ownGrafts: ownGrafts === undefined ? undefined : Math.round(ownGrafts),
      takePct,
      suppliers,
      note: typeof r.note === "string" ? r.note.trim().slice(0, 500) : undefined,
    });
  }
  return { ok: true, value: out };
}

/** Demand against supply per species and season; rows with only supply or only demand show too. */
export function supplyBalance(offers: SupplyOffer[], plan: SupplyRow[]) {
  const demand = forwardDemand(offers);
  const keys = new Set([...demand.map((d) => `${speciesKey(d.latin)}|${d.season}`), ...plan.map((p) => `${speciesKey(p.latin)}|${p.season}`)]);
  return [...keys]
    .map((key) => {
      const d = demand.find((x) => `${speciesKey(x.latin)}|${x.season}` === key);
      const p = plan.find((x) => `${speciesKey(x.latin)}|${x.season}` === key);
      const own = Math.floor(((p?.ownGrafts ?? 0) * (p?.takePct ?? 0)) / 100);
      const bought = (p?.suppliers ?? []).reduce((n, s) => n + s.qty, 0);
      const available = own + bought;
      const signed = d?.signed ?? 0;
      const likely = d?.likely ?? 0;
      return {
        latin: d?.latin ?? p!.latin,
        name: d?.name,
        season: d?.season ?? p!.season,
        signed,
        likely,
        ownGrafts: p?.ownGrafts ?? 0,
        takePct: p?.takePct ?? null,
        ownExpected: own,
        suppliers: p?.suppliers ?? [],
        available,
        afterSigned: available - signed,
        afterLikely: available - signed - likely,
        planned: !!p,
        cultivars: d?.cultivars ?? [],
        offers: d?.offers ?? [],
        note: p?.note,
      };
    })
    .sort((a, b) => a.season.localeCompare(b.season) || a.latin.localeCompare(b.latin));
}
