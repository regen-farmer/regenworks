// Grove Dashboard: the scorecard (from won deals), then two tabs: A · Deals
// (open deals that need attention) and B · Projects (where each ongoing
// project is, as a status list, a board, a list or a map). Field users see
// only B, with their assigned projects.
import { createFileRoute, Link } from "@tanstack/solid-router";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { Scorecard } from "~/grove/Scorecard.tsx";
import { DealsAttention } from "~/grove/DealsAttention.tsx";
import { DECISION_EN } from "~/grove/ChecklistPanel.tsx";
import {
  kroner,
  shortDate,
  STAGE_COLOR,
  STAGE_LABEL,
  STAGES,
  stageText,
  TYPE_LABEL,
  TYPES,
  type GroveProject,
  type Stage,
} from "~/grove/projectTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

type View = "status" | "board" | "list" | "map";
type Tab = "deals" | "projects";
const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";

function readView(): View {
  try {
    const v = localStorage.getItem("grove-dashboard-view");
    return v === "list" || v === "map" || v === "board" ? v : "status";
  } catch {
    return "status";
  }
}

function readTab(): Tab {
  try {
    return localStorage.getItem("grove-dashboard-tab") === "projects" ? "projects" : "deals";
  } catch {
    return "deals";
  }
}

function Dashboard() {
  const [data, { refetch, mutate }] = createResource(() => apiFetch<{ projects: GroveProject[] }>("/internal/projects"));
  const [view, setView] = createSignal<View>(readView());
  const [tabChoice, setTab] = createSignal<Tab>(readTab());
  // field users only have projects
  const tab = () => (canSeeMoney() ? tabChoice() : "projects");
  createEffect(() => {
    try {
      localStorage.setItem("grove-dashboard-tab", tabChoice());
    } catch {
      // per-browser convenience only
    }
  });
  const [search, setSearch] = createSignal("");
  const [type, setType] = createSignal("");
  const [stageFilter, setStageFilter] = createSignal("");
  const [region, setRegion] = createSignal("");
  const [importing, setImporting] = createSignal(false);
  const [owner, setOwner] = createSignal("");
  const [showArchived, setShowArchived] = createSignal(false);
  const [adding, setAdding] = createSignal(false);
  const [sort, setSort] = createSignal<{ key: keyof GroveProject | "next"; dir: 1 | -1 }>({ key: "updatedAt", dir: -1 });
  const [selected, setSelected] = createSignal<Set<string>>(new Set());

  createEffect(() => {
    try {
      localStorage.setItem("grove-dashboard-view", view());
    } catch {
      // per-browser convenience only
    }
  });

  const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
  const owners = createMemo(() => {
    const byKey = new Map<string, string>();
    for (const p of data()?.projects ?? []) {
      const o = p.responsible?.trim();
      if (o && !byKey.has(o.toLowerCase())) byKey.set(o.toLowerCase(), o);
    }
    return [...byKey.values()].sort();
  });
  const regions = createMemo(() => [...new Set((data()?.projects ?? []).map((p) => p.region?.trim()).filter(Boolean))].sort() as string[]);

  const shown = createMemo(() => {
    const q = search().toLowerCase();
    return (data()?.projects ?? []).filter(
      (p) =>
        (showArchived() || p.status !== "archived") &&
        (!type() || p.type === type()) &&
        (view() === "board" || !stageFilter() || p.stage === stageFilter()) &&
        (!region() || norm(p.region) === norm(region())) &&
        (!owner() || norm(p.responsible) === norm(owner())) &&
        (!q || `${p.name} ${p.client?.name ?? ""} ${p.region ?? ""} ${p.farm?.name ?? ""}`.toLowerCase().includes(q)),
    );
  });

  const sorted = createMemo(() => {
    const { key, dir } = sort();
    const stageIndex = (s: string) => STAGES.findIndex(([k]) => k === s);
    const val = (p: GroveProject): any =>
      key === "next"
        ? p.nextAction?.date ?? "9999"
        : key === "stage"
          ? stageIndex(p.stage)
          : key === "trees"
            ? p.trees ?? p.signedTrees ?? 0
            : (p as any)[key] ?? "";
    return [...shown()].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
  });

  async function move(p: GroveProject, stage: Stage) {
    if (p.stage === stage) return;
    const old = p.stage;
    const setStage = (s: Stage) => mutate({ projects: (data()?.projects ?? []).map((x) => (x._id === p._id ? { ...x, stage: s } : x)) });
    setStage(stage);
    try {
      await apiFetch(`/internal/projects/${p._id}`, { method: "PUT", body: JSON.stringify({ stage }) });
    } catch (err) {
      // undo only this card, and only if nothing moved it since
      if (data()?.projects.find((x) => x._id === p._id)?.stage === stage) setStage(old);
      showToast({ title: "Not moved", description: (err as Error).message, variant: "destructive" });
    }
  }

  async function bulk(status: "archived" | "active") {
    // only rows still shown (a filter may have hidden some selected ones)
    const visible = new Set(shown().map((p) => p._id));
    const ids = [...selected()].filter((id) => visible.has(id));
    if (!ids.length) return;
    try {
      const r = await apiFetch<{ updated: number }>("/internal/projects/bulk-status", { method: "POST", body: JSON.stringify({ ids, status }) });
      showToast({ title: `${r.updated} project(s) ${status === "archived" ? "archived" : "restored"}` });
      setSelected(new Set<string>());
      refetch();
    } catch (err) {
      showToast({ title: "Not changed", description: (err as Error).message, variant: "destructive" });
    }
  }

  const toggle = (id: string) => {
    const s = new Set(selected());
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  return (
    <div class="p-4 flex flex-col gap-3" data-testid="grove-dashboard">
      <Toaster />
      <h1 class="text-3xl font-bold">Grove Dashboard</h1>
      <Show when={canSeeMoney()}>
        <Scorecard />
      </Show>
      <Show when={canSeeMoney()}>
        <div role="tablist" aria-label="Workspace" class="flex gap-1 border-b border-zinc-300 dark:border-slate-600">
          <For each={[["deals", "A · Deals"], ["projects", "B · Projects"]] as [Tab, string][]}>
            {([k, l]) => (
              <button role="tab" aria-selected={tab() === k} class="px-3 py-1.5 text-sm -mb-px border-b-2" classList={{ "border-emerald-700 font-semibold": tab() === k, "border-transparent opacity-70": tab() !== k }} onClick={() => setTab(k)}>
                {l}
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={tab() === "deals"}>
        <DealsAttention />
      </Show>
      <Show when={tab() === "projects"}>
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-xl font-semibold mr-auto">Projects</h2>
        <For each={["status", "board", "list", "map"] as View[]}>
          {(v) => (
            <button class="rounded-sm px-2 py-1 text-sm" classList={{ "btn-default": view() === v, underline: view() !== v }} onClick={() => setView(v)}>
              {{ status: "Status", board: "Board", list: "List", map: "Map" }[v]}
            </button>
          )}
        </For>
        <Show when={canSeeMoney()}>
          <button class="rounded-sm px-2 py-1 btn-default" onClick={() => setAdding(!adding())}>
            + New project
          </button>
          <button class="rounded-sm px-2 py-1 text-sm underline" onClick={() => setImporting(!importing())}>
            Add from farms
          </button>
        </Show>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <input class={input} placeholder="Search name, client, farm, region" value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
        <select class={input} value={type()} onChange={(e) => setType(e.currentTarget.value)}>
          <option value="">All types</option>
          <For each={TYPES}>{([k, v]) => <option value={k}>{v}</option>}</For>
        </select>
        <Show when={view() !== "board"}>
          <select class={input} value={stageFilter()} onChange={(e) => setStageFilter(e.currentTarget.value)}>
            <option value="">All stages</option>
            <For each={STAGES}>{([k, v]) => <option value={k}>{v}</option>}</For>
          </select>
        </Show>
        <select class={input} value={region()} onChange={(e) => setRegion(e.currentTarget.value)}>
          <option value="">All regions</option>
          <For each={regions()}>{(r) => <option value={r}>{r}</option>}</For>
        </select>
        <select class={input} value={owner()} onChange={(e) => setOwner(e.currentTarget.value)}>
          <option value="">Everyone</option>
          <For each={owners()}>{(o) => <option value={o}>{o}</option>}</For>
        </select>
        <label class="flex items-center gap-1">
          <input type="checkbox" checked={showArchived()} onChange={(e) => setShowArchived(e.currentTarget.checked)} />
          Show archived
        </label>
        <span class="opacity-60">{shown().length} project(s)</span>
      </div>

      <Show when={importing()}>
        <ImportFarms
          onDone={() => {
            setImporting(false);
            refetch();
          }}
        />
      </Show>

      <Show when={adding()}>
        <NewProject
          onCreated={(p) => {
            setAdding(false);
            mutate({ projects: [p, ...(data()?.projects ?? [])] });
          }}
        />
      </Show>

      <Show when={data()} fallback={<p>Loading…</p>}>
        <Show when={view() === "status"}>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs opacity-70">
                  <th class="py-1 pr-3">Project</th>
                  <th class="py-1 pr-3">Stage · step</th>
                  <th class="py-1 pr-3">Screening</th>
                  <th class="py-1 pr-3">Next action</th>
                  <th class="py-1 pr-3">Planting</th>
                  <th class="py-1 pr-3">Size</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={[...shown()]
                    .filter((p) => p.status !== "archived" && p.stage !== "closed")
                    .sort((a, b) => STAGES.findIndex(([k]) => k === b.stage) - STAGES.findIndex(([k]) => k === a.stage) || a.name.localeCompare(b.name))}
                  fallback={<tr><td class="py-2 opacity-70" colSpan={6}>No ongoing projects.</td></tr>}
                >
                  {(p) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700 align-top" classList={{ "opacity-60": p.status !== "active" }}>
                      <td class="py-1 pr-3">
                        <Link to="/grove/projects/$projectId" params={{ projectId: p._id }} class="underline font-semibold">{p.name}</Link>
                        <div class="text-xs opacity-70">{[TYPE_LABEL[p.type], p.client?.name, p.status !== "active" ? p.status : ""].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td class="py-1 pr-3">
                        <span class="inline-block w-2 h-2 rounded-full mr-1" style={{ background: STAGE_COLOR[p.stage] }} />
                        {stageText(p)}
                      </td>
                      <td class="py-1 pr-3 text-xs" classList={{ "text-amber-700": !!p.screening?.issues }}>
                        {p.screening ? `${p.screening.done}/${p.screening.total}${p.screening.decision ? ` · ${DECISION_EN[p.screening.decision] ?? ""}` : ""}` : ""}
                      </td>
                      <td class="py-1 pr-3 text-xs" classList={{ "text-red-700 dark:text-red-400 font-semibold": !!p.nextAction?.date && new Date(p.nextAction.date).getTime() < new Date().setHours(0, 0, 0, 0) }}>
                        {p.nextAction?.text}
                        {p.nextAction?.date ? ` (${shortDate(p.nextAction.date)})` : ""}
                      </td>
                      <td class="py-1 pr-3 text-xs">{shortDate(p.plantingDate)}</td>
                      <td class="py-1 pr-3 text-xs">{[p.plannedHa ? `${p.plannedHa} ha` : "", (p.trees ?? p.signedTrees) ? `${(p.trees ?? p.signedTrees)!.toLocaleString("da-DK")} trees` : ""].filter(Boolean).join(" · ")}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
        <Show when={view() === "board"}>
          <div class="flex gap-3 overflow-x-auto pb-2">
            <For each={STAGES}>
              {([stage, label]) => (
                <div
                  class="min-w-[220px] w-[220px] flex flex-col gap-2 rounded-md p-2 bg-zinc-100 dark:bg-slate-800"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer?.getData("text/plain");
                    const p = data()?.projects.find((x) => x._id === id);
                    if (p && canSeeMoney()) move(p, stage);
                  }}
                  data-stage={stage}
                >
                  <div class="flex items-center gap-2 font-semibold text-sm">
                    <span class="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
                    {label}
                    <span class="opacity-60 font-normal">{shown().filter((p) => p.stage === stage).length}</span>
                  </div>
                  <For each={shown().filter((p) => p.stage === stage)}>
                    {(p) => (
                      <div
                        class="rounded-sm bg-white dark:bg-slate-900 p-2 text-sm shadow-sm border border-zinc-200 dark:border-slate-700"
                        classList={{ "opacity-60": p.status !== "active" }}
                        draggable={canSeeMoney()}
                        onDragStart={(e) => e.dataTransfer?.setData("text/plain", p._id)}
                      >
                        <Link to="/grove/projects/$projectId" params={{ projectId: p._id }} class="font-semibold underline">
                          {p.name}
                        </Link>
                        <div class="text-xs opacity-70">
                          {TYPE_LABEL[p.type]}
                          {p.client?.name ? ` · ${p.client.name}` : ""}
                          {p.status !== "active" ? ` · ${p.status}` : ""}
                        </div>
                        <Show when={p.step}><div class="text-xs font-semibold mt-0.5">{p.step}</div></Show>
                        <Show when={p.screening}>
                          <div class="text-xs mt-0.5" classList={{ "text-amber-700": !!p.screening!.issues }}>
                            Screening {p.screening!.done}/{p.screening!.total}
                            {p.screening!.decision ? ` · ${DECISION_EN[p.screening!.decision] ?? ""}` : ""}
                          </div>
                        </Show>
                        <Show when={p.nextAction?.text}>
                          <div class="text-xs mt-1">
                            Next: {p.nextAction!.text}
                            {p.nextAction?.date ? ` (${shortDate(p.nextAction.date)})` : ""}
                          </div>
                        </Show>
                        <div class="text-xs mt-1 opacity-80">
                          {[p.plannedHa ? `${p.plannedHa} ha` : "", (p.trees ?? p.signedTrees) ? `${(p.trees ?? p.signedTrees)!.toLocaleString("da-DK")} trees` : "", canSeeMoney() ? kroner(p.signedValue || p.offerValue) : ""].filter(Boolean).join(" · ")}
                        </div>
                        <Show when={canSeeMoney()}>
                          <select class="mt-1 text-xs bg-transparent border border-zinc-300 dark:border-slate-600 rounded-sm" value={p.stage} onChange={(e) => move(p, e.currentTarget.value as Stage)} aria-label="Move to stage">
                            <For each={STAGES}>{([k, v]) => <option value={k}>{v}</option>}</For>
                          </select>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={view() === "list"}>
          <Show when={canSeeMoney() && selected().size}>
            <div class="flex gap-2 text-sm items-center">
              {selected().size} selected:
              <button class="underline" onClick={() => bulk("archived")}>Archive</button>
              <button class="underline" onClick={() => bulk("active")}>Restore</button>
            </div>
          </Show>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left">
                <th class="py-1 pr-2">
                  <Show when={canSeeMoney()}>
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      checked={shown().length > 0 && shown().every((p) => selected().has(p._id))}
                      onChange={(e) => setSelected(new Set<string>(e.currentTarget.checked ? shown().map((p) => p._id) : []))}
                    />
                  </Show>
                </th>
                <For each={[["name", "Project"], ["type", "Type"], ["stage", "Stage"], ["responsible", "Owner"], ["region", "Region"], ["next", "Next action"], ["plannedHa", "ha"], ["trees", "Trees"], ...(canSeeMoney() ? [["offerValue", "Sent offers"], ["signedValue", "Signed"]] : [])] as [any, string][]}>
                  {([key, label]) => (
                    <th class="py-1 pr-3 cursor-pointer select-none" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
                      {label}
                      {sort().key === key ? (sort().dir === 1 ? " ↑" : " ↓") : ""}
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={sorted()}>
                {(p) => (
                  <tr class="border-t border-zinc-200 dark:border-slate-700" classList={{ "opacity-60": p.status === "archived" }}>
                    <td class="py-1 pr-2">
                      <Show when={canSeeMoney()}>
                        <input type="checkbox" checked={selected().has(p._id)} onChange={() => toggle(p._id)} aria-label={`Select ${p.name}`} />
                      </Show>
                    </td>
                    <td class="py-1 pr-3">
                      <Link to="/grove/projects/$projectId" params={{ projectId: p._id }} class="underline">
                        {p.name}
                      </Link>
                      <div class="text-xs opacity-60">{p.client?.name}</div>
                    </td>
                    <td class="py-1 pr-3">{TYPE_LABEL[p.type]}</td>
                    <td class="py-1 pr-3">
                      <span class="inline-block w-2 h-2 rounded-full mr-1" style={{ background: STAGE_COLOR[p.stage] }} />
                      {STAGE_LABEL[p.stage]}
                      {p.step ? ` · ${p.step}` : ""}
                      {p.status !== "active" ? ` (${p.status})` : ""}
                    </td>
                    <td class="py-1 pr-3">{p.responsible}</td>
                    <td class="py-1 pr-3">{p.region}</td>
                    <td class="py-1 pr-3">
                      {p.nextAction?.text}
                      <div class="text-xs opacity-60">{shortDate(p.nextAction?.date)}</div>
                    </td>
                    <td class="py-1 pr-3">{p.plannedHa ?? ""}</td>
                    <td class="py-1 pr-3">{(p.trees ?? p.signedTrees) ? (p.trees ?? p.signedTrees)!.toLocaleString("da-DK") : ""}</td>
                    <Show when={canSeeMoney()}>
                      <td class="py-1 pr-3">{kroner(p.offerValue)}</td>
                      <td class="py-1 pr-3">{kroner(p.signedValue)}</td>
                    </Show>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>

        <Show when={view() === "map"}>
          <ProjectMap projects={shown().filter((p) => p.status === "active")} />
        </Show>
      </Show>
      </Show>
    </div>
  );
}

function ProjectMap(props: { projects: GroveProject[] }) {
  let el: HTMLDivElement | undefined;
  let map: maplibregl.Map | undefined;
  const markers: maplibregl.Marker[] = [];
  const located = () => props.projects.filter((p) => typeof p.farm?.lat === "number" && typeof p.farm?.lng === "number");
  let lastFit = "";

  createEffect(() => {
    if (!el) return;
    if (!map) {
      map = new maplibregl.Map({ container: el, style: GoogleSatStyle as any, center: [9.5, 56.1], zoom: 6 });
    }
    for (const m of markers.splice(0)) m.remove();
    const bounds = new maplibregl.LngLatBounds();
    for (const p of located()) {
      const dot = document.createElement("div");
      dot.style.cssText = `width:14px;height:14px;border-radius:50%;border:2px solid #fff;background:${STAGE_COLOR[p.stage]}`;
      dot.title = `${p.name} (${STAGE_LABEL[p.stage]})`;
      const popup = new maplibregl.Popup({ offset: 10 }).setText(`${p.name} · ${STAGE_LABEL[p.stage]}`);
      markers.push(new maplibregl.Marker({ element: dot }).setLngLat([p.farm!.lng!, p.farm!.lat!]).setPopup(popup).addTo(map));
      bounds.extend([p.farm!.lng!, p.farm!.lat!]);
    }
    // re-fit only when the set of projects on the map changes, not on every keystroke
    const key = located().map((p) => p._id).sort().join(",");
    if (located().length && key !== lastFit) map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 0 });
    lastFit = key;
  });
  onCleanup(() => map?.remove());

  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-3 text-xs">
        <For each={STAGES}>
          {([k, v]) => (
            <span class="flex items-center gap-1">
              <span class="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STAGE_COLOR[k] }} />
              {v}
            </span>
          )}
        </For>
        <span class="opacity-60">Active projects only · {props.projects.length - located().length} without a linked farm are not shown</span>
      </div>
      <div ref={el} style={{ height: "65vh", width: "100%" }} class="rounded-md overflow-hidden" />
    </div>
  );
}

function NewProject(props: { onCreated: (p: GroveProject) => void }) {
  const [busy, setBusy] = createSignal(false);
  const [farms] = createResource(() => apiFetch<{ farms: { _id: string; name: string }[] }>("/internal/projects/farms"));
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    setBusy(true);
    try {
      const r = await apiFetch<{ project: GroveProject }>("/internal/projects", {
        method: "POST",
        body: JSON.stringify({
          name: f.get("name"),
          type: f.get("type"),
          stage: f.get("stage"),
          farm: f.get("farm") || null,
          client: { name: f.get("client") },
          responsible: f.get("responsible"),
        }),
      });
      props.onCreated(r.project);
    } catch (err) {
      showToast({ title: "Not created", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form class="flex flex-wrap gap-2 items-end p-2 rounded-sm border border-zinc-200 dark:border-slate-700 text-sm" onSubmit={submit}>
      <label class="flex flex-col text-xs">Name<input name="name" required class={input} /></label>
      <label class="flex flex-col text-xs">
        Type
        <select name="type" class={input}><For each={TYPES}>{([k, v]) => <option value={k}>{v}</option>}</For></select>
      </label>
      <label class="flex flex-col text-xs">
        Stage
        <select name="stage" class={input}><For each={STAGES}>{([k, v]) => <option value={k}>{v}</option>}</For></select>
      </label>
      <label class="flex flex-col text-xs">Client<input name="client" class={input} /></label>
      <label class="flex flex-col text-xs">Owner at Grove<input name="responsible" class={input} placeholder="e.g. Kris" /></label>
      <label class="flex flex-col text-xs">
        Farm (optional)
        <select name="farm" class={input}>
          <option value="">–</option>
          <For each={farms()?.farms}>{(f) => <option value={f._id}>{f.name}</option>}</For>
        </select>
      </label>
      <button class="rounded-sm px-2 py-1 btn-default" disabled={busy()}>Create</button>
    </form>
  );
}

/** One-off: make projects from Grove farms that have none, e.g. old test farms as archived. */
function ImportFarms(props: { onDone: () => void }) {
  const [farms] = createResource(() => apiFetch<{ farms: { _id: string; name: string; linked: boolean }[] }>("/internal/projects/farms"));
  const [picked, setPicked] = createSignal<Set<string>>(new Set());
  const [busy, setBusy] = createSignal(false);
  const free = () => (farms()?.farms ?? []).filter((f) => !f.linked);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    setBusy(true);
    try {
      const r = await apiFetch<{ created: number; skipped: number }>("/internal/projects/import-farms", {
        method: "POST",
        body: JSON.stringify({ farmIds: [...picked()], type: f.get("type"), stage: f.get("stage"), status: f.get("status") }),
      });
      showToast({ title: `${r.created} project(s) added${r.skipped ? `, ${r.skipped} skipped` : ""}` });
      props.onDone();
    } catch (err) {
      showToast({ title: "Not added", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form class="flex flex-col gap-2 p-2 rounded-sm border border-zinc-200 dark:border-slate-700 text-sm" onSubmit={submit}>
      <p class="text-xs opacity-70">
        Farms under Grove accounts that have no project yet. Tick them, choose how to add them (for example old test farms as Archived), and add.
      </p>
      <div class="flex flex-wrap gap-x-4 gap-y-1 max-h-48 overflow-auto">
        <label class="flex items-center gap-1 font-semibold">
          <input type="checkbox" checked={free().length > 0 && picked().size === free().length} onChange={(e) => setPicked(new Set<string>(e.currentTarget.checked ? free().map((x) => x._id) : []))} />
          All ({free().length})
        </label>
        <For each={free()}>
          {(f) => (
            <label class="flex items-center gap-1">
              <input
                type="checkbox"
                checked={picked().has(f._id)}
                onChange={() => {
                  const s = new Set(picked());
                  s.has(f._id) ? s.delete(f._id) : s.add(f._id);
                  setPicked(s);
                }}
              />
              {f.name}
            </label>
          )}
        </For>
      </div>
      <div class="flex flex-wrap gap-2 items-end">
        <label class="flex flex-col text-xs">Type<select name="type" class={input}><For each={TYPES}>{([k, v]) => <option value={k}>{v}</option>}</For></select></label>
        <label class="flex flex-col text-xs">Stage<select name="stage" class={input}><For each={STAGES}>{([k, v]) => <option value={k}>{v}</option>}</For></select></label>
        <label class="flex flex-col text-xs">
          Status
          <select name="status" class={input}>
            <option value="active">Active</option>
            <option value="on-hold">On hold</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button class="rounded-sm px-2 py-1 btn-default" disabled={busy() || !picked().size}>Add {picked().size} project(s)</button>
      </div>
    </form>
  );
}

export const Route = createFileRoute("/grove/")({ component: Dashboard });
