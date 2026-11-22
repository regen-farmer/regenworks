// One economic scenario (B · Projects → Economics, Grove team only): farm, fields and designs →
// what the land does today → value chain → establishment and management costs → the cash flow in
// three cases (pessimistic, likely, optimistic). The Grove Twin's yields per field come next.
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney, kr } from "~/grove/access.ts";
import { apiFetch } from "~/util/apiFetch.ts";
import type { AssumptionsInfo, Farm } from "./index.tsx";

type Band = { low: number; likely: number; high: number };
type CropChoice = {
  crop_id: string;
  form?: string;
  channel?: string;
  valueChainLine?: string;
  price?: Band | null;
  processingPerKg?: number | null;
  processingLoss?: number | null;
  plantCost?: number | null;
  replacementRate?: number | null;
  pruningPerPlant?: number | null;
  harvestPerKg?: number | null;
  postharvestPerKg?: number | null;
};
type Scenario = {
  _id: string;
  name: string;
  notes?: string;
  farm: string;
  fields: { layer: string; scenario?: string | null; plantingYear?: number | null }[];
  horizonYears: number;
  discountRate?: number | null;
  assumptionsVersion?: number | null;
  crops: CropChoice[];
  establishment: Record<string, number | null | undefined>;
  management: Record<string, number | null | undefined>;
  baseline: { landUse?: string; opportunityPerHa?: Band | null; organic: boolean; paymentsToday: string[]; paymentOverrides?: Record<string, boolean> | null };
};
type CaseResult = { years: number[]; net: number[]; cumulative: number[]; lines: { key: string; label: string; group: string; years: number[] }[]; npv: number; paybackYear: number | null; worstYear: { year: number; net: number }; cumulativeLowest: { year: number; value: number } };
type Result = {
  cases: Record<"low" | "likely" | "high", CaseResult>;
  noData: { crop_id: string | null; what: string }[];
  payments: { payment_id: string; scheme: string; today: boolean; withTrees: boolean; reason: string; kr_per_year: number }[];
  totals: { fieldHa: number; treeHa: number; plants: number; plantsByCrop: Record<string, number> };
  fields: { fieldId: string; name: string; fieldHa: number; treeHa: number; maxRowSpacingM: number | null; plants: { crop_id: string | null; label: string; count: number }[] }[];
  problems: string[];
  assumptions: { version: number; importedAt: string };
  usingLatest: boolean;
};

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";
const numIn = `${input} w-24 text-right`;
const CASE_LABEL = { low: "Pessimistic", likely: "Likely", high: "Optimistic" } as const;
const LAND_USES = ["arable", "grass-clover", "permanent grass", "grazing", "other"];
const EST: [string, string][] = [["sitePrepPerHa", "Site preparation (kr/ha tree cover)"], ["plantingPerPlant", "Planting (kr/plant)"], ["protectionPerPlant", "Tree protection (kr/plant)"], ["irrigationPerHa", "Irrigation (kr/ha tree cover)"], ["fencingTotal", "Fencing (kr in all)"], ["other", "Other (kr in all)"]];
const MAN: [string, string][] = [["mowingPerHa", "Mowing (kr/ha tree cover/yr)"], ["otherPerYear", "Other (kr/yr)"]];
const CROP_COSTS: [keyof CropChoice, string, string][] = [["plantCost", "Plant (kr)", "plant_cost"], ["replacementRate", "Replanted (0-1)", "replacement_rate"], ["pruningPerPlant", "Pruning (kr/plant/yr)", "pruning_cost"], ["harvestPerKg", "Harvest (kr/kg)", "harvest_cost"], ["postharvestPerKg", "Post-harvest (kr/kg)", "postharvest_cost"]];

const toNum = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const fmtBand = (b: { low: number; likely: number; high: number } | null | undefined, unit = "") => (b ? `${b.low}–${b.high}${unit} (likely ${b.likely})` : "no data");

