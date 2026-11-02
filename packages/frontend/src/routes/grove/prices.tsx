// Price overview: per product, Grove's sales prices next to every supplier
// cost, each with its supplier, price list, date and source file, so ranges
// and margins can be judged without making an offer. Grove team only.
import { FORM_EN, type Form, type ProductSpec } from "@rw/db/productSpec.ts";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { PROPAGATION_EN, SECTION_EN, type ServiceSection } from "~/grove/offerTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";
const th = "text-left font-semibold py-1 pr-3 whitespace-nowrap";
const td = "py-1 pr-3 align-top";
const PAGE = 100;

type Source = { docId?: string; title?: string; file?: string; documentDate?: string; outdated: boolean; supplierName?: string };
type Cost = {
  spec?: ProductSpec;
  priceId: string;
  supplierId: string;
  rootstock?: string;
  propagation?: string;
  size?: string;
  organicStatus: string;
  unit?: string;
  price: number;
  currency: string;
  vat?: string;
  vatUnclear: boolean;
  unitCostDkk: number | null;
  availableQty?: string;
  notes?: string;
  source: Source;
};
type Sale = {
  spec?: ProductSpec;
  salesPriceId: string;
  rootstock?: string;
  propagation?: string;
  size?: string;
  organicStatus: string;
  priceExclVat: number;
  priceInclVat?: number;
  listedSupplier?: string;
  stockStatus?: string;
  costReference: {
    unitCostDkk: number;
    supplierPriceId: string;
    supplierName?: string;
    size?: string;
    organicStatus: string;
    vatUnclear: boolean;
    outdated: boolean;
    sameSize: boolean;
    sameOrganic: boolean;
    sameProduct?: boolean;
    differs?: string[];
    unknown?: string[];
    exact: boolean;
  } | null;
  marginPct: number | null;
  source: Source;
};
type Variant = {
  key: string;
  spec: ProductSpec;
  /** how many sales and supplier prices are for exactly this product */
  sales: number;
  costs: number;
  summary: { costPoints: number; compatiblePoints: number; exactPoints: number; costMin?: number; costMax?: number; salesMin?: number; salesMax?: number; marginLow: number | null; marginHigh: number | null; approx: boolean };
};
type Product = {
  key: string;
  products?: Variant[];
  latin: string;
  name?: string;
  cultivar?: string;
  sales: Sale[];
  costs: Cost[];
  summary: { costPoints: number; suppliers: number; costMin?: number; costMedian?: number; costMax?: number; salesMin?: number; salesMax?: number; outdated: number; vatUnclear: number };
};
type ServiceRow = {
  serviceId: string;
  section: ServiceSection;
  nameDa: string;
  nameEn?: string;
  unitDa: string;
  unitPrice: number | null;
  priceSource: string;
  costLow?: number;
  costLikely?: number;
  costHigh?: number;
  marginPct: number | null;
  worstMarginPct: number | null;
  targetMarginPct?: number;
  vatUnclear?: boolean;
  notes?: string;
  source: Source & { priceId?: string; price?: number; currency?: string };
};
type Overview = {
  version: number | null;
  eurDkk?: number;
  targets?: { trees?: number; services?: number };
  total: number;
  products: Product[];
  services: ServiceRow[];
};

