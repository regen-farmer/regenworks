// D · APCCO Uganda → Parameter sets. Each model has its built-in original set (the model's own
// defaults). New sets are "literature" (values from papers) or "calibrated" (fitted to a named
// dataset, e.g. ROBUST or APCCO 2027), each with a version. A set used in a run is frozen, so
// results stay reproducible: changes go in a new version. Grove team only.
import { Link, createFileRoute } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { isGroveTeam } from "~/grove/access.ts";
import { MODEL_NAMES, btn, card, download, input, primary, sendJson, type Model, type ParameterSet } from "~/grove/apcco.ts";
import { apiFetch } from "~/util/apiFetch.ts";

export const Route = createFileRoute("/grove/apcco/parameters")({ component: ParameterSets });

const TABLES = [
  ["tree", "Tree parameters (tree_params.csv), SHAMBA's 10 columns. Rows 1–3 are cohorts 1–3 in the scenario, in that order: coffee, then the two shade-tree groups"],
  ["crop", "Crop parameters (crop_params.csv)"],
  ["litter", "Litter parameters (litter_params.csv)"],
  ["biomass_pool", "Biomass pools (biomass_pool_params.csv)"],
] as const;

type Form = { model: Model; name: string; status: "literature" | "calibrated"; dataset: string; version: string; coffeeType: string; source: string; notes: string; tables: Record<string, string> };
const empty = (model: Model = "shamba"): Form => ({ model, name: "", status: "literature", dataset: "", version: "v1", coffeeType: "robusta", source: "", notes: "", tables: {} });