function Chart(props: { r: Result }) {
  const W = 640;
  const H = 200;
  const all = () => (["low", "likely", "high"] as const).flatMap((c) => props.r.cases[c].cumulative);
  const max = () => Math.max(1, ...all());
  const min = () => Math.min(0, ...all());
  const n = () => props.r.cases.likely.years.length;
  const x = (i: number) => 40 + (i / Math.max(1, n() - 1)) * (W - 50);
  const y = (v: number) => 10 + (1 - (v - min()) / (max() - min() || 1)) * (H - 30);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="w-full max-w-3xl" role="img" aria-label="Cumulative cash flow by case">
      <line x1={40} x2={W - 10} y1={y(0)} y2={y(0)} stroke="currentColor" stroke-opacity="0.3" />
      <text x={36} y={y(0) + 4} font-size="10" text-anchor="end" fill="currentColor" opacity="0.7">0</text>
      <text x={36} y={y(max()) + 4} font-size="10" text-anchor="end" fill="currentColor" opacity="0.7">{Math.round(max() / 1000)}k</text>
      <text x={36} y={y(min()) + 4} font-size="10" text-anchor="end" fill="currentColor" opacity="0.7">{Math.round(min() / 1000)}k</text>
      <path d={path(props.r.cases.low.cumulative)} fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4 3" />
      <path d={path(props.r.cases.likely.cumulative)} fill="none" stroke="#047857" stroke-width="2.5" />
      <path d={path(props.r.cases.high.cumulative)} fill="none" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="4 3" />
      <For each={[1, 5, 10, 15, 20, 25, 30, 40, 50, 60].filter((v) => v <= n())}>
        {(yr) => <text x={x(yr - 1)} y={H - 5} font-size="10" text-anchor="middle" fill="currentColor" opacity="0.7">{yr}</text>}
      </For>
    </svg>
  );
}

