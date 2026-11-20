// D · APCCO Uganda: the coffee agroforestry sites. Each site holds its field data (imports),
// shows what each model still needs, and runs the models. Grove team only.
import { Link, createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { isGroveTeam } from "~/grove/access.ts";
import { btn, card, input, primary, sendJson, type Site } from "~/grove/apcco.ts";
import { apiFetch } from "~/util/apiFetch.ts";

export const Route = createFileRoute("/grove/apcco/")({ component: ApccoSites });

function ApccoSites() {
  const navigate = useNavigate();
  const [archived, setArchived] = createSignal(false);
  const [data] = createResource(
    () => (isGroveTeam() ? { archived: archived() } : undefined),
    (q) => apiFetch<{ sites: Site[] }>(`/internal/apcco/sites${q.archived ? "?archived=1" : ""}`),
  );
  const [creating, setCreating] = createSignal(false);
  const [form, setForm] = createSignal({ name: "", district: "", lat: "", lon: "", areaHa: "" });
  const [busy, setBusy] = createSignal(false);

  async function create() {
    setBusy(true);
    const f = form();
    const r = await sendJson("POST", "/internal/apcco/sites", {
      name: f.name,
      district: f.district,
      lat: Number(f.lat.replace(",", ".")),
      lon: Number(f.lon.replace(",", ".")),
      ...(f.areaHa.trim() ? { areaHa: Number(f.areaHa.replace(",", ".")) } : {}),
      coffeeType: "robusta",
    });
    setBusy(false);
    if (!r.ok) {
      showToast({ title: r.body?.error ?? "Couldn't create the site", variant: "destructive" });
      return;
    }
    setCreating(false);
    setForm({ name: "", district: "", lat: "", lon: "", areaHa: "" });
    navigate({ to: "/grove/apcco/$siteId", params: { siteId: r.body.site._id } });
  }

  return (
    <Show when={isGroveTeam()} fallback={<p class="p-4">Only for the Grove team.</p>}>
      <div class="p-4 max-w-6xl">
        <Toaster />
        <div class="flex items-center gap-3 flex-wrap">
          <h1 class="text-xl font-semibold">D · APCCO Uganda</h1>
          <span class="text-sm opacity-70">Robusta coffee agroforestry: field data in, SHAMBA, DynACof and CAF2021 runs out</span>
          <div class="ml-auto flex gap-2">
            <Link to="/grove/apcco/parameters" class={btn}>
              <i class="fas fa-sliders mr-1" /> Parameter sets
            </Link>
            <button class={primary} onClick={() => setCreating(true)}>
              <i class="fas fa-plus mr-1" /> New site
            </button>
          </div>
        </div>

        <ol class="mt-3 text-sm opacity-80 list-decimal ml-5">
          <li>Make a site (a farm or plot) with its location and area.</li>
          <li>Import the field data from the templates: shade trees, coffee plots, soil, canopy photos, weather.</li>
          <li>Check what each model still needs, choose a parameter set, and run.</li>
        </ol>

        <Show when={creating()}>
          <div class={`${card} mt-4 grid gap-2 max-w-xl`} style={{ "grid-template-columns": "auto 1fr" }}>
            <label class="text-sm leading-7">Name</label>
            <input class={input} value={form().name} onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })} placeholder="e.g. Mukono farmer group, plot 3" />
            <label class="text-sm leading-7">District</label>
            <input class={input} value={form().district} onInput={(e) => setForm({ ...form(), district: e.currentTarget.value })} />
            <label class="text-sm leading-7">Latitude, longitude</label>
            <div class="flex gap-2">
              <input class={`${input} w-32`} value={form().lat} onInput={(e) => setForm({ ...form(), lat: e.currentTarget.value })} placeholder="0.3542" />
              <input class={`${input} w-32`} value={form().lon} onInput={(e) => setForm({ ...form(), lon: e.currentTarget.value })} placeholder="32.7531" />
            </div>
            <label class="text-sm leading-7">Area (ha)</label>
            <input class={`${input} w-32`} value={form().areaHa} onInput={(e) => setForm({ ...form(), areaHa: e.currentTarget.value })} placeholder="or import the boundary later" />
            <div />
            <div class="flex gap-2">
              <button class={primary} disabled={busy() || !form().name.trim()} onClick={create}>
                Create
              </button>
              <button class={btn} onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </div>
        </Show>

        <div class="mt-4 flex items-center gap-2 text-sm">
          <label>
            <input type="checkbox" checked={archived()} onChange={(e) => setArchived(e.currentTarget.checked)} /> Show archived
          </label>
        </div>

        <Show when={data()} fallback={<p class="mt-4 text-sm opacity-70">{data.error ? String(data.error.message) : "Loading…"}</p>}>
          <Show when={data()!.sites.length} fallback={<p class="mt-4 text-sm opacity-70">No sites yet. Make the first one with "New site".</p>}>
            <table class="mt-2 w-full text-sm">
              <thead>
                <tr class="text-left border-b border-zinc-300 dark:border-slate-600">
                  <th class="py-1">Site</th>
                  <th>District</th>
                  <th>Area</th>
                  <th>Field data</th>
                  <th>Runs</th>
                </tr>
              </thead>
              <tbody>
                <For each={data()!.sites}>
                  {(s) => (
                    <tr class="border-b border-zinc-200 dark:border-slate-700 hover:bg-zinc-50 dark:hover:bg-slate-800">
                      <td class="py-1">
                        <Link to="/grove/apcco/$siteId" params={{ siteId: s._id }} class="underline">
                          {s.name}
                        </Link>
                        <Show when={s.archived}> <span class="opacity-60">(archived)</span></Show>
                      </td>
                      <td>{s.district || "–"}</td>
                      <td>{s.areaHa ? `${s.areaHa.toFixed(2)} ha` : "–"}</td>
                      <td>{s.data?.length ? s.data.join(", ") : "none yet"}</td>
                      <td>{s.runs ?? 0}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
