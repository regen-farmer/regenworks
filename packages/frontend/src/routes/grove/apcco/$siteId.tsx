// D · APCCO Uganda → one site: its field data (CSV imports from the templates), what each model
// still needs, the SHAMBA scenario and run, and the run history with results. Grove team only.
import { Link, createFileRoute } from "@tanstack/solid-router";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { isGroveTeam } from "~/grove/access.ts";
import {
  ALLOMETRY,
  DATA_KINDS,
  GWP,
  MODEL_NAMES,
  btn,
  card,
  download,
  fmt,
  input,
  primary,
  runCsv,
  sendJson,
  type Check,
  type DataKind,
  type Model,
  type ParameterSet,
  type Run,
  type ShambaScenario,
  type Site,
} from "~/grove/apcco.ts";
import { apiFetch, apiFetchBlob } from "~/util/apiFetch.ts";

export const Route = createFileRoute("/grove/apcco/$siteId")({ component: ApccoSite });

type Template = { title: string; help: string; maxRows: number; columns: { name: string; required: boolean; help: string }[] };
type Detail = {
  site: Site;
  datasets: { kind: DataKind; filename?: string; source?: string; warnings?: string[]; rows: number; updatedAt: string }[];
  readiness: { summary: any; models: Record<Model, { checks: Check[]; runnable: boolean }> };
  runnerConfigured: Record<Model, boolean>;
};

function ApccoSite() {
  const params = Route.useParams();
  const [detail, { refetch }] = createResource(
    () => (isGroveTeam() ? params().siteId : undefined),
    (id) => apiFetch<Detail>(`/internal/apcco/sites/${id}`),
  );
  const [templates] = createResource(() => (isGroveTeam() ? true : undefined), () => apiFetch<{ templates: Record<DataKind, Template> }>("/internal/apcco/templates"));
  const [runs, { refetch: refetchRuns }] = createResource(
    () => (isGroveTeam() ? params().siteId : undefined),
    (id) => apiFetch<{ runs: Run[] }>(`/internal/apcco/sites/${id}/runs`),
  );
  const [tab, setTab] = createSignal<"data" | "models" | "runs">("data");

  return (
    <Show when={isGroveTeam()} fallback={<p class="p-4">Only for the Grove team.</p>}>
      <div class="p-4 max-w-6xl">
        <Toaster />
        <Link to="/grove/apcco" class="text-sm underline opacity-80">
          ← D · APCCO Uganda
        </Link>
        <Show when={detail()} fallback={<p class="mt-4 text-sm opacity-70">{detail.error ? String(detail.error.message) : "Loading…"}</p>}>
          <SiteHeader detail={detail()!} onSaved={refetch} />
          <div class="mt-4 flex gap-1 border-b border-zinc-300 dark:border-slate-600">
            <For each={[["data", "1 · Field data"], ["models", "2 · Models"], ["runs", `3 · Runs (${runs()?.runs.length ?? 0})`]] as const}>
              {([id, label]) => (
                <button class="px-3 py-1 text-sm -mb-px border-b-2" classList={{ "border-green-700 font-semibold": tab() === id, "border-transparent": tab() !== id }} onClick={() => setTab(id)}>
                  {label}
                </button>
              )}
            </For>
          </div>
          <Show when={tab() === "data"}>
            <DataTab detail={detail()!} templates={templates()?.templates} onChanged={refetch} />
          </Show>
          {/* kept mounted so scenario edits survive tab switches; keyed so another site starts fresh */}
          <Show when={detail()!.site._id} keyed>
            {(_id) => (
              <div classList={{ hidden: tab() !== "models" }}>
                <ModelsTab
                  detail={detail()!}
                  onRun={() => {
                    refetchRuns();
                    setTab("runs");
                  }}
                />
              </div>
            )}
          </Show>
          <Show when={tab() === "runs"}>
            <RunsTab runs={runs()?.runs ?? []} siteName={detail()!.site.name} />
          </Show>
        </Show>
      </div>
    </Show>
  );
}