function EconomicScenario() {
  const params = Route.useParams();
  const [loaded, { mutate }] = createResource(() => (canSeeMoney() ? params().scenarioId : undefined), (id) => apiFetch<{ scenario: Scenario }>(`/internal/economics/${id}`));
  const [assumptions] = createResource(() => canSeeMoney() || undefined, () => apiFetch<AssumptionsInfo>("/internal/economics/assumptions"));
  const [farms] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ farms: Farm[] }>("/internal/economics/farms"));
  const [lines] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ lines: { id: string; name: string }[] }>("/internal/value-chains").catch(() => ({ lines: [] })));
  const [s, setS] = createStore<Scenario>({} as Scenario);
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [view, setView] = createSignal<"low" | "likely" | "high">("likely");
  createEffect(() => {
    const sc = loaded()?.scenario;
    if (sc) setS(reconcile({ ...sc, crops: sc.crops ?? [], establishment: sc.establishment ?? {}, management: sc.management ?? {}, baseline: { ...sc.baseline, organic: !!sc.baseline?.organic, paymentsToday: sc.baseline?.paymentsToday ?? [] } }));
  });
  const [result, { refetch: recalc }] = createResource(() => (loaded()?.scenario ? params().scenarioId : undefined), (id) => apiFetch<Result>(`/internal/economics/${id}/result`));
  const change = (fn: (x: Scenario) => void) => {
    setS(produce(fn));
    setDirty(true);
  };
  const farm = createMemo(() => farms()?.farms.find((f) => f._id === String(s.farm)));
  const range = (parameter: string, crop: string | null) => assumptions()?.ranges.find((r) => r.parameter === parameter && (r.crop_id || "") === (crop ?? ""));
  const crop = (id: string) => s.crops?.find((c) => c.crop_id === id);
  const setCrop = (id: string, k: keyof CropChoice, v: unknown) =>
    change((x) => {
      let c = x.crops.find((y) => y.crop_id === id);
      if (!c) {
        c = { crop_id: id };
        x.crops.push(c);
      }
      (c as any)[k] = v;
    });
  const cropsInPlan = createMemo(() => Object.keys(result()?.totals.plantsByCrop ?? {}).filter((k) => !k.startsWith("(")));

  async function save() {
    setSaving(true);
    try {
      const body = { name: s.name, notes: s.notes, fields: s.fields, horizonYears: s.horizonYears, discountRate: s.discountRate ?? null, crops: s.crops, establishment: s.establishment, management: s.management, baseline: s.baseline };
      const r = await apiFetch<{ scenario: Scenario }>(`/internal/economics/${params().scenarioId}`, { method: "PUT", body: JSON.stringify(body) });
      mutate(r);
      setDirty(false);
      recalc();
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function useLatest() {
    const v = assumptions()?.active?.version;
    if (!v) return;
    const r = await apiFetch<{ scenario: Scenario }>(`/internal/economics/${params().scenarioId}`, { method: "PUT", body: JSON.stringify({ assumptionsVersion: v }) });
    mutate(r);
    recalc();
  }

  const fieldEntry = (layer: string) => s.fields?.find((f) => String(f.layer) === layer);
  const bandIn = (b: Band | null | undefined, set: (b: Band | null) => void, placeholder?: Band) => (
    <span class="inline-flex gap-1 items-center">
      <For each={["low", "likely", "high"] as const}>
        {(k) => (
          <input
            class={`${input} w-16 text-right`}
            title={k}
            placeholder={placeholder ? String(placeholder[k]) : k}
            value={b?.[k] ?? ""}
            onChange={(e) => {
              const v = toNum(e.currentTarget.value);
              const cur = { low: b?.low ?? placeholder?.low ?? 0, likely: b?.likely ?? placeholder?.likely ?? 0, high: b?.high ?? placeholder?.high ?? 0 };
              if (v === null && !b) return;
              set(v === null ? null : { ...cur, [k]: v });
            }}
          />
        )}
      </For>
    </span>
  );

  return (
    <div class="container mx-auto p-4 flex flex-col gap-5" data-testid="grove-economic-scenario">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Economics is only shown to the Grove team.</p>}>
        <Show when={s._id} fallback={<p>{loaded.error ? (loaded.error as Error).message : "Loading…"}</p>}>
          <div class="flex items-center gap-3 flex-wrap">
            <Link to="/grove/economics" class="text-sm underline">← Economics</Link>
            <input class={`${input} text-2xl font-bold flex-1 min-w-64`} value={s.name} onChange={(e) => change((x) => (x.name = e.currentTarget.value))} maxLength={120} />
            <button class="rounded-sm px-3 py-1 btn-default text-sm" disabled={!dirty() || saving()} onClick={save}>{saving() ? "Saving…" : dirty() ? "Save and calculate" : "Saved"}</button>
          </div>
          <p class="text-sm opacity-70">
            Farm: <b>{farm()?.name ?? "…"}</b> · Assumptions version {s.assumptionsVersion ?? "–"}
            <Show when={result() && !result()!.usingLatest}>
              {" "}· a newer version exists <button class="underline" onClick={useLatest}>use version {assumptions()?.active?.version}</button>
            </Show>
            {" "}· Horizon <input class={`${input} w-14 text-right`} value={s.horizonYears} onChange={(e) => change((x) => (x.horizonYears = Number(e.currentTarget.value) || 30))} /> years · Discount rate{" "}
            <input class={`${input} w-16 text-right`} placeholder={String(range("discount_rate", null)?.likely ?? 0.04)} value={s.discountRate ?? ""} onChange={(e) => change((x) => (x.discountRate = toNum(e.currentTarget.value)))} />
          </p>

          <section class="flex flex-col gap-2">
            <h2 class="text-xl font-semibold">1 · Fields and designs</h2>
            <p class="text-xs opacity-70">Tick the fields in the plan and choose the design (scenario) on each. Plant counts come from the design's generated layout, as in the offers.</p>
            <table class="text-sm">
              <tbody>
                <For each={farm()?.fields}>
                  {(f) => {
                    const entry = () => fieldEntry(String(f._id));
                    return (
                      <tr class="border-t border-zinc-200 dark:border-slate-700">
                        <td class="py-1 pr-3">
                          <label class="flex gap-2 items-center">
                            <input
                              type="checkbox"
                              checked={!!entry()}
                              onChange={(e) =>
                                change((x) => {
                                  if (e.currentTarget.checked) x.fields.push({ layer: String(f._id), scenario: f.scenarios[0]?._id ?? null, plantingYear: new Date().getFullYear() + 1 });
                                  else x.fields = x.fields.filter((y) => String(y.layer) !== String(f._id));
                                })
                              }
                            />
                            {f.name} {f.size ? <span class="opacity-60">({Number(f.size).toFixed(1)} ha)</span> : null}
                          </label>
                        </td>
                        <td class="py-1 pr-3">
                          <Show when={entry()}>
                            <select class={input} value={String(entry()!.scenario ?? "")} onChange={(e) => change((x) => (x.fields.find((y) => String(y.layer) === String(f._id))!.scenario = e.currentTarget.value || null))}>
                              <option value="">No design</option>
                              <For each={f.scenarios}>{(p) => <option value={p._id}>{p.name}</option>}</For>
                            </select>
                          </Show>
                        </td>
                        <td class="py-1 pr-3">
                          <Show when={entry()}>
                            planted <input class={`${input} w-16`} value={entry()!.plantingYear ?? ""} onChange={(e) => change((x) => (x.fields.find((y) => String(y.layer) === String(f._id))!.plantingYear = Number(e.currentTarget.value) || null))} />
                          </Show>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
            <Show when={result()?.fields.length}>
              <ul class="text-xs opacity-80 list-disc ml-5">
                <For each={result()!.fields}>
                  {(f) => (
                    <li>
                      {f.name}: {f.fieldHa} ha field, {f.treeHa} ha tree cover{f.maxRowSpacingM ? `, rows up to ${f.maxRowSpacingM} m apart` : ""} ·{" "}
                      {f.plants.map((p) => `${p.count} ${p.crop_id ?? p.label}${p.crop_id ? "" : " (no economics yet)"}`).join(", ")}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <For each={result()?.problems}>{(p) => <p class="text-sm text-amber-700">{p}</p>}</For>
          </section>

          <section class="flex flex-col gap-2">
            <h2 class="text-xl font-semibold">2 · What the land does today</h2>
            <div class="flex gap-3 flex-wrap items-center text-sm">
              <label>
                Use today{" "}
                <select class={input} value={s.baseline?.landUse ?? "other"} onChange={(e) => change((x) => (x.baseline.landUse = e.currentTarget.value))}>
                  <For each={LAND_USES}>{(u) => <option value={u}>{u}</option>}</For>
                </select>
              </label>
              <label class="flex gap-1 items-center">
                <input type="checkbox" checked={!!s.baseline?.organic} onChange={(e) => change((x) => (x.baseline.organic = e.currentTarget.checked))} /> organic
              </label>
              <span>
                Earns today under the trees (kr/ha/yr, without payments):{" "}
                {bandIn(s.baseline?.opportunityPerHa, (b) => change((x) => (x.baseline.opportunityPerHa = b)), range("opportunity_cost", null) as Band | undefined)}
              </span>
            </div>
            <p class="text-xs opacity-70">The lost crop or grazing counts on the tree cover only; the alleys keep their use. Empty = Grove Data's value ({fmtBand(range("opportunity_cost", null) as any, " kr")}).</p>
            <table class="text-sm">
              <thead>
                <tr>
                  <th class="text-left pr-3">Area payment</th>
                  <th class="text-left pr-3">Today</th>
                  <th class="text-left pr-3">With the trees</th>
                  <th class="text-left pr-3">Change/yr</th>
                  <th class="text-left">Why</th>
                </tr>
              </thead>
              <tbody>
                <For each={assumptions()?.payments}>
                  {(p) => {
                    const check = () => result()?.payments.find((x) => x.payment_id === p.payment_id);
                    return (
                      <tr class="border-t border-zinc-200 dark:border-slate-700 align-top">
                        <td class="pr-3 py-1">{p.scheme} <span class="opacity-60">({p.rate} {p.currency}/ha)</span></td>
                        <td class="pr-3 py-1">
                          <input
                            type="checkbox"
                            checked={s.baseline?.paymentsToday?.includes(p.payment_id)}
                            onChange={(e) => change((x) => (x.baseline.paymentsToday = e.currentTarget.checked ? [...x.baseline.paymentsToday, p.payment_id] : x.baseline.paymentsToday.filter((y) => y !== p.payment_id)))}
                          />
                        </td>
                        <td class="pr-3 py-1">
                          <input
                            type="checkbox"
                            checked={typeof s.baseline?.paymentOverrides?.[p.payment_id] === "boolean" ? s.baseline.paymentOverrides![p.payment_id] : !!check()?.withTrees}
                            title={typeof s.baseline?.paymentOverrides?.[p.payment_id] === "boolean" ? "Set by hand for all fields" : "From the rules, field by field"}
                            onChange={(e) =>
                              change((x) => {
                                // only this payment is set by hand; the others keep following the rules field by field
                                x.baseline.paymentOverrides = { ...(x.baseline.paymentOverrides ?? {}), [p.payment_id]: e.currentTarget.checked };
                              })
                            }
                          />
                        </td>
                        <td class="pr-3 py-1 text-right">{check() ? kr(check()!.kr_per_year) : ""}</td>
                        <td class="py-1 text-xs opacity-80">{check()?.reason}</td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
            <Show when={Object.keys(s.baseline?.paymentOverrides ?? {}).length}>
              <button class="self-start text-xs underline" onClick={() => change((x) => (x.baseline.paymentOverrides = null))}>Use the rules again for "with the trees"</button>
            </Show>
          </section>

          <section class="flex flex-col gap-2">
            <h2 class="text-xl font-semibold">3 · Value chain</h2>
            <p class="text-xs opacity-70">Per crop in the plan: what is sold, where, and for how much. Empty price = Grove Data's farm-gate price for the crop's form at harvest. Processing cost and loss for drying, cracking, packing; a value-chain line from the Library can be noted for reference.</p>
            <Show when={cropsInPlan().length} fallback={<p class="text-sm opacity-70">Choose fields and designs, then save, to see the crops.</p>}>
              <table class="text-sm">
                <thead>
                  <tr>
                    <th class="text-left pr-3">Crop</th>
                    <th class="text-left pr-3">Sold as</th>
                    <th class="text-left pr-3">Channel</th>
                    <th class="text-left pr-3">Price kr/kg (low · likely · high)</th>
                    <th class="text-left pr-3">Processing kr/kg</th>
                    <th class="text-left pr-3">Loss</th>
                    <th class="text-left">Value-chain line</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={cropsInPlan()}>
                    {(id) => (
                      <tr class="border-t border-zinc-200 dark:border-slate-700">
                        <td class="pr-3 py-1">{id} <span class="opacity-60">({result()!.totals.plantsByCrop[id]})</span></td>
                        <td class="pr-3 py-1"><input class={`${input} w-28`} placeholder={assumptions()?.crops.find((c) => c.crop_id === id)?.form_at_harvest ?? ""} value={crop(id)?.form ?? ""} onChange={(e) => setCrop(id, "form", e.currentTarget.value)} /></td>
                        <td class="pr-3 py-1"><input class={`${input} w-28`} placeholder="farm gate" value={crop(id)?.channel ?? ""} onChange={(e) => setCrop(id, "channel", e.currentTarget.value)} /></td>
                        <td class="pr-3 py-1">{bandIn(crop(id)?.price, (b) => setCrop(id, "price", b), range("price", id) as Band | undefined)}</td>
                        <td class="pr-3 py-1"><input class={numIn} value={crop(id)?.processingPerKg ?? ""} onChange={(e) => setCrop(id, "processingPerKg", toNum(e.currentTarget.value))} /></td>
                        <td class="pr-3 py-1"><input class={`${input} w-16 text-right`} placeholder="0-1" value={crop(id)?.processingLoss ?? ""} onChange={(e) => setCrop(id, "processingLoss", toNum(e.currentTarget.value))} /></td>
                        <td class="py-1">
                          <select class={input} value={crop(id)?.valueChainLine ?? ""} onChange={(e) => setCrop(id, "valueChainLine", e.currentTarget.value)}>
                            <option value="">–</option>
                            <For each={lines()?.lines}>{(l) => <option value={l.id}>{l.name}</option>}</For>
                          </select>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </section>

          <section class="flex flex-col gap-2">
            <h2 class="text-xl font-semibold">4 · Establishment and management costs</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <For each={EST}>
                {([k, label]) => (
                  <label class="flex justify-between gap-2 items-center">
                    {label}
                    <input class={numIn} value={s.establishment?.[k] ?? ""} placeholder="no data" onChange={(e) => change((x) => (x.establishment[k] = toNum(e.currentTarget.value)))} />
                  </label>
                )}
              </For>
              <For each={MAN}>
                {([k, label]) => (
                  <label class="flex justify-between gap-2 items-center">
                    {label}
                    <input class={numIn} value={s.management?.[k] ?? ""} placeholder="no data" onChange={(e) => change((x) => (x.management[k] = toNum(e.currentTarget.value)))} />
                  </label>
                )}
              </For>
            </div>
            <Show when={cropsInPlan().length}>
              <p class="text-xs opacity-70">Per crop; empty = Grove Data's range (shown greyed).</p>
              <table class="text-sm">
                <thead>
                  <tr>
                    <th class="text-left pr-3">Crop</th>
                    <For each={CROP_COSTS}>{([, label]) => <th class="text-left pr-3">{label}</th>}</For>
                  </tr>
                </thead>
                <tbody>
                  <For each={cropsInPlan()}>
                    {(id) => (
                      <tr class="border-t border-zinc-200 dark:border-slate-700">
                        <td class="pr-3 py-1">{id}</td>
                        <For each={CROP_COSTS}>
                          {([k, , param]) => {
                            const r = () => range(param, id);
                            return (
                              <td class="pr-3 py-1">
                                <input class={numIn} placeholder={r() ? `${r()!.low}–${r()!.high}` : "no data"} value={(crop(id)?.[k] as any) ?? ""} onChange={(e) => setCrop(id, k, toNum(e.currentTarget.value))} />
                              </td>
                            );
                          }}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </section>

          <section class="flex flex-col gap-2">
            <h2 class="text-xl font-semibold">5 · Result</h2>
            <Show when={dirty()}>
              <p class="text-sm text-amber-700">Unsaved changes: save to calculate again.</p>
            </Show>
            <Show when={result()} fallback={<p class="text-sm">{result.error ? (result.error as Error).message : "Calculating…"}</p>}>
              {(r) => (
                <>
                  <p class="text-sm">
                    {r().totals.fieldHa} ha in the plan, {r().totals.treeHa} ha tree cover, {r().totals.plants} plants. Change against today, kr; year 1 = planting year.
                  </p>
                  <table class="text-sm">
                    <thead>
                      <tr>
                        <th class="text-left pr-4" />
                        <For each={["low", "likely", "high"] as const}>{(c) => <th class="text-right pr-4">{CASE_LABEL[c]}</th>}</For>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td class="pr-4">Net present value</td><For each={["low", "likely", "high"] as const}>{(c) => <td class="text-right pr-4 font-semibold">{kr(r().cases[c].npv)}</td>}</For></tr>
                      <tr><td class="pr-4">Pays back in year</td><For each={["low", "likely", "high"] as const}>{(c) => <td class="text-right pr-4">{r().cases[c].paybackYear ?? "not within the horizon"}</td>}</For></tr>
                      <tr><td class="pr-4">Worst year</td><For each={["low", "likely", "high"] as const}>{(c) => <td class="text-right pr-4">{kr(r().cases[c].worstYear.net)} (year {r().cases[c].worstYear.year})</td>}</For></tr>
                      <tr><td class="pr-4">Deepest point (cumulative)</td><For each={["low", "likely", "high"] as const}>{(c) => <td class="text-right pr-4">{kr(r().cases[c].cumulativeLowest.value)} (year {r().cases[c].cumulativeLowest.year})</td>}</For></tr>
                    </tbody>
                  </table>
                  <Chart r={r()} />
                  <p class="text-xs opacity-70">Cumulative cash flow: likely (green), pessimistic (red, dashed), optimistic (blue, dashed). Pessimistic takes the late start, low yields and prices and high costs together, so it is a floor, not a typical year.</p>
                  <Show when={r().noData.length}>
                    <div class="flex flex-wrap gap-1 items-center text-xs">
                      <span class="font-semibold">No data (counted as 0):</span>
                      <For each={r().noData}>{(d) => <span class="rounded-sm bg-amber-100 dark:bg-amber-900 px-1">{d.crop_id ? `${d.crop_id}: ` : ""}{d.what}</span>}</For>
                    </div>
                  </Show>
                  <details>
                    <summary class="text-sm cursor-pointer">Year by year</summary>
                    <div class="flex gap-2 text-sm my-1">
                      <For each={["low", "likely", "high"] as const}>
                        {(c) => <button class={`underline ${view() === c ? "font-bold" : "opacity-70"}`} onClick={() => setView(c)}>{CASE_LABEL[c]}</button>}
                      </For>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="text-xs">
                        <thead>
                          <tr>
                            <th class="text-left pr-3 sticky left-0 bg-white dark:bg-slate-800">kr</th>
                            <For each={r().cases[view()].years}>{(y) => <th class="text-right pr-2">{y}</th>}</For>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={r().cases[view()].lines}>
                            {(l) => (
                              <tr class="border-t border-zinc-200 dark:border-slate-700">
                                <td class="pr-3 sticky left-0 bg-white dark:bg-slate-800 whitespace-nowrap">{l.label}</td>
                                <For each={l.years}>{(v) => <td class="text-right pr-2">{v ? Math.round(v).toLocaleString("da-DK") : ""}</td>}</For>
                              </tr>
                            )}
                          </For>
                          <tr class="border-t-2 border-zinc-400 font-semibold">
                            <td class="pr-3 sticky left-0 bg-white dark:bg-slate-800">Net</td>
                            <For each={r().cases[view()].net}>{(v) => <td class="text-right pr-2">{v.toLocaleString("da-DK")}</td>}</For>
                          </tr>
                          <tr>
                            <td class="pr-3 sticky left-0 bg-white dark:bg-slate-800">Cumulative</td>
                            <For each={r().cases[view()].cumulative}>{(v) => <td class={`text-right pr-2 ${v < 0 ? "text-red-600" : ""}`}>{v.toLocaleString("da-DK")}</td>}</For>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
            </Show>
          </section>

          <section class="flex flex-col gap-1">
            <h2 class="text-xl font-semibold">6 · Grove Twin</h2>
            <p class="text-sm opacity-80">
              Coming next: yields per field from the screening (how well each species suits the field, frost and drought years) instead of Grove Data's
              national curves, and the crop or grazing lost in the alleys from the alley-crop model, instead of one value per ha.
            </p>
          </section>

          <section class="flex flex-col gap-1">
            <h2 class="text-xl font-semibold">Notes</h2>
            <textarea class={`${input} min-h-20`} value={s.notes ?? ""} onChange={(e) => change((x) => (x.notes = e.currentTarget.value))} maxLength={4000} />
          </section>
        </Show>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/economics/$scenarioId")({ component: EconomicScenario });
