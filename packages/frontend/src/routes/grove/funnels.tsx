// Funnels & sources (A · Deals settings), like Pipedrive: make, rename,
// reorder, hide and delete funnels; add, rename, reorder and remove stages
// with an optional target time; and the list of deal sources. Grove team only.
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createEffect, createResource, createSignal, For, Index, on, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { ConfirmDialog } from "~/grove/ConfirmDialog.tsx";
import type { Funnel, StageKind } from "~/grove/dealTypes.ts";
import { loadSources } from "~/grove/SourceSelect.tsx";
import { apiFetch } from "~/util/apiFetch.ts";

type EStage = { key: string; name: string; kind: StageKind; targetDays?: number | null; deals: number };
type EFunnel = Omit<Funnel, "stages"> & { stages: EStage[]; deals: number; updatedAt: string };
type Template = { key: string; name: string; description: string };
type Draft = { key?: string; name: string; kind: StageKind; targetDays: string; deals: number };

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";
const KIND_EN: Record<StageKind, string> = { open: "Open", won: "Won", lost: "Lost" };
const btn = "rounded-sm px-1.5 py-0.5 text-xs border border-zinc-300 dark:border-slate-600 disabled:opacity-30";

function FunnelCard(props: { f: EFunnel; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void; onChanged: () => void }) {
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [stages, setStages] = createSignal<Draft[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [askDelete, setAskDelete] = createSignal(false);
  // start again from what is saved when this funnel changes on the server
  // (not when another funnel is saved: unsaved edits here stay)
  createEffect(on(() => `${props.f._id}|${props.f.updatedAt}`, () => {
    setName(props.f.name);
    setDescription(props.f.description ?? "");
    setStages(props.f.stages.map((s) => ({ key: s.key, name: s.name, kind: s.kind, targetDays: s.targetDays ? String(s.targetDays) : "", deals: s.deals })));
  }));
  const dirty = () =>
    name() !== props.f.name ||
    description() !== (props.f.description ?? "") ||
    JSON.stringify(stages().map((s) => [s.key, s.name, s.kind, s.targetDays])) !==
      JSON.stringify(props.f.stages.map((s) => [s.key, s.name, s.kind, s.targetDays ? String(s.targetDays) : ""]));
  const set = (i: number, patch: Partial<Draft>) => setStages(stages().map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const swap = (i: number, j: number) => {
    const x = [...stages()];
    [x[i], x[j]] = [x[j], x[i]];
    setStages(x);
  };
  const addStage = () => {
    // new open stages go before Won/Lost
    const x = [...stages()];
    const at = x.findIndex((s) => s.kind !== "open");
    x.splice(at < 0 ? x.length : at, 0, { name: "", kind: "open", targetDays: "", deals: 0 });
    setStages(x);
  };

  async function save(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/internal/funnels/${props.f._id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name(),
          description: description(),
          updatedAt: props.f.updatedAt,
          stages: stages().map((s) => ({ key: s.key, name: s.name, kind: s.kind, targetDays: s.targetDays === "" ? null : Number(s.targetDays) })),
        }),
      });
      showToast({ title: "Funnel saved" });
      props.onChanged();
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function archive(archived: boolean) {
    try {
      await apiFetch(`/internal/funnels/${props.f._id}/archive`, { method: "POST", body: JSON.stringify({ archived }) });
      props.onChanged();
    } catch (err) {
      showToast({ title: "Not changed", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <details class="rounded-md border border-zinc-300 dark:border-slate-600" classList={{ "opacity-70": !!props.f.archived }}>
      <summary class="cursor-pointer px-3 py-2 flex flex-wrap items-center gap-2">
        <span class="font-semibold mr-auto">
          {props.f.name}
          <Show when={props.f.archived}><span class="font-normal text-xs"> (hidden)</span></Show>
        </span>
        <span class="text-xs opacity-70">{props.f.stages.length} stages · {props.f.deals} deals</span>
        <button type="button" class={btn} disabled={props.first} aria-label="Move up" onClick={(e) => { e.preventDefault(); props.onMove(-1); }}>↑</button>
        <button type="button" class={btn} disabled={props.last} aria-label="Move down" onClick={(e) => { e.preventDefault(); props.onMove(1); }}>↓</button>
      </summary>
      <form class="px-3 pb-3 flex flex-col gap-2" onSubmit={save}>
        <div class="flex flex-wrap gap-2">
          <label class="flex flex-col text-xs flex-1 min-w-48">Name<input class={input} required maxLength={100} value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label>
          <label class="flex flex-col text-xs flex-[2] min-w-64">Description<input class={input} maxLength={500} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} /></label>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs opacity-70">
                <th class="py-1 pr-2">Stage</th>
                <th class="py-1 pr-2">Kind</th>
                <th class="py-1 pr-2">Target (days)</th>
                <th class="py-1 pr-2">Deals</th>
                <th class="py-1 pr-2" />
              </tr>
            </thead>
            <tbody>
              <Index each={stages()}>
                {(s, i) => (
                  <tr class="border-t border-zinc-200 dark:border-slate-700">
                    <td class="py-1 pr-2"><input class={`${input} w-full`} required maxLength={80} value={s().name} placeholder="Stage name" onInput={(e) => set(i, { name: e.currentTarget.value })} /></td>
                    <td class="py-1 pr-2">
                      <select class={input} value={s().kind} onChange={(e) => set(i, { kind: e.currentTarget.value as StageKind, targetDays: e.currentTarget.value === "open" ? s().targetDays : "" })}>
                        <For each={Object.entries(KIND_EN)}>{([k, l]) => <option value={k}>{l}</option>}</For>
                      </select>
                    </td>
                    <td class="py-1 pr-2">
                      <input class={`${input} w-20`} type="number" min="1" max="365" disabled={s().kind !== "open"} value={s().targetDays} placeholder="–" onInput={(e) => set(i, { targetDays: e.currentTarget.value })} />
                    </td>
                    <td class="py-1 pr-2 text-xs">{s().key ? s().deals : "new"}</td>
                    <td class="py-1 pr-2 whitespace-nowrap">
                      <button type="button" class={btn} disabled={i === 0} aria-label="Stage up" onClick={() => swap(i, i - 1)}>↑</button>{" "}
                      <button type="button" class={btn} disabled={i === stages().length - 1} aria-label="Stage down" onClick={() => swap(i, i + 1)}>↓</button>{" "}
                      <button
                        type="button"
                        class={btn}
                        disabled={s().deals > 0}
                        title={s().deals > 0 ? "Move its deals to another stage first (archived deals too)" : "Remove stage"}
                        onClick={() => setStages(stages().filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )}
              </Index>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="text-sm underline" disabled={stages().length >= 20} onClick={addStage}>+ Add stage</button>
          <button class="rounded-sm px-2 py-1 btn-default text-sm ml-auto" disabled={busy() || !dirty()}>Save funnel</button>
          <Show when={dirty()}><button type="button" class="text-sm underline" onClick={() => { setName(props.f.name); setDescription(props.f.description ?? ""); setStages(props.f.stages.map((s) => ({ key: s.key, name: s.name, kind: s.kind, targetDays: s.targetDays ? String(s.targetDays) : "", deals: s.deals }))); }}>Undo changes</button></Show>
          <button type="button" class="text-sm underline" onClick={() => archive(!props.f.archived)}>{props.f.archived ? "Show again" : "Hide"}</button>
          <Show when={props.f.deals === 0}><button type="button" class="text-sm underline text-red-700" onClick={() => setAskDelete(true)}>Delete</button></Show>
        </div>
        <p class="text-xs opacity-60">
          New deals start in the first stage. Each funnel needs at least one Open, one Won and one Lost stage. The target time marks cards that stay longer in an open stage. Renaming never touches deals; a stage can be removed once no deal is in it.
        </p>
      </form>
      <ConfirmDialog
        open={askDelete()}
        title="Delete funnel"
        confirmLabel="Delete funnel"
        danger
        onClose={() => setAskDelete(false)}
        onConfirm={async () => {
          try {
            await apiFetch(`/internal/funnels/${props.f._id}`, { method: "DELETE" });
            setAskDelete(false);
            props.onChanged();
          } catch (err) {
            setAskDelete(false);
            showToast({ title: "Not deleted", description: (err as Error).message, variant: "destructive" });
          }
        }}
      >
        Delete the funnel "{props.f.name}"? It has no deals.
      </ConfirmDialog>
    </details>
  );
}

function Sources() {
  const [data, { refetch }] = createResource(() => (canSeeMoney() ? true : undefined), () => apiFetch<{ sources: string[]; defaults: string[] }>("/internal/deals/sources"));
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  createEffect(() => {
    const d = data.latest;
    if (d) setText(d.sources.join("\n"));
  });
  async function save() {
    setBusy(true);
    try {
      await apiFetch("/internal/deals/sources", { method: "PUT", body: JSON.stringify({ sources: text().split("\n") }) });
      await loadSources(true);
      refetch();
      showToast({ title: "Sources saved" });
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="flex flex-col gap-2" aria-label="Deal sources">
      <h2 class="text-xl font-semibold">Deal sources</h2>
      <p class="text-xs opacity-70">
        One per line, in the order they show in the dropdown. Renaming a source here doesn't change deals that already have the old name; they keep it. Use "Source detail" on a deal for e.g. the ØRD adviser.
      </p>
      <textarea class={`${input} font-mono`} rows={Math.max(6, text().split("\n").length + 1)} value={text()} onInput={(e) => setText(e.currentTarget.value)} />
      <div class="flex gap-2 items-center">
        <button class="rounded-sm px-2 py-1 btn-default text-sm" disabled={busy() || !data.latest} onClick={save}>Save sources</button>
        <button class="text-sm underline" onClick={() => data.latest && setText(data.latest.defaults.join("\n"))}>Use the proposed list</button>
      </div>
    </section>
  );
}

function Funnels() {
  const [data, { refetch }] = createResource(() => (canSeeMoney() ? true : undefined), () => apiFetch<{ funnels: EFunnel[]; templates: Template[] }>("/internal/funnels?editor=1"));
  const funnels = () => (data.error ? [] : (data.latest?.funnels ?? []));
  const [newName, setNewName] = createSignal("");
  const [template, setTemplate] = createSignal("blank");
  const [busy, setBusy] = createSignal(false);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/internal/funnels", { method: "POST", body: JSON.stringify({ name: newName(), template: template(), description: data.latest?.templates.find((t) => t.key === template())?.description }) });
      setNewName("");
      showToast({ title: "Funnel made", description: "It shows as a tab on the Deals board." });
      refetch();
    } catch (err) {
      showToast({ title: "Not made", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const ids = funnels().map((f) => f._id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await apiFetch("/internal/funnels/order", { method: "PUT", body: JSON.stringify({ ids }) });
      refetch();
    } catch (err) {
      showToast({ title: "Not moved", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <div class="container mx-auto p-4 flex flex-col gap-4 max-w-4xl" data-testid="grove-funnels">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Only for the Grove team.</p>}>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-bold mr-auto">Funnels & sources</h1>
          <Link to="/grove/deals" class="text-sm underline">← Deals</Link>
          <Link to="/grove/deals/report" class="text-sm underline">Report</Link>
        </div>
        <Show when={data.error}><p class="text-sm text-red-600">{(data.error as Error)?.message}</p></Show>

        <section class="flex flex-col gap-2" aria-label="Funnels">
          <h2 class="text-xl font-semibold">Funnels</h2>
          <Index each={funnels()} fallback={<p class="text-sm">{data.loading ? "Loading…" : "No funnels."}</p>}>
            {(f, i) => <FunnelCard f={f()} first={i === 0} last={i === funnels().length - 1} onMove={(dir) => move(i, dir)} onChanged={refetch} />}
          </Index>
          <form class="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-zinc-300 dark:border-slate-600 p-3 text-xs" onSubmit={create}>
            <label class="flex flex-col">New funnel<input class={input} required maxLength={100} value={newName()} placeholder="e.g. Corporate pilots" onInput={(e) => setNewName(e.currentTarget.value)} /></label>
            <label class="flex flex-col">
              Start from
              <select class={input} value={template()} onChange={(e) => setTemplate(e.currentTarget.value)}>
                <For each={data.latest?.templates}>{(t) => <option value={t.key}>{t.name}: {t.description}</option>}</For>
              </select>
            </label>
            <button class="rounded-sm px-2 py-1 btn-default text-sm" disabled={busy()}>Make funnel</button>
          </form>
        </section>

        <Sources />
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/funnels")({ component: Funnels });