const toCsv = (t: { columns: string[]; rows: any[][] } | undefined) =>
  t ? [t.columns, ...t.rows].map((r) => r.map((v) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n") + "\n" : "";

function ParameterSets() {
  const [data, { refetch }] = createResource(() => (isGroveTeam() ? true : undefined), () => apiFetch<{ sets: ParameterSet[] }>("/internal/apcco/parameter-sets"));
  const [form, setForm] = createSignal<Form | null>(null);
  const [editId, setEditId] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  function newVersion(s: ParameterSet) {
    const n = Number(/^v(\d+)$/.exec(s.version)?.[1] ?? 1) + 1;
    setEditId(null);
    setForm({
      model: s.model,
      name: s.builtIn ? `${s.name} (copy)` : s.name,
      status: s.status === "original" ? "literature" : s.status,
      dataset: s.dataset ?? "",
      version: s.builtIn ? "v1" : `v${n}`,
      coffeeType: s.coffeeType ?? "robusta",
      source: s.source ?? "",
      notes: s.notes ?? "",
      tables: Object.fromEntries(Object.entries(s.values?.tables ?? {}).map(([k, t]: [string, any]) => [k, toCsv(t)])),
    });
  }
  function edit(s: ParameterSet) {
    newVersion(s);
    setForm({ ...form()!, version: s.version, name: s.name });
    setEditId(s._id);
  }
  async function save() {
    setBusy(true);
    const f = form()!;
    const r = editId() ? await sendJson("PUT", `/internal/apcco/parameter-sets/${editId()}`, f) : await sendJson("POST", "/internal/apcco/parameter-sets", f);
    setBusy(false);
    if (!r.ok) {
      showToast({ title: r.body?.error ?? "Not saved", variant: "destructive" });
      return;
    }
    setForm(null);
    setEditId(null);
    refetch();
  }
  async function archive(s: ParameterSet) {
    const r = s.runs ? await sendJson("PUT", `/internal/apcco/parameter-sets/${s._id}`, { archived: true }) : await sendJson("DELETE", `/internal/apcco/parameter-sets/${s._id}`);
    if (!r.ok) showToast({ title: r.body?.error ?? "Not removed", variant: "destructive" });
    else if (r.body?.archived) showToast({ title: "Archived", description: "Failed runs refer to this set, so it's archived (hidden) rather than deleted." });
    refetch();
  }
  const statusColor = { original: "#64748b", literature: "#2563eb", calibrated: "#15803d" };

  return (
    <Show when={isGroveTeam()} fallback={<p class="p-4">Only for the Grove team.</p>}>
      <div class="p-4 max-w-6xl">
        <Toaster />
        <Link to="/grove/apcco" class="text-sm underline opacity-80">
          ← D · APCCO Uganda
        </Link>
        <div class="flex items-center gap-3 mt-2 flex-wrap">
          <h1 class="text-xl font-semibold">Parameter sets</h1>
          <button class={`${primary} ml-auto`} onClick={() => (setEditId(null), setForm(empty()))}>
            <i class="fas fa-plus mr-1" /> New set
          </button>
        </div>
        <p class="text-sm opacity-80 mt-1">
          <b>Original</b>: the model's own defaults (built in). <b>Literature</b>: values from papers. <b>Calibrated</b>: fitted to a named dataset (e.g. ROBUST, APCCO 2027). A set that has been used in a run can't be changed, so results stay reproducible; save a new version instead.
        </p>

        <Show when={form()}>
          <div class={`${card} mt-4 grid gap-2`} style={{ "grid-template-columns": "auto 1fr" }}>
            <label class="text-sm leading-7">Model</label>
            <select class={`${input} w-72`} value={form()!.model} disabled={!!editId()} onChange={(e) => setForm({ ...form()!, model: e.currentTarget.value as Model })}>
              <For each={Object.entries(MODEL_NAMES)}>{([id, name]) => <option value={id}>{name}</option>}</For>
            </select>
            <label class="text-sm leading-7">Name</label>
            <input class={`${input} w-72`} value={form()!.name} onInput={(e) => setForm({ ...form()!, name: e.currentTarget.value })} placeholder="e.g. Robusta Uganda" />
            <label class="text-sm leading-7">Status</label>
            <select class={`${input} w-72`} value={form()!.status} onChange={(e) => setForm({ ...form()!, status: e.currentTarget.value as any })}>
              <option value="literature">Literature</option>
              <option value="calibrated">Calibrated</option>
            </select>
            <label class="text-sm leading-7">Dataset</label>
            <input class={`${input} w-72`} value={form()!.dataset} onInput={(e) => setForm({ ...form()!, dataset: e.currentTarget.value })} placeholder={form()!.status === "calibrated" ? "required, e.g. ROBUST" : "optional"} />
            <label class="text-sm leading-7">Version</label>
            <input class={`${input} w-24`} value={form()!.version} onInput={(e) => setForm({ ...form()!, version: e.currentTarget.value })} />
            <label class="text-sm leading-7">Coffee</label>
            <select class={`${input} w-32`} value={form()!.coffeeType} onChange={(e) => setForm({ ...form()!, coffeeType: e.currentTarget.value })}>
              <option value="robusta">Robusta</option>
              <option value="arabica">Arabica</option>
            </select>
            <label class="text-sm leading-7">Source</label>
            <textarea class={input} rows={2} value={form()!.source} onInput={(e) => setForm({ ...form()!, source: e.currentTarget.value })} placeholder="Papers, reports or datasets the values come from" />
            <label class="text-sm leading-7">Notes</label>
            <textarea class={input} rows={2} value={form()!.notes} onInput={(e) => setForm({ ...form()!, notes: e.currentTarget.value })} />
            <Show when={form()!.model === "shamba"}>
              <For each={TABLES}>
                {([key, help]) => (
                  <>
                    <label class="text-sm leading-7">{key}</label>
                    <div>
                      <p class="text-xs opacity-70">{help}. Leave empty to use SHAMBA's default.</p>
                      <textarea class={`${input} w-full font-mono text-xs`} rows={4} value={form()!.tables[key] ?? ""} onInput={(e) => setForm({ ...form()!, tables: { ...form()!.tables, [key]: e.currentTarget.value } })} placeholder="Paste CSV with a header line" />
                      <label class={`${btn} cursor-pointer mt-1 inline-block`}>
                        Load CSV file
                        <input type="file" accept=".csv,text/csv" class="hidden" onChange={async (e) => {
                          const file = e.currentTarget.files?.[0];
                          if (file) setForm({ ...form()!, tables: { ...form()!.tables, [key]: await file.text() } });
                        }} />
                      </label>
                    </div>
                  </>
                )}
              </For>
            </Show>
            <Show when={form()!.model !== "shamba"}>
              <div />
              <p class="text-sm opacity-70">Values for {MODEL_NAMES[form()!.model]} are entered once its runs are connected (next step). The set can be named and described now.</p>
            </Show>
            <div />
            <div class="flex gap-2">
              <button class={primary} disabled={busy()} onClick={save}>
                {editId() ? "Save" : "Create"}
              </button>
              <button class={btn} onClick={() => (setForm(null), setEditId(null))}>
                Cancel
              </button>
            </div>
          </div>
        </Show>

        <For each={Object.keys(MODEL_NAMES) as Model[]}>
          {(m) => (
            <div class="mt-5">
              <h2 class="font-semibold">{MODEL_NAMES[m]}</h2>
              <table class="mt-1 w-full text-sm">
                <thead>
                  <tr class="text-left border-b border-zinc-300 dark:border-slate-600 text-xs">
                    <th class="py-1">Set</th>
                    <th>Status</th>
                    <th>Dataset</th>
                    <th>Version</th>
                    <th>Coffee</th>
                    <th>Runs</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <For each={(data()?.sets ?? []).filter((s) => s.model === m)}>
                    {(s) => (
                      <tr class="border-b border-zinc-200 dark:border-slate-700 align-top">
                        <td class="py-1">
                          <b>{s.name}</b>
                          <Show when={s.source}>
                            <div class="text-xs opacity-70">{s.source}</div>
                          </Show>
                          <Show when={Object.keys(s.values?.tables ?? {}).length}>
                            <div class="text-xs opacity-70">
                              Tables:{" "}
                              <For each={Object.keys(s.values.tables)}>
                                {(k) => (
                                  <button class="underline mr-2" onClick={() => download(`${s.label.replace(/[^\w-]+/g, "_")}-${k}.csv`, toCsv(s.values.tables[k]))}>
                                    {k}
                                  </button>
                                )}
                              </For>
                            </div>
                          </Show>
                        </td>
                        <td>
                          <span class="text-xs px-1 rounded-sm text-white" style={{ background: statusColor[s.status] }}>
                            {s.status}
                          </span>
                        </td>
                        <td>{s.dataset || "–"}</td>
                        <td>{s.version}</td>
                        <td>{s.coffeeType ?? "–"}</td>
                        <td>{s.runs}</td>
                        <td class="text-right whitespace-nowrap">
                          <Show when={!s.builtIn && !s.runs}>
                            <button class={btn} onClick={() => edit(s)}>
                              Edit
                            </button>{" "}
                          </Show>
                          <button class={btn} onClick={() => newVersion(s)}>
                            {s.builtIn ? "Copy" : "New version"}
                          </button>{" "}
                          <Show when={!s.builtIn}>
                            <button class={btn} onClick={() => archive(s)}>
                              {s.runs ? "Archive" : "Delete"}
                            </button>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
