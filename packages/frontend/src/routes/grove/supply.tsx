// Supply for forward orders: plants promised (signed) and likely (sent or
// draft offers ticked "Forward order") per exact product and season, against
// own production at the expected take rate plus supplier capacity. A product
// is species · cultivar · rootstock · propagation · organic · bare root or
// container · production years, so pears never cover an order for apples.
// Per species, the totals show where one product is short and another has
// plants to spare. The plan is edited here and kept in the app's database.
// Grove team only.
import { cleanYears, defaultYears, FORM_EN, FORMS, PROPAGATIONS, type ProductSpec } from "@rw/db/productSpec.ts";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createResource, createSignal, For, Index, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { PROPAGATION_EN } from "~/grove/offerTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type PlanRow = ProductSpec & { latin: string; season: string; ownGrafts?: number; takePct?: number; suppliers?: { name: string; qty: number }[]; note?: string };
type Row = {
  key: string;
  group: string;
  spec: ProductSpec;
  label: string;
  latin: string;
  name?: string;
  season: string;
  signed: number;
  likely: number;
  ownGrafts: number;
  takePct: number | null;
  ownExpected: number;
  suppliers: { name: string; qty: number }[];
  available: number;
  afterSigned: number;
  afterLikely: number;
  planned: boolean;
  /** what the plan row leaves open */
  planMissing: string[];
  /** fields the orders counted here don't state */
  missing: string[];
  /** an order that fits several planned products: counted against none */
  candidates: number;
  offers: { _id: string; title?: string; client?: string; status: string }[];
  note?: string;
};
type Species = { group: string; latin: string; season: string; signed: number; likely: number; available: number; products: number; afterSigned: number; afterLikely: number };
type Data = { plan: PlanRow[]; rows: Row[]; species: Species[] };
// the form keeps everything as text so typing isn't interrupted
type EditRow = {
  latin: string;
  cultivar: string;
  rootstock: string;
  propagation: string;
  organic: string;
  form: string;
  years: string;
  season: string;
  ownGrafts: string;
  takePct: string;
  suppliers: string;
  note: string;
};

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
const th = "text-left font-semibold py-1 pr-2 whitespace-nowrap text-xs";
const td = "py-1 pr-2 align-top";
const n = (x: number) => x.toLocaleString("da-DK");
const STATUS_EN: Record<string, string> = { accepted: "signed", sent: "sent", draft: "draft" };
const blank: EditRow = { latin: "", cultivar: "", rootstock: "", propagation: "grafted", organic: "", form: "bare-root", years: "", season: "", ownGrafts: "", takePct: "", suppliers: "", note: "" };

const toEdit = (p: PlanRow): EditRow => ({
  latin: p.latin,
  cultivar: p.cultivar ?? "",
  rootstock: p.rootstock ?? "",
  propagation: (p.propagation as string) ?? "",
  organic: p.organic === true ? "yes" : p.organic === false ? "no" : "",
  form: (p.form as string) ?? "",
  years: p.years ?? "",
  season: p.season,
  ownGrafts: p.ownGrafts === undefined ? "" : String(p.ownGrafts),
  takePct: p.takePct === undefined ? "" : String(p.takePct),
  suppliers: (p.suppliers ?? []).map((s) => `${s.name}: ${s.qty}`).join("; "),
  note: p.note ?? "",
});

function parseSuppliers(text: string, row: number): { name: string; qty: number }[] {
  return text
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((part) => {
      // whole plants; "1.000" and "1 000" are thousands
      const m = part.match(/^(.*?)[:=]\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)$/);
      if (!m || !m[1].trim()) throw new Error(`Row ${row}: write suppliers as "Name: quantity; Name: quantity" (whole plants)`);
      return { name: m[1].trim(), qty: Number(m[2].replace(/[.\s]/g, "")) };
    });
}

type Options = { species: { latin: string; name?: string; cultivars: string[] }[]; rootstocks: string[] };