function SiteHeader(props: { detail: Detail; onSaved: () => void }) {
  const s = () => props.detail.site;
  const sum = () => props.detail.readiness.summary;
  const [editing, setEditing] = createSignal(false);
  const [f, setF] = createSignal<any>({});
  const start = () => {
    setF({ name: s().name, district: s().district ?? "", lat: String(s().lat), lon: String(s().lon), areaHa: s().areaHa ? String(s().areaHa) : "", notes: s().notes ?? "" });
    setEditing(true);
  };
  async function save() {
    const v = f();
    const body: any = { name: v.name, district: v.district, notes: v.notes, lat: Number(String(v.lat).replace(",", ".")), lon: Number(String(v.lon).replace(",", ".")) };
    if (!s().boundary) body.areaHa = v.areaHa.trim() ? Number(v.areaHa.replace(",", ".")) : null;
    const r = await sendJson("PUT", `/internal/apcco/sites/${s()._id}`, body);
    if (!r.ok) showToast({ title: r.body?.error ?? "Not saved", variant: "destructive" });
    else {
      setEditing(false);
      props.onSaved();
    }
  }
  async function boundaryFile(file: File | undefined) {
    if (!file) return;
    let geo: any;
    try {
      geo = JSON.parse(await file.text());
    } catch {
      showToast({ title: "The file isn't GeoJSON", description: "Export the boundary as GeoJSON (e.g. from QGIS or geojson.io).", variant: "destructive" });
      return;
    }
    const r = await sendJson("PUT", `/internal/apcco/sites/${s()._id}`, { boundary: geo });
    if (!r.ok) showToast({ title: r.body?.error ?? "Boundary not saved", variant: "destructive" });
    else props.onSaved();
  }
  async function archive(on: boolean) {
    const r = await sendJson("PUT", `/internal/apcco/sites/${s()._id}`, { archived: on });
    if (r.ok) props.onSaved();
  }
  return (
    <div class="mt-2">
      <Show
        when={editing()}
        fallback={
          <div class="flex items-start gap-3 flex-wrap">
            <div>
              <h1 class="text-xl font-semibold">
                {s().name} <Show when={s().archived}><span class="text-sm opacity-60">(archived)</span></Show>
              </h1>
              <p class="text-sm opacity-80">
                {[s().district, `${fmt(s().lat, 5)}, ${fmt(s().lon, 5)}`, sum().areaHa ? `${fmt(sum().areaHa, 2)} ha${s().boundary ? " (from the boundary)" : ""}` : "no area yet", s().coffeeType].filter(Boolean).join(" · ")}
              </p>
              <Show when={s().notes}>
                <p class="text-sm mt-1 whitespace-pre-wrap">{s().notes}</p>
              </Show>
            </div>
            <div class="ml-auto flex gap-2 flex-wrap">
              <button class={btn} onClick={start}>
                Edit
              </button>
              <label class={`${btn} cursor-pointer`} title="A GeoJSON Polygon or MultiPolygon in longitude/latitude; the area is computed from it">
                <i class="fas fa-draw-polygon mr-1" /> {s().boundary ? "Replace boundary" : "Import boundary (GeoJSON)"}
                <input type="file" accept=".geojson,.json,application/geo+json,application/json" class="hidden" onChange={(e) => boundaryFile(e.currentTarget.files?.[0])} />
              </label>
              <button class={btn} onClick={() => archive(!s().archived)}>
                {s().archived ? "Unarchive" : "Archive"}
              </button>
            </div>
          </div>
        }
      >
        <div class={`${card} grid gap-2 max-w-xl`} style={{ "grid-template-columns": "auto 1fr" }}>
          <label class="text-sm leading-7">Name</label>
          <input class={input} value={f().name} onInput={(e) => setF({ ...f(), name: e.currentTarget.value })} />
          <label class="text-sm leading-7">District</label>
          <input class={input} value={f().district} onInput={(e) => setF({ ...f(), district: e.currentTarget.value })} />
          <label class="text-sm leading-7">Latitude, longitude</label>
          <div class="flex gap-2">
            <input class={`${input} w-32`} value={f().lat} onInput={(e) => setF({ ...f(), lat: e.currentTarget.value })} />
            <input class={`${input} w-32`} value={f().lon} onInput={(e) => setF({ ...f(), lon: e.currentTarget.value })} />
          </div>
          <label class="text-sm leading-7">Area (ha)</label>
          <Show when={!s().boundary} fallback={<span class="text-sm leading-7 opacity-70">From the boundary</span>}>
            <input class={`${input} w-32`} value={f().areaHa} onInput={(e) => setF({ ...f(), areaHa: e.currentTarget.value })} />
          </Show>
          <label class="text-sm leading-7">Notes</label>
          <textarea class={input} rows={3} value={f().notes} onInput={(e) => setF({ ...f(), notes: e.currentTarget.value })} />
          <div />
          <div class="flex gap-2">
            <button class={primary} onClick={save}>
              Save
            </button>
            <button class={btn} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

function DataTab(props: { detail: Detail; templates?: Record<DataKind, Template>; onChanged: () => void }) {
  const [errors, setErrors] = createSignal<{ kind: DataKind; errors: string[] } | null>(null);
  const [source, setSource] = createSignal("APCCO field team");
  const [busy, setBusy] = createSignal<DataKind | null>(null);
  const siteId = () => props.detail.site._id;

  async function upload(kind: DataKind, file: File | undefined) {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      showToast({ title: "Save the sheet as CSV first", description: "In Excel: File → Save as → CSV UTF-8.", variant: "destructive" });
      return;
    }
    setBusy(kind);
    setErrors(null);
    const r = await sendJson("POST", `/internal/apcco/sites/${siteId()}/data/${kind}`, { csv: await file.text(), filename: file.name, source: source() });
    setBusy(null);
    if (!r.ok) {
      setErrors({ kind, errors: r.body?.errors ?? [r.body?.error ?? "Import failed"] });
      return;
    }
    showToast({ title: `${r.body.rows} rows imported`, description: r.body.warnings?.join(" ") || undefined });
    props.onChanged();
  }
  async function remove(kind: DataKind) {
    if (!confirm("Remove this data from the site? Earlier runs keep the inputs they used.")) return;
    await sendJson("DELETE", `/internal/apcco/sites/${siteId()}/data/${kind}`);
    props.onChanged();
  }
  async function template(kind: DataKind) {
    const blob = await apiFetchBlob(`/internal/apcco/templates/${kind}.csv`);
    download(`apcco-${kind}-template.csv`, await blob.text());
  }
  const ds = (kind: DataKind) => props.detail.datasets.find((d) => d.kind === kind);
  const sum = () => props.detail.readiness.summary;
  const summaryLine = (kind: DataKind) => {
    const s = sum();
    switch (kind) {
      case "shade-trees":
        return s.shade.trees ? `${s.shade.trees} trees${s.shade.perHa ? ` (${fmt(s.shade.perHa)}/ha)` : ""}: ${s.shade.species.slice(0, 4).map((x: any) => `${x.species} ${x.count}`).join(", ")}${s.shade.species.length > 4 ? ", …" : ""}` : "";
      case "coffee-plots":
        return s.coffee.plots ? `${s.coffee.plots} plots, ${fmt(s.coffee.bushesPerHa, 0)} bushes/ha, age ${fmt(s.coffee.meanAgeYears)} yr${s.coffee.meanYieldKgHa !== null ? `, yield ${fmt(s.coffee.meanYieldKgHa, 0)} kg/ha` : ""}` : "";
      case "soil":
        return s.soil.points ? `${s.soil.points} points, SOC 0–30 cm ${fmt(s.soil.socTcHa0to30)} t C/ha, clay ${fmt(s.soil.clayPct)} %` : "";
      case "canopy":
        return s.canopy.points ? `${s.canopy.points} photos, LAI ${fmt(s.canopy.meanLai, 2)}, openness ${fmt(s.canopy.meanOpennessPct)} %` : "";
      case "weather-daily":
        return s.weatherDays ? `${s.weatherDays} days` : "";
      case "climate-monthly":
        return s.climate.climate && s.climate.from === "monthly import" ? "12 months" : "";
    }
  };
  return (
    <div class="mt-3">
      <div class="flex items-center gap-2 text-sm">
        <label>Collected by</label>
        <input class={`${input} w-64`} value={source()} onInput={(e) => setSource(e.currentTarget.value)} placeholder="e.g. APCCO field team, ROBUST" />
        <span class="opacity-70">Saved with each import. Importing a kind again replaces it.</span>
      </div>
      <Show when={errors()}>
        <div class="mt-3 rounded-sm border border-red-500 p-2 text-sm">
          <b>{props.templates?.[errors()!.kind]?.title ?? errors()!.kind}: the file wasn't imported.</b> Fix these and import it again:
          <ul class="list-disc ml-5 mt-1">
            <For each={errors()!.errors}>{(e) => <li>{e}</li>}</For>
          </ul>
        </div>
      </Show>
      <div class="mt-3 grid gap-3" style={{ "grid-template-columns": "repeat(auto-fill, minmax(320px, 1fr))" }}>
        <For each={DATA_KINDS}>
          {(kind) => {
            const t = () => props.templates?.[kind];
            return (
              <div class={card}>
                <div class="flex items-center gap-2">
                  <b class="text-sm">{t()?.title ?? kind}</b>
                  <Show when={ds(kind)} fallback={<span class="ml-auto text-xs opacity-60">not imported</span>}>
                    <span class="ml-auto text-xs text-green-700 dark:text-green-400">
                      <i class="fas fa-check mr-1" />
                      {ds(kind)!.rows} rows
                    </span>
                  </Show>
                </div>
                <p class="text-xs opacity-70 mt-1">{t()?.help}</p>
                <Show when={summaryLine(kind)}>
                  <p class="text-xs mt-1">{summaryLine(kind)}</p>
                </Show>
                <Show when={ds(kind)}>
                  <p class="text-xs opacity-60 mt-1">
                    {[ds(kind)!.filename, ds(kind)!.source, new Date(ds(kind)!.updatedAt).toLocaleDateString("en-GB")].filter(Boolean).join(" · ")}
                  </p>
                  <Show when={ds(kind)!.warnings?.length}>
                    <p class="text-xs text-amber-700 dark:text-amber-400 mt-1">{ds(kind)!.warnings!.join(" ")}</p>
                  </Show>
                </Show>
                <div class="mt-2 flex gap-2 flex-wrap">
                  <button class={btn} onClick={() => template(kind)}>
                    <i class="fas fa-download mr-1" /> Template
                  </button>
                  <label class={`${btn} cursor-pointer`} classList={{ "opacity-50": busy() === kind }}>
                    <i class="fas fa-upload mr-1" /> {busy() === kind ? "Importing…" : ds(kind) ? "Replace" : "Import CSV"}
                    <input type="file" accept=".csv,text/csv" class="hidden" onChange={(e) => {
                      upload(kind, e.currentTarget.files?.[0]);
                      e.currentTarget.value = "";
                    }} />
                  </label>
                  <Show when={ds(kind)}>
                    <button class={btn} onClick={() => remove(kind)}>
                      Remove
                    </button>
                  </Show>
                </div>
                <details class="mt-2 text-xs">
                  <summary class="cursor-pointer opacity-70">Columns</summary>
                  <ul class="mt-1">
                    <For each={t()?.columns ?? []}>
                      {(c) => (
                        <li>
                          <code>{c.name}</code>
                          {c.required ? " (required)" : ""}: {c.help}
                        </li>
                      )}
                    </For>
                  </ul>
                </details>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

function ModelsTab(props: { detail: Detail; onRun: () => void }) {
  const r = () => props.detail.readiness.models;
  const [sets] = createResource(() => apiFetch<{ sets: ParameterSet[] }>("/internal/apcco/parameter-sets?model=shamba"));
  const [draft] = createResource(() => props.detail.site._id, (id) => apiFetch<{ scenario: ShambaScenario; notes: string[]; defaultTreeRows: string[] }>(`/internal/apcco/sites/${id}/shamba/draft`));
  const [sc, setSc] = createSignal<ShambaScenario | null>(null);
  const [setId, setSetId] = createSignal("");
  const [running, setRunning] = createSignal(false);
  createEffect(() => {
    if (draft() && !sc()) setSc(structuredClone(draft()!.scenario));
  });
  createEffect(() => {
    if (sets() && !setId()) setSetId(sets()!.sets.find((s) => s.builtIn)?._id ?? sets()!.sets[0]?._id ?? "");
  });
  const update = (fn: (s: ShambaScenario) => void) => {
    const next = structuredClone(sc()!);
    fn(next);
    setSc(next);
  };
  const num = (v: string) => Number(v.replace(",", "."));
  // SHAMBA: cohort k uses row k of the chosen set's tree table
  const treeRowName = (k: number) => {
    const set = sets()?.sets.find((x) => x._id === setId());
    const rows: any[] | undefined = set?.values?.tables?.tree?.rows;
    if (rows?.length) {
      const r = rows[k];
      return r ? String(r[r.length - 1] ?? r[1] ?? `row ${k + 1}`) : "–";
    }
    return draft()?.defaultTreeRows?.[k] ?? `row ${k + 1}`;
  };
  const shambaReady = () => r().shamba.checks.filter((c) => c.item !== "Growth (diameter and age)").every((c) => c.ok);

  async function run() {
    setRunning(true);
    const res = await sendJson("POST", `/internal/apcco/sites/${props.detail.site._id}/runs/shamba`, { parameterSetId: setId(), scenario: sc() });
    setRunning(false);
    if (res.status === 201) {
      showToast({ title: "SHAMBA run done", description: `Net ${fmt(res.body.run.outputs?.totals?.total)} t CO₂e/ha over ${res.body.run.outputs?.years} years` });
      props.onRun();
    } else if (res.body?.run) {
      showToast({ title: "The run failed", description: res.body.run.error, variant: "destructive" });
      props.onRun();
    } else showToast({ title: res.body?.error ?? "Not run", variant: "destructive" });
  }

  return (
    <div class="mt-3">
      <div class="grid gap-3" style={{ "grid-template-columns": "repeat(auto-fill, minmax(300px, 1fr))" }}>
        <For each={(["shamba", "dynacof", "caf2021"] as Model[])}>
          {(m) => (
            <div class={card}>
              <b class="text-sm">{MODEL_NAMES[m]}</b>
              <Show when={!r()[m].runnable}>
                <span class="ml-2 text-xs opacity-60">runs coming in the next step</span>
              </Show>
              <ul class="mt-2 text-xs">
                <For each={r()[m].checks}>
                  {(c) => (
                    <li class="mb-1">
                      <i class={`fas ${c.ok ? "fa-check text-green-700 dark:text-green-400" : "fa-circle-exclamation text-amber-600"} mr-1`} />
                      <b>{c.item}</b>: {c.detail}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
      </div>

      <div class={`${card} mt-4`}>
        <div class="flex items-center gap-2 flex-wrap">
          <b>SHAMBA scenario</b>
          <span class="text-xs opacity-70">Prefilled from the field data; change anything before running.</span>
          <Show when={draft()}>
            <button class={`${btn} ml-auto`} onClick={() => setSc(structuredClone(draft()!.scenario))}>
              Reset from the data
            </button>
          </Show>
        </div>
        <Show when={draft()?.notes.length}>
          <ul class="mt-2 text-xs list-disc ml-5 opacity-80">
            <For each={draft()!.notes}>{(n) => <li>{n}</li>}</For>
          </ul>
        </Show>
        <Show when={sc()}>
          <div class="mt-3 flex gap-4 flex-wrap text-sm items-center">
            <label>
              Years <input type="number" min={1} max={100} class={`${input} w-16`} value={sc()!.years} onChange={(e) => update((s) => (s.years = Math.round(num(e.currentTarget.value))))} />
            </label>
            <label>
              Baseline{" "}
              <select class={input} value={sc()!.baseline} onChange={(e) => update((s) => (s.baseline = e.currentTarget.value as any))}>
                <option value="coffee">Coffee without shade trees</option>
                <option value="none">No trees</option>
              </select>
            </label>
            <label>
              Baseline allometry{" "}
              <select class={input} value={sc()!.baselineAllometry} onChange={(e) => update((s) => (s.baselineAllometry = e.currentTarget.value))}>
                <For each={ALLOMETRY}>{(a) => <option value={a}>{a}</option>}</For>
              </select>
            </label>
            <label>
              Mortality (%/yr) <input type="number" min={0} max={50} step="0.5" class={`${input} w-16`} value={Math.round(sc()!.mortality * 1000) / 10} onChange={(e) => update((s) => (s.mortality = num(e.currentTarget.value) / 100))} />
            </label>
            <label>
              GWP{" "}
              <select class={input} value={sc()!.gwp} onChange={(e) => update((s) => (s.gwp = e.currentTarget.value))}>
                <For each={GWP}>{(g) => <option value={g}>{g}</option>}</For>
              </select>
            </label>
          </div>

          <table class="mt-3 text-sm w-full">
            <thead>
              <tr class="text-left border-b border-zinc-300 dark:border-slate-600 text-xs">
                <th class="py-1">Cohort</th>
                <th title="SHAMBA: cohort 1 uses row 1 of the parameter set's tree table, cohort 2 row 2, cohort 3 row 3">Tree parameters</th>
                <th>Allometry</th>
                <th>Per ha</th>
                <th>Planted (yr)</th>
                <th>Growth curve: age (yr) → diameter (cm)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <For each={sc()!.cohorts}>
                {(c, i) => (
                  <tr class="border-b border-zinc-200 dark:border-slate-700 align-top">
                    <td class="py-1 pr-2">
                      <input class={`${input} w-48`} value={c.label} onChange={(e) => update((s) => (s.cohorts[i()].label = e.currentTarget.value))} />
                    </td>
                    <td class="text-xs pr-2" title="Row of the parameter set's tree table">
                      row {i() + 1}: {treeRowName(i())}
                    </td>
                    <td>
                      <select class={input} value={c.allometry} onChange={(e) => update((s) => (s.cohorts[i()].allometry = e.currentTarget.value))}>
                        <For each={ALLOMETRY}>{(a) => <option value={a}>{a}</option>}</For>
                      </select>
                    </td>
                    <td>
                      <input type="number" min={0} step="1" class={`${input} w-20`} value={c.densityPerHa} onChange={(e) => update((s) => (s.cohorts[i()].densityPerHa = Math.max(0, Math.round(num(e.currentTarget.value)))))} />
                    </td>
                    <td>
                      <input type="number" min={0} class={`${input} w-14`} value={c.plantYear} onChange={(e) => update((s) => (s.cohorts[i()].plantYear = Math.round(num(e.currentTarget.value))))} />
                    </td>
                    <td>
                      <div class="flex gap-1 flex-wrap">
                        <For each={c.growth}>
                          {(g, k) => (
                            <span class="inline-flex items-center gap-0.5 text-xs">
                              <input type="number" min={0} class={`${input} w-12`} value={g.age} disabled={k() === 0} onChange={(e) => update((s) => (s.cohorts[i()].growth[k()].age = num(e.currentTarget.value)))} />→
                              <input type="number" min={0} step="0.1" class={`${input} w-14`} value={g.diamCm} onChange={(e) => update((s) => (s.cohorts[i()].growth[k()].diamCm = num(e.currentTarget.value)))} />
                            </span>
                          )}
                        </For>
                      </div>
                    </td>
                    <td>
                      <Show when={sc()!.cohorts.length > 1}>
                        <button class={btn} title="Remove cohort" onClick={() => update((s) => s.cohorts.splice(i(), 1))}>
                          <i class="fas fa-xmark" />
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={sc()!.cohorts.length < 3}>
            <button
              class={`${btn} mt-2`}
              onClick={() => update((s) => s.cohorts.push({ label: "New shade trees", allometry: "chave moist", densityPerHa: 20, plantYear: 0, growth: [0, 5, 10, 15, 20, 30].map((age) => ({ age, diamCm: age })) }))}
            >
              <i class="fas fa-plus mr-1" /> Cohort
            </button>
          </Show>

          <div class="mt-4 flex items-center gap-2 flex-wrap text-sm">
            <label>Parameter set</label>
            <select class={input} value={setId()} onChange={(e) => setSetId(e.currentTarget.value)}>
              <For each={sets()?.sets ?? []}>{(s) => <option value={s._id}>{s.label}</option>}</For>
            </select>
            <Link to="/grove/apcco/parameters" class="underline text-xs">
              manage
            </Link>
            <button class={`${primary} ml-auto`} disabled={running() || !setId() || !shambaReady() || !props.detail.runnerConfigured.shamba} onClick={run}>
              {running() ? "Running SHAMBA… (up to 3 minutes)" : "Run SHAMBA"}
            </button>
          </div>
          <Show when={!props.detail.runnerConfigured.shamba}>
            <p class="mt-2 text-xs text-amber-700 dark:text-amber-400">The SHAMBA service isn't connected yet (Google Cloud Run; MODEL_SHAMBA_URL and MODEL_SHAMBA_TOKEN on the backend).</p>
          </Show>
          <Show when={props.detail.runnerConfigured.shamba && !shambaReady()}>
            <p class="mt-2 text-xs text-amber-700 dark:text-amber-400">Add the data marked above before running.</p>
          </Show>
        </Show>
      </div>
    </div>
  );
}

function RunsTab(props: { runs: Run[]; siteName: string }) {
  const [openId, setOpenId] = createSignal<string | null>(null);
  const [open] = createResource(openId, (id) => apiFetch<{ run: Run }>(`/internal/apcco/runs/${id}`));
  const [compare, setCompare] = createSignal<string[]>([]);
  const toggle = (id: string) => setCompare(compare().includes(id) ? compare().filter((x) => x !== id) : [...compare(), id].slice(-4));
  const pools = ["total", "tree", "soil", "crop", "litter", "fire", "fertiliser"];
  const slug = (s: string) => s.replace(/[^\w-]+/g, "_").slice(0, 60);

  return (
    <div class="mt-3">
      <Show when={props.runs.length} fallback={<p class="text-sm opacity-70">No runs yet. Run a model from "2 · Models".</p>}>
        <p class="text-xs opacity-70">Totals are the project minus the baseline over the period, in t CO₂e/ha; negative = carbon taken up. Tick up to four runs to compare.</p>
        <table class="mt-2 w-full text-sm">
          <thead>
            <tr class="text-left border-b border-zinc-300 dark:border-slate-600 text-xs">
              <th />
              <th class="py-1">When</th>
              <th>Model</th>
              <th>Parameter set</th>
              <th>Years</th>
              <th>Total</th>
              <th>Trees</th>
              <th>Soil</th>
              <th>Status</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.runs}>
              {(r) => (
                <tr class="border-b border-zinc-200 dark:border-slate-700 hover:bg-zinc-50 dark:hover:bg-slate-800 cursor-pointer" onClick={() => setOpenId(r._id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={compare().includes(r._id)} disabled={r.status !== "done"} onChange={() => toggle(r._id)} />
                  </td>
                  <td class="py-1">{new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{r.model.toUpperCase()}</td>
                  <td class="text-xs">{r.parameterLabel}</td>
                  <td>{r.outputs?.years ?? r.scenario?.years ?? "–"}</td>
                  <td>{fmt(r.outputs?.totals?.total)}</td>
                  <td>{fmt(r.outputs?.totals?.tree)}</td>
                  <td>{fmt(r.outputs?.totals?.soil)}</td>
                  <td classList={{ "text-red-600": r.status === "failed" }}>{r.status}</td>
                  <td class="text-xs">{r.createdBy?.email ?? ""}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={compare().length > 1}>
        <div class={`${card} mt-4`}>
          <b class="text-sm">Comparison (t CO₂e/ha over the period)</b>
          <table class="mt-2 text-sm">
            <thead>
              <tr class="text-left text-xs">
                <th class="pr-3">Pool</th>
                <For each={compare()}>{(id) => <th class="pr-3">{props.runs.find((r) => r._id === id)?.parameterLabel}</th>}</For>
              </tr>
            </thead>
            <tbody>
              <For each={pools}>
                {(p) => (
                  <tr>
                    <td class="pr-3">{p}</td>
                    <For each={compare()}>{(id) => <td class="pr-3">{fmt(props.runs.find((r) => r._id === id)?.outputs?.totals?.[p])}</td>}</For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <Show when={openId()}>
        <div class={`${card} mt-4`}>
          <Show when={open()} fallback={<p class="text-sm opacity-70">Loading…</p>}>
            {(() => {
              const run = () => open()!.run;
              return (
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <b>
                      {run().model.toUpperCase()} · {run().parameterLabel}
                    </b>
                    <span class="text-xs opacity-70">{new Date(run().createdAt).toLocaleString("en-GB")}</span>
                    <div class="ml-auto flex gap-2">
                      <Show when={run().outputs}>
                        <button class={btn} onClick={() => download(`${slug(props.siteName)}-${run().model}-${run()._id.slice(-6)}.csv`, runCsv(run()))}>
                          <i class="fas fa-download mr-1" /> Yearly CSV
                        </button>
                      </Show>
                      <button class={btn} onClick={() => download(`${slug(props.siteName)}-${run().model}-${run()._id.slice(-6)}.json`, JSON.stringify(run(), null, 2), "application/json")}>
                        <i class="fas fa-file-code mr-1" /> Full record (JSON)
                      </button>
                      <button class={btn} onClick={() => setOpenId(null)}>
                        Close
                      </button>
                    </div>
                  </div>
                  <Show when={run().error}>
                    <p class="mt-2 text-sm text-red-600">{run().error}</p>
                  </Show>
                  <Show when={run().outputs}>
                    <YearChart run={run()} />
                    <p class="mt-2 text-sm">
                      Over {run().outputs!.years} years: total <b>{fmt(run().outputs!.totals.total)}</b>, trees {fmt(run().outputs!.totals.tree)}, soil {fmt(run().outputs!.totals.soil)} t CO₂e/ha. Soil carbon {fmt(run().outputs!.soil_carbon_t_c_per_ha.project[0])} → {fmt(run().outputs!.soil_carbon_t_c_per_ha.project.at(-1))} t C/ha (project), → {fmt(run().outputs!.soil_carbon_t_c_per_ha.baseline.at(-1))} (baseline).
                    </p>
                  </Show>
                  <details class="mt-2 text-xs">
                    <summary class="cursor-pointer opacity-70">Provenance (for reports and re-runs)</summary>
                    <ul class="mt-1">
                      <li>Request SHA-256 (GroveWorks, keys sorted): <code>{run().inputSha256}</code></li>
                      <For each={Object.entries(run().provenance ?? {})}>
                        {([k, v]) => (
                          <li>
                            {k}: <code>{typeof v === "object" ? JSON.stringify(v) : String(v)}</code>
                          </li>
                        )}
                      </For>
                    </ul>
                  </details>
                </div>
              );
            })()}
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** Cumulative difference (project − baseline) per year for total, trees and soil, as a small SVG line chart. */
function YearChart(props: { run: Run }) {
  const W = 640;
  const H = 180;
  const P = 32;
  const series = () => {
    const o = props.run.outputs!;
    const cum = (xs: number[]) => xs.reduce<number[]>((a, x) => [...a, (a.at(-1) ?? 0) + x], []);
    return [
      { name: "Total", color: "#15803d", ys: cum(o.pools.total.difference) },
      { name: "Trees", color: "#65a30d", ys: cum(o.pools.tree.difference) },
      { name: "Soil", color: "#a16207", ys: cum(o.pools.soil.difference) },
    ];
  };
  const extent = () => {
    const all = series().flatMap((s) => s.ys);
    return [Math.min(0, ...all), Math.max(0, ...all)];
  };
  const x = (i: number, n: number) => P + (i / Math.max(1, n - 1)) * (W - 2 * P);
  const y = (v: number) => {
    const [lo, hi] = extent();
    return H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  };
  return (
    <div class="mt-3 overflow-x-auto">
      <p class="text-xs opacity-70">Cumulative difference, project − baseline (t CO₂e/ha); below zero = carbon taken up</p>
      <svg viewBox={`0 0 ${W} ${H}`} class="w-full max-w-2xl" role="img" aria-label="Cumulative carbon difference per year">
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="currentColor" stroke-opacity="0.3" />
        <text x={4} y={y(extent()[0]) + 4} font-size="10" fill="currentColor">{fmt(extent()[0], 0)}</text>
        <text x={4} y={y(extent()[1]) + 4} font-size="10" fill="currentColor">{fmt(extent()[1], 0)}</text>
        <text x={W - P} y={H - 8} font-size="10" fill="currentColor" text-anchor="end">year {props.run.outputs!.years}</text>
        <For each={series()}>
          {(s, k) => (
            <>
              <polyline fill="none" stroke={s.color} stroke-width="2" points={s.ys.map((v, i) => `${x(i, s.ys.length)},${y(v)}`).join(" ")} />
              <text x={P + 8 + k() * 70} y={14} font-size="11" fill={s.color}>
                ■ {s.name}
              </text>
            </>
          )}
        </For>
      </svg>
    </div>
  );
}