const kr = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "–" : `${n.toLocaleString("da-DK", { maximumFractionDigits: 2 })} kr`);
const organic = (s: string) => (s === "organic" ? "organic" : s === "in-conversion" ? "in conversion" : s === "not-organic" ? "not organic" : s);
const type = (rootstock?: string, propagation?: string) => [rootstock ? `on ${rootstock}` : "", propagation ? PROPAGATION_EN[propagation] ?? propagation : ""].filter(Boolean).join(", ");
/** "on Corylus colurna · grafted · organic · bare root · 1+1" */
const variantText = (v: ProductSpec) =>
  [
    v.rootstock ? `on ${v.rootstock}` : v.propagation && v.propagation !== "grafted" ? "own roots" : "",
    v.propagation ? PROPAGATION_EN[v.propagation as string] ?? v.propagation : "",
    v.organic === true ? "organic" : v.organic === false ? "not organic" : "",
    v.form ? FORM_EN[v.form as Form] ?? v.form : "",
    v.years ? `${v.years} yrs` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "type not stated";
const range = (a?: number, b?: number) => (a === undefined ? "–" : a === b ? kr(a) : `${kr(a)} – ${kr(b)}`);

function SourceCell(props: { s: Source }) {
  return (
    <span>
      {props.s.supplierName ?? ""}
      <Show when={props.s.title}><span class="opacity-70"> · {props.s.title}</span></Show>
      <Show when={props.s.documentDate}><span class="opacity-70"> · {props.s.documentDate}</span></Show>
      <Show when={props.s.outdated}><span class="text-amber-700"> · over 3 years old</span></Show>
      <Show when={props.s.file}><div class="text-xs opacity-60 font-mono">{props.s.file}</div></Show>
    </span>
  );
}

function Prices() {
  const [tab, setTab] = createSignal<"plants" | "services">("plants");
  const [typed, setTyped] = createSignal("");
  const [q, setQ] = createSignal("");
  const [only, setOnly] = createSignal("");
  const [pages, setPages] = createSignal(1);
  const [open, setOpen] = createSignal<Set<string>>(new Set());
  let timer: ReturnType<typeof setTimeout> | undefined;
  // first page with the search/filter; "Show more" fetches the next page by offset and appends
  const [data] = createResource(
    () => (canSeeMoney() ? { q: q(), only: only() } : undefined),
    (k) => apiFetch<Overview>(`/internal/pricebook/overview?q=${encodeURIComponent(k.q)}&only=${k.only}&limit=${PAGE}`),
  );
  const [more, setMore] = createSignal<Product[]>([]);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const d = () => (data.error ? undefined : data.latest);
  const products = () => [...(d()?.products ?? []), ...more()];
  async function showMore() {
    setLoadingMore(true);
    const asked = `${q()}|${only()}`;
    try {
      const r = await apiFetch<Overview>(`/internal/pricebook/overview?q=${encodeURIComponent(q())}&only=${only()}&limit=${PAGE}&offset=${PAGE * pages()}`);
      // the search changed while this page was loading: drop it
      if (asked !== `${q()}|${only()}`) return;
      setMore([...more(), ...r.products]);
      setPages(pages() + 1);
    } finally {
      setLoadingMore(false);
    }
  }
  const reset = () => {
    setMore([]);
    setPages(1);
  };
  const toggle = (key: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div class="container mx-auto p-4 flex flex-col gap-3" data-testid="grove-prices">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Prices are only shown to the Grove team.</p>}>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-bold mr-auto">Price overview</h1>
          <Link to="/grove/pricebook" class="text-sm underline">Pricebook versions and import</Link>
        </div>
        <p class="text-sm opacity-70">
          Pricebook v{d()?.version ?? "–"}. Supplier prices are shown as printed and converted to DKK at {d()?.eurDkk ?? "–"} kr/EUR, VAT as
          the supplier states it. Every price links to its price list and source file in the grove-pricebook repo.
        </p>
        <Show when={data.error}><p class="text-red-600 text-sm">{(data.error as Error)?.message}</p></Show>

        <div role="tablist" aria-label="Kind of price" class="flex gap-1">
          <For each={[["plants", "Plants"], ["services", "Services"]] as const}>
            {([k, label]) => (
              <button
                role="tab"
                aria-selected={tab() === k}
                class="rounded-sm px-3 py-1 text-sm border border-zinc-300 dark:border-slate-600"
                classList={{ "bg-zinc-800 text-white dark:bg-slate-200 dark:text-black": tab() === k }}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            )}
          </For>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <input
            class={`${input} w-72`}
            aria-label="Search"
            placeholder="Species, cultivar, rootstock (e.g. corylus emoa)"
            value={typed()}
            onInput={(e) => {
              const v = e.currentTarget.value;
              setTyped(v);
              clearTimeout(timer);
              timer = setTimeout(() => {
                reset();
                setQ(v);
              }, 300);
            }}
          />
          <Show when={tab() === "plants"}>
            <select class={input} aria-label="Show" value={only()} onChange={(e) => { reset(); setOnly(e.currentTarget.value); }}>
              <option value="">All products</option>
              <option value="sales">With a Grove sales price</option>
              <option value="multi">Priced by several suppliers</option>
              <option value="flags">With old or VAT-unclear prices</option>
            </select>
            <span class="text-sm opacity-70">{d() ? `${d()!.total} products` : ""}</span>
          </Show>
        </div>

        <Show when={tab() === "plants"}>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr>
                  <th class={th}>Plant</th>
                  <th class={th}>Cultivar</th>
                  <th class={th}>Grove price excl. VAT</th>
                  <th class={th}>Supplier cost, all sizes (DKK)</th>
                  <th class={th}>Data points</th>
                  <th class={th}>Margin</th>
                  <th class={th} />
                </tr>
              </thead>
              <tbody>
                <For each={products()} fallback={<tr><td class={td}>{data.loading ? "Loading…" : "No prices found."}</td></tr>}>
                  {(p) => {
                    const isOpen = () => open().has(p.key);
                    const margins = () => p.sales.map((s) => s.marginPct).filter((m): m is number => m !== null);
                    const approx = () => p.sales.some((s) => s.costReference && !s.costReference.exact);
                    const below = () => d()?.targets?.trees !== undefined && margins().some((m) => m < d()!.targets!.trees!);
                    return (
                      <>
                        <tr class="border-t border-zinc-200 dark:border-slate-700">
                          <td class={td}>
                            <button class="text-left underline" aria-expanded={isOpen()} onClick={() => toggle(p.key)}>
                              <span class="italic">{p.latin || p.name}</span>
                            </button>
                            <Show when={p.latin && p.name}><div class="text-xs opacity-70">{p.name}</div></Show>
                          </td>
                          <td class={td}>{p.cultivar}</td>
                          <td class={`${td} whitespace-nowrap`}>{range(p.summary.salesMin, p.summary.salesMax)}</td>
                          <td class={`${td} whitespace-nowrap`}>
                            {range(p.summary.costMin, p.summary.costMax)}
                            <Show when={p.summary.costPoints > 2}><div class="text-xs opacity-70">median {kr(p.summary.costMedian)}</div></Show>
                          </td>
                          <td class={td}>{p.summary.costPoints} from {p.summary.suppliers} supplier{p.summary.suppliers === 1 ? "" : "s"}</td>
                          <td class={td} classList={{ "text-amber-700 font-semibold": below() }}>
                            {margins().length ? `${approx() ? "≈ " : ""}${Math.min(...margins())}${margins().length > 1 ? `–${Math.max(...margins())}` : ""} %` : "–"}
                          </td>
                          <td class={`${td} text-xs text-amber-700`}>
                            {[p.summary.outdated && `${p.summary.outdated} old`, p.summary.vatUnclear && `${p.summary.vatUnclear} VAT unclear`].filter(Boolean).join(", ")}
                          </td>
                        </tr>
                        {/* each product: rootstock, propagation, organic, bare root/container, production years */}
                        <For each={p.products?.length && (p.products.length > 1 || p.products[0].sales) ? p.products : []}>
                          {(v) => (
                            <tr class="text-xs" classList={{ "opacity-60": !v.sales }}>
                              <td class={`${td} pl-4`} colSpan={2}>└ {variantText(v.spec)}</td>
                              <td class={`${td} whitespace-nowrap`}>{v.sales ? range(v.summary.salesMin, v.summary.salesMax) : ""}</td>
                              <td class={`${td} whitespace-nowrap`}>
                                {v.summary.compatiblePoints ? range(v.summary.costMin, v.summary.costMax) : v.sales ? <span class="text-amber-700">no supplier price for this product</span> : ""}
                              </td>
                              <td class={td}>
                                {v.summary.costPoints ? `${v.summary.costPoints} price${v.summary.costPoints === 1 ? "" : "s"}` : ""}
                                <Show when={v.sales && v.summary.compatiblePoints > v.summary.exactPoints}>
                                  <div class="opacity-70">{v.summary.compatiblePoints - v.summary.exactPoints} not fully specified</div>
                                </Show>
                              </td>
                              <td class={td} classList={{ "text-amber-700 font-semibold": d()?.targets?.trees !== undefined && v.summary.marginLow !== null && v.summary.marginLow < d()!.targets!.trees! }}>
                                {v.summary.marginLow === null ? "" : `${v.summary.approx ? "≈ " : ""}${v.summary.marginLow === v.summary.marginHigh ? v.summary.marginLow : `${v.summary.marginLow}–${v.summary.marginHigh}`} %`}
                              </td>
                              <td class={td} />
                            </tr>
                          )}
                        </For>
                        <Show when={isOpen()}>
                          <tr>
                            <td colSpan={7} class="pb-3 pl-4">
                              <Show when={p.sales.length}>
                                <div class="font-semibold mt-1">Grove sales prices</div>
                                <table class="w-full text-xs">
                                  <thead>
                                    <tr><th class={th}>Type</th><th class={th}>Size</th><th class={th}>Organic</th><th class={th}>Excl. VAT</th><th class={th}>Incl. VAT</th><th class={th}>Listed supplier</th><th class={th}>Cost used in offers</th><th class={th}>Margin</th><th class={th}>Source</th></tr>
                                  </thead>
                                  <tbody>
                                    <For each={p.sales}>
                                      {(s) => (
                                        <tr class="border-t border-zinc-200 dark:border-slate-700">
                                          <td class={td}>{s.spec ? variantText(s.spec) : type(s.rootstock, s.propagation)}</td>
                                          <td class={td}>{s.size}</td>
                                          <td class={td}>{organic(s.organicStatus)}</td>
                                          <td class={td}>{kr(s.priceExclVat)}</td>
                                          <td class={td}>{kr(s.priceInclVat)}</td>
                                          <td class={td}>{s.listedSupplier}{s.stockStatus ? ` · ${s.stockStatus}` : ""}</td>
                                          <td class={td}>
                                            <Show when={s.costReference} fallback="no matching supplier price">
                                              {kr(s.costReference!.unitCostDkk)} · {s.costReference!.supplierName}
                                              <div class="opacity-70">{[s.costReference!.size, organic(s.costReference!.organicStatus)].filter(Boolean).join(", ")} · <span class="font-mono">{s.costReference!.supplierPriceId}</span></div>
                                              <div class="text-amber-700">
                                                {[
                                                  !s.costReference!.sameSize && "other size",
                                                  !s.costReference!.sameOrganic && "other organic status",
                                                  s.costReference!.differs?.length && `other ${s.costReference!.differs.join(", ")}`,
                                                  s.costReference!.unknown?.length && `${s.costReference!.unknown.join(", ")} not stated by supplier`,
                                                  s.costReference!.vatUnclear && "VAT unclear",
                                                  s.costReference!.outdated && "old list",
                                                ].filter(Boolean).join(", ")}
                                              </div>
                                            </Show>
                                          </td>
                                          <td class={td}>{s.marginPct === null ? "–" : `${s.costReference && !s.costReference.exact ? "≈ " : ""}${s.marginPct} %`}</td>
                                          <td class={td}><SourceCell s={s.source} /></td>
                                        </tr>
                                      )}
                                    </For>
                                  </tbody>
                                </table>
                              </Show>
                              <div class="font-semibold mt-2">Supplier prices, cheapest first</div>
                              <Show when={p.costs.length} fallback={<p class="text-xs">No supplier prices.</p>}>
                                <table class="w-full text-xs">
                                  <thead>
                                    <tr><th class={th}>Supplier</th><th class={th}>Type</th><th class={th}>Size</th><th class={th}>Organic</th><th class={th}>Price as printed</th><th class={th}>DKK</th><th class={th}>Available</th><th class={th}>Price list</th><th class={th}>Id</th></tr>
                                  </thead>
                                  <tbody>
                                    <For each={p.costs}>
                                      {(c) => (
                                        <tr class="border-t border-zinc-200 dark:border-slate-700">
                                          <td class={td}>{c.source.supplierName ?? c.supplierId}</td>
                                          <td class={td}>{c.spec ? variantText(c.spec) : type(c.rootstock, c.propagation)}</td>
                                          <td class={td}>{c.size}{c.unit && c.unit !== "plant" ? ` (${c.unit})` : ""}</td>
                                          <td class={td}>{organic(c.organicStatus)}</td>
                                          <td class={td}>
                                            {c.price} {c.currency}
                                            <span classList={{ "text-amber-700": c.vatUnclear, "opacity-60": !c.vatUnclear }}> · {c.vat ?? "VAT?"}</span>
                                          </td>
                                          <td class={td}>{kr(c.unitCostDkk)}</td>
                                          <td class={td}>{c.availableQty}</td>
                                          <td class={td}><SourceCell s={c.source} /></td>
                                          <td class={`${td} font-mono opacity-60`}>{c.priceId}</td>
                                        </tr>
                                      )}
                                    </For>
                                  </tbody>
                                </table>
                              </Show>
                            </td>
                          </tr>
                        </Show>
                      </>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
          <p class="text-xs opacity-70">
            Under each cultivar, one row per product: rootstock (or own roots), propagation, organic, bare root or container, and production years (Grove's own: grafted 1+1, seedlings 1). A product's margin is only against supplier prices that could be the same product. ≈ margin: some of those don't state every field (often the years), differ in size, or don't state VAT.
          </p>
          <Show when={(d()?.total ?? 0) > products().length}>
            <button class="rounded-sm px-2 py-1 btn-default self-start" disabled={loadingMore() || data.loading} onClick={showMore}>
              {loadingMore() ? "Loading…" : `Show more (${(d()?.total ?? 0) - products().length} left)`}
            </button>
          </Show>
        </Show>

        <Show when={tab() === "services"}>
          <p class="text-xs opacity-70">Services without a price can still be priced by hand on an offer. Target margin: {d()?.targets?.services ?? "–"} %.</p>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr>
                  <th class={th}>Service</th>
                  <th class={th}>Section</th>
                  <th class={th}>Price excl. VAT</th>
                  <th class={th}>Cost (low – likely – high)</th>
                  <th class={th}>Margin (likely / worst)</th>
                  <th class={th}>Cost source</th>
                </tr>
              </thead>
              <tbody>
                <For each={d()?.services} fallback={<tr><td class={td}>No services in this pricebook version.</td></tr>}>
                  {(s) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class={td}>
                        {s.nameEn || s.nameDa}
                        <div class="text-xs opacity-70">{s.nameDa} · per {s.unitDa}</div>
                      </td>
                      <td class={td}>{SECTION_EN[s.section] ?? s.section}</td>
                      <td class={td} classList={{ "text-red-600": s.unitPrice === null }}>
                        {s.unitPrice === null ? "no price" : kr(s.unitPrice)}
                        <Show when={s.unitPrice !== null}><div class="text-xs opacity-70">{s.priceSource === "sales" ? "Grove price" : "cost + target margin"}</div></Show>
                      </td>
                      <td class={td}>{s.costLikely === undefined ? "–" : [s.costLow, s.costLikely, s.costHigh].map(kr).join(" – ")}</td>
                      <td class={td} classList={{ "text-amber-700 font-semibold": s.marginPct !== null && s.targetMarginPct !== undefined && s.marginPct < s.targetMarginPct }}>
                        {s.marginPct === null ? "–" : `${s.marginPct} % / ${s.worstMarginPct} %`}
                      </td>
                      <td class={td}>
                        <Show when={s.source.priceId} fallback={<span class="opacity-70">{s.costLikely === undefined ? "–" : s.source.title}</span>}>
                          <SourceCell s={s.source} />
                          <div class="text-xs opacity-60">
                            {s.source.price} {s.source.currency} · <span class="font-mono">{s.source.priceId}</span>
                            <Show when={s.vatUnclear}><span class="text-amber-700"> · VAT unclear</span></Show>
                          </div>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/prices")({ component: Prices });