function Supply() {
  const [data, { refetch }] = createResource(() => (canSeeMoney() ? true : undefined), () => apiFetch<Data>("/internal/supply"));
  // searchable species, cultivars and rootstocks (from the pricebook and the saved plan)
  const [options] = createResource(() => (canSeeMoney() ? true : undefined), () => apiFetch<Options>("/internal/supply/options"));
  // suggestions only: a failed load just means none
  const opts = () => (options.error ? undefined : options.latest);
  const speciesOf = (latin: string) => latin.replace(/×/g, " ").trim().split(/\s+/).filter((w) => w && w.toLowerCase() !== "x").slice(0, 2).join(" ").toLowerCase();
  const cultivarsOf = (latin: string) => opts()?.species.find((x) => x.latin.toLowerCase() === speciesOf(latin))?.cultivars ?? [];
  const d = () => (data.error ? undefined : data.latest);
  const [editing, setEditing] = createSignal(false);
  const [rows, setRows] = createSignal<EditRow[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [open, setOpen] = createSignal<Set<string>>(new Set());

  const startEdit = () => {
    // the saved plan, plus a row for each ordered product that has no plan yet
    const plan = (d()?.plan ?? []).map(toEdit);
    // (not for an order that fits several planned products: that's for the order line to settle)
    const missing = (d()?.rows ?? []).filter((r) => !r.planned && r.candidates < 2).map((r) => toEdit({ ...r.spec, latin: r.latin, season: r.season }));
    const sameRow = (a: EditRow, b: EditRow) => JSON.stringify({ ...a, ownGrafts: "", takePct: "", suppliers: "", note: "" }) === JSON.stringify({ ...b, ownGrafts: "", takePct: "", suppliers: "", note: "" });
    setRows([...plan, ...missing.filter((m, i) => !plan.some((p) => sameRow(p, m)) && missing.findIndex((x) => sameRow(x, m)) === i)]);
    setEditing(true);
  };
  const setField = (i: number, k: keyof EditRow, v: string) => setRows(rows().map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function save(e: SubmitEvent) {
    e.preventDefault();
    let body: Record<string, unknown>[];
    try {
      body = rows()
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.latin.trim() || r.season.trim())
        .map(({ r, i }) => {
          if (r.years.trim() && !cleanYears(r.years)) throw new Error(`Row ${i + 1}: production years as e.g. 1+1 or 1`);
          return {
            latin: r.latin,
            cultivar: r.cultivar,
            rootstock: r.propagation === "grafted" || !r.propagation ? r.rootstock : "",
            propagation: r.propagation || undefined,
            organic: r.organic === "yes" ? true : r.organic === "no" ? false : undefined,
            form: r.form || undefined,
            years: r.years || undefined,
            season: r.season,
            ownGrafts: r.ownGrafts === "" ? undefined : Number(r.ownGrafts),
            takePct: r.takePct === "" ? undefined : Number(r.takePct),
            suppliers: parseSuppliers(r.suppliers, i + 1),
            note: r.note || undefined,
          };
        });
    } catch (err) {
      showToast({ title: "Check the plan", description: (err as Error).message, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/internal/supply/plan", { method: "PUT", body: JSON.stringify({ rows: body }) });
      setEditing(false);
      refetch();
    } catch (err) {
      showToast({ title: "Plan not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (k: string) =>
    setOpen((s) => {
      const x = new Set(s);
      if (x.has(k)) x.delete(k);
      else x.add(k);
      return x;
    });
  const short = () => (d()?.rows ?? []).filter((r) => r.afterSigned < 0).length;
  const productsOf = (s: Species) => (d()?.rows ?? []).filter((r) => r.group === s.group);
  const red = (x: number) => ({ "text-red-700 dark:text-red-400 font-semibold": x < 0 });

  return (
    <div class="container mx-auto p-4 flex flex-col gap-3" data-testid="grove-supply">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Supply is only shown to the Grove team.</p>}>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-bold mr-auto">Supply for forward orders</h1>
          <button class="rounded-sm px-2 py-1 btn-default" disabled={!d()} onClick={() => (editing() ? setEditing(false) : startEdit())}>
            {editing() ? "Cancel" : "Edit supply plan"}
          </button>
        </div>
        <p class="text-sm opacity-80">
          Plants in offers ticked "Forward order", per exact product and delivery season: signed (accepted) and likely (sent or draft), against own production × expected take plus what suppliers can deliver. Supply only counts for the same product (rootstock, propagation, organic, bare root/container, production years); an order line that leaves a field open counts against the one planned product it fits, and says so. Designs (B) don't look at stock.
        </p>
        <Show when={data.error}><p class="text-sm text-red-600">{(data.error as Error)?.message}</p></Show>
        <Show when={short()}>
          <p class="text-sm font-semibold text-red-700 dark:text-red-400">{short()} product{short() === 1 ? "" : "s"} can't cover what is already signed.</p>
        </Show>

        <Show when={editing()}>
          <form class="flex flex-col gap-2 rounded-md border border-zinc-300 dark:border-slate-600 p-3" onSubmit={save}>
            <div class="overflow-x-auto">
              <table class="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr>
                    <th class={th}>Species (search)</th>
                    <th class={th}>Cultivar</th>
                    <th class={th}>Propagation</th>
                    <th class={th}>Rootstock (search)</th>
                    <th class={th}>Organic</th>
                    <th class={th}>Form</th>
                    <th class={th}>Years</th>
                    <th class={th}>Season</th>
                    <th class={th} title="How many we produce ourselves: grafts made (grafted) or seeds sown/seedlings potted (seedlings)">Own: plants started</th>
                    <th class={th} title="Share of our own plants expected to make it, e.g. 70 % graft take">Expected success %</th>
                    <th class={th} title="Other nurseries that can deliver this product, and how many plants each">Bought in from other nurseries</th>
                    <th class={th}>Note</th>
                    <th class={th} />
                  </tr>
                </thead>
                <tbody>
                  <Index each={rows()}>
                    {(r, i) => (
                      <tr>
                        <td class={td}><input class={input} required maxLength={100} list="supply-species" value={r().latin} placeholder="Type to search, e.g. Corylus" onInput={(e) => setField(i, "latin", e.currentTarget.value)} /></td>
                        <td class={td}>
                          <input class={input} maxLength={100} list={`supply-cultivars-${i}`} value={r().cultivar} placeholder="Corabel" onInput={(e) => setField(i, "cultivar", e.currentTarget.value)} />
                          <datalist id={`supply-cultivars-${i}`}>
                            <For each={cultivarsOf(r().latin)}>{(c) => <option value={c} />}</For>
                          </datalist>
                        </td>
                        <td class={td}>
                          <select class={input} value={r().propagation} onChange={(e) => setField(i, "propagation", e.currentTarget.value)}>
                            <option value="">–</option>
                            <For each={PROPAGATIONS}>{(p) => <option value={p}>{PROPAGATION_EN[p] ?? p}</option>}</For>
                          </select>
                        </td>
                        <td class={td}>
                          <input class={input} maxLength={100} disabled={!!r().propagation && r().propagation !== "grafted"} value={r().rootstock} placeholder={r().propagation && r().propagation !== "grafted" ? "own roots" : "Corylus colurna"} list="supply-rootstocks" onInput={(e) => setField(i, "rootstock", e.currentTarget.value)} />
                        </td>
                        <td class={td}>
                          <select class={input} value={r().organic} onChange={(e) => setField(i, "organic", e.currentTarget.value)}>
                            <option value="">–</option>
                            <option value="yes">organic</option>
                            <option value="no">not organic</option>
                          </select>
                        </td>
                        <td class={td}>
                          <select class={input} value={r().form} onChange={(e) => setField(i, "form", e.currentTarget.value)}>
                            <option value="">–</option>
                            <For each={FORMS}>{(f) => <option value={f}>{FORM_EN[f]}</option>}</For>
                          </select>
                        </td>
                        <td class={td}><input class={`${input} w-14`} maxLength={5} value={r().years} placeholder={defaultYears(r().propagation) ?? "1+1"} onInput={(e) => setField(i, "years", e.currentTarget.value)} /></td>
                        <td class={td}><input class={input} required maxLength={40} value={r().season} placeholder="Autumn 2027" onInput={(e) => setField(i, "season", e.currentTarget.value)} /></td>
                        <td class={td}><input class={`${input} w-24`} type="number" min="0" step="1" value={r().ownGrafts} placeholder="e.g. 1000" onInput={(e) => setField(i, "ownGrafts", e.currentTarget.value)} /></td>
                        <td class={td}><input class={`${input} w-16`} type="number" min="0" max="100" value={r().takePct} placeholder="70" onInput={(e) => setField(i, "takePct", e.currentTarget.value)} /></td>
                        <td class={td}><input class={input} maxLength={1000} value={r().suppliers} placeholder="Nursery: plants, e.g. Vester Skovgaard: 2000" onInput={(e) => setField(i, "suppliers", e.currentTarget.value)} /></td>
                        <td class={td}><input class={input} maxLength={500} value={r().note} onInput={(e) => setField(i, "note", e.currentTarget.value)} /></td>
                        <td class={td}>
                          <button type="button" class="text-xs underline" onClick={() => setRows(rows().filter((_, j) => j !== i))}>Remove</button>
                        </td>
                      </tr>
                    )}
                  </Index>
                </tbody>
              </table>
            </div>
            <datalist id="supply-species">
              <For each={opts()?.species}>{(x) => <option value={x.latin}>{x.name ?? ""}</option>}</For>
            </datalist>
            <datalist id="supply-rootstocks">
              <For each={opts()?.rootstocks}>{(x) => <option value={x} />}</For>
            </datalist>
            <p class="text-xs opacity-80">
              <b>Own: plants started</b> is what we produce ourselves: grafts made (grafted) or seeds sown (seedlings). <b>Expected success %</b> is how many of them we expect to make it (e.g. 70 % graft take), so 1,000 grafts at 70 % = 700 plants. <b>Bought in</b> lists other nurseries that can deliver the same product, as "Nursery: plants", several separated by ";".
            </p>
            <div class="flex flex-wrap gap-2 items-center">
              <button type="button" class="text-sm underline" onClick={() => setRows([...rows(), { ...blank }])}>Add a product</button>
              <button class="rounded-sm px-2 py-1 btn-default" disabled={busy()}>Save plan</button>
              <span class="text-xs opacity-70">
                One row per product and season. Years left empty: grafted 1+1, seedlings 1. Seasons in Danish or English ("Efterår 2027") line up with the offers. Kept in the app's database, not in the code.
              </span>
            </div>
          </form>
        </Show>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr>
                <th class={th}>Product</th>
                <th class={th}>Season</th>
                <th class={th}>Signed</th>
                <th class={th}>Likely</th>
                <th class={th}>Own × success</th>
                <th class={th}>Bought in</th>
                <th class={th}>Available</th>
                <th class={th}>After signed</th>
                <th class={th}>After likely</th>
              </tr>
            </thead>
            <tbody>
              <For each={d()?.species} fallback={<tr><td class={td} colSpan={9}>{data.loading ? "Loading…" : 'No forward orders or supply plan yet. Tick "Forward order" on an offer to see it here.'}</td></tr>}>
                {(s) => (
                  <>
                    <tr class="border-t-2 border-zinc-300 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800">
                      <td class={`${td} font-semibold`}><i>{s.latin}</i> <span class="font-normal text-xs opacity-70">all {s.products} product{s.products === 1 ? "" : "s"}</span></td>
                      <td class={td}>{s.season}</td>
                      <td class={td}>{n(s.signed)}</td>
                      <td class={td}>{n(s.likely)}</td>
                      <td class={td} />
                      <td class={td} />
                      <td class={`${td} font-semibold`}>{n(s.available)}</td>
                      <td class={td} classList={red(s.afterSigned)}>{n(s.afterSigned)}</td>
                      <td class={td} classList={red(s.afterLikely)}>{n(s.afterLikely)}</td>
                    </tr>
                    <For each={productsOf(s)}>
                      {(r) => (
                        <>
                          <tr class="border-t border-zinc-200 dark:border-slate-700">
                            <td class={`${td} pl-4`}>
                              <button class="underline text-left" onClick={() => toggle(r.key)} aria-expanded={open().has(r.key)}>
                                {r.label}
                              </button>
                              <Show when={r.name}><span class="opacity-70 text-xs"> {r.name}</span></Show>
                              <Show when={!r.planned && r.candidates < 2}><div class="text-xs text-amber-700">No supply plan for this product</div></Show>
                              <Show when={r.candidates > 1}><div class="text-xs text-amber-700">Fits {r.candidates} planned products: say which on the order line (e.g. bare root or container)</div></Show>
                              <Show when={r.planMissing.length}><div class="text-xs text-amber-700">Plan row doesn't say: {r.planMissing.join(", ")}</div></Show>
                              <Show when={r.missing.length}><div class="text-xs opacity-70">Counted here, but the order lines don't say: {r.missing.join(", ")}</div></Show>
                            </td>
                            <td class={td}>{r.season}</td>
                            <td class={td}>{n(r.signed)}</td>
                            <td class={td}>{n(r.likely)}</td>
                            <td class={td}>{r.ownGrafts ? `${n(r.ownGrafts)} × ${r.takePct ?? 0} % = ${n(r.ownExpected)}` : "–"}</td>
                            <td class={td}>{r.suppliers.length ? r.suppliers.map((x) => `${x.name} ${n(x.qty)}`).join(", ") : "–"}</td>
                            <td class={td}>{n(r.available)}</td>
                            <td class={td} classList={red(r.afterSigned)}>{n(r.afterSigned)}</td>
                            <td class={td} classList={{ ...red(r.afterLikely), "text-amber-700": r.afterLikely >= 0 && r.afterSigned >= 0 && r.afterLikely < r.available * 0.1 }}>{n(r.afterLikely)}</td>
                          </tr>
                          <Show when={open().has(r.key)}>
                            <tr>
                              <td class={`${td} text-xs pl-8`} colSpan={9}>
                                <div class="flex flex-wrap gap-6 pb-2">
                                  <div>
                                    <div class="font-semibold">Offers</div>
                                    <For each={r.offers} fallback={<span class="opacity-70">None</span>}>
                                      {(o) => (
                                        <div>
                                          <Link to="/grove/offers/$offerId" params={{ offerId: String(o._id) }} class="underline">{o.title || "Offer"}</Link>
                                          <span class="opacity-70"> {o.client} · {STATUS_EN[o.status] ?? o.status}</span>
                                        </div>
                                      )}
                                    </For>
                                  </div>
                                  <Show when={r.note}><div><div class="font-semibold">Note</div>{r.note}</div></Show>
                                </div>
                              </td>
                            </tr>
                          </Show>
                        </>
                      )}
                    </For>
                  </>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <p class="text-xs opacity-70">
          The species row adds up every product of that species and season: when one product is short and another has plants to spare, a substitute is decided on the order with the client.
        </p>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/supply")({ component: Supply });
