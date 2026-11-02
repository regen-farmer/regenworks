// Logging trees on a phone: walk a row, tap a tree, set its status and the
// cause of death or damage, add a note. "Nearest tree" uses the phone's GPS.
// Each tap is saved at once. Field users on assigned projects and the team.
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { pctText, shortDate, STATUS, STATUS_EN, type RegisterList, type Tree, type TreeStatus } from "~/grove/treeTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

const TILE: Record<TreeStatus, string> = {
  alive: "border-emerald-700",
  weak: "bg-amber-400 text-black border-amber-500",
  dead: "bg-red-700 text-white border-red-700",
  missing: "bg-zinc-700 text-white border-zinc-700",
};

function TreeLog() {
  const params = Route.useParams();
  const base = () => `/internal/projects/${params().projectId}/trees`;
  const [list, { refetch: refetchList }] = createResource(() => params().projectId, () => apiFetch<RegisterList>(base()));
  const register = () => (list.error ? undefined : list.latest)?.registers.find((r) => r._id === params().registerId);
  const causes = () => list.latest?.causes ?? [];
  const causeName = (k?: string) => causes().find(([c]) => c === k)?.[1] ?? k ?? "";

  const [row, setRow] = createSignal(1);
  let startedFor = "";
  createEffect(() => {
    // start once per register on the first row not walked yet
    const r = register();
    if (r && startedFor !== r._id) {
      startedFor = r._id;
      const first = r.rowStats.find((x) => !r.rowChecks[String(x.row)])?.row;
      if (first && first !== 1) setRow(first);
    }
  });
  const [rowData, { mutate: setRowData }] = createResource(
    () => ({ row: row(), id: params().registerId }),
    (k) => apiFetch<{ row: number; trees: Tree[]; checked: { at: string } | null }>(`${base()}/${k.id}/rows/${k.row}`),
  );
  const trees = () => (rowData.error ? undefined : rowData.latest?.row === row() ? rowData.latest : undefined);

  const [selected, setSelected] = createSignal<string | null>(null);
  const [detail, { mutate: setDetail }] = createResource(
    () => selected() ?? undefined,
    (name) => apiFetch<{ tree: Tree }>(`${base()}/${params().registerId}/trees/${encodeURIComponent(name)}`),
  );
  const tree = () => (detail.error ? undefined : detail.latest?.tree.name === selected() ? detail.latest.tree : undefined);
  const [saving, setSaving] = createSignal(0);
  const [near, setNear] = createSignal<(Tree & { distanceM: number })[] | null>(null);
  const [locating, setLocating] = createSignal(false);

  // Saves go one after another, so a note saved on blur doesn't swallow the
  // status tap that caused the blur; each is for the tree it was made on.
  let queue: Promise<unknown> = Promise.resolve();
  function save(body: Record<string, unknown>) {
    const name = selected();
    if (!name) return;
    queue = queue.then(() => saveOne(name, body));
  }
  async function saveOne(name: string, body: Record<string, unknown>) {
    setSaving((n) => n + 1);
    try {
      const r = await apiFetch<{ tree: Tree }>(`${base()}/${params().registerId}/trees/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(body) });
      // only the tree still open gets the reply (history kept, this entry added)
      const open = detail.latest;
      if (selected() === name && open?.tree.name === name) {
        setDetail({ tree: { ...r.tree, history: [...(open.tree.history ?? []), { at: new Date().toISOString(), ...body } as any] } });
      }
      const rd = rowData.latest;
      if (rd && rd.row === r.tree.row) setRowData({ ...rd, trees: rd.trees.map((t) => (t.name === name ? { ...t, ...r.tree } : t)) });
    } catch (err) {
      showToast({ title: `${name} not saved`, description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving((n) => n - 1);
    }
  }

  async function rowWalked() {
    const walked = row();
    try {
      await queue; // the row's last taps first
      const r = await apiFetch<{ checked: { at: string } }>(`${base()}/${params().registerId}/rows/${walked}/checked`, { method: "PUT" });
      const rd = rowData.latest;
      if (rd && rd.row === walked) setRowData({ ...rd, checked: r.checked });
      refetchList();
      showToast({ title: `Row ${walked} walked` });
      const reg = register();
      // move on only if still on that row
      if (reg && row() === walked && walked < reg.rowCount) goRow(walked + 1);
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    }
  }

  function goRow(n: number) {
    const max = register()?.rowCount ?? 1;
    setSelected(null);
    setRow(Math.min(max, Math.max(1, n)));
    window.scrollTo({ top: 0 });
  }

  function findNearest() {
    if (!navigator.geolocation) {
      showToast({ title: "No GPS in this browser", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await apiFetch<{ trees: (Tree & { distanceM: number })[] }>(
            `${base()}/${params().registerId}/near?lon=${pos.coords.longitude}&lat=${pos.coords.latitude}`,
          );
          setNear(r.trees);
          if (pos.coords.accuracy > 5) showToast({ title: `GPS accuracy ±${Math.round(pos.coords.accuracy)} m`, description: "Check the tree number on the stake." });
        } catch (err) {
          showToast({ title: "Could not find trees", description: (err as Error).message, variant: "destructive" });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        showToast({ title: "No position", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    );
  }

  function openTree(t: { name: string; row: number }) {
    setNear(null);
    if (t.row !== row()) setRow(t.row);
    setSelected(t.name);
  }

  return (
    <div class="mx-auto max-w-xl p-3 flex flex-col gap-3" classList={{ "pb-[65vh]": !!selected(), "pb-8": !selected() }} data-testid="tree-log">
      <Toaster />
      <div class="flex items-center gap-2">
        <Link to="/grove/projects/$projectId" params={{ projectId: params().projectId }} class="text-sm underline">← Project</Link>
        <span class="text-xs opacity-60 ml-auto" aria-live="polite">{saving() ? "Saving…" : ""}</span>
      </div>
      <Show when={register()} fallback={<p>{list.error ? (list.error as Error).message : list.loading ? "Loading…" : "Tree register not found."}</p>}>
        {(r) => (
          <>
            <div>
              <h1 class="text-xl font-bold">{r().name}</h1>
              <p class="text-sm">
                <b>{pctText(r().field.survivalPct)}</b> survival · dead {r().field.dead} · missing {r().field.missing} · weak {r().field.weak} · {r().trees.toLocaleString("da-DK")} trees
              </p>
            </div>

            <div class="flex items-center gap-2">
              <button class="rounded-md px-4 py-3 btn-default text-lg" disabled={row() <= 1} onClick={() => goRow(row() - 1)} aria-label="Previous row">‹</button>
              <label class="flex-1 flex flex-col text-xs">
                Row
                <select class="p-2 rounded-md border border-zinc-300 dark:border-slate-600 bg-transparent text-lg" value={row()} onChange={(e) => goRow(Number(e.currentTarget.value))}>
                  <For each={r().rowStats}>
                    {(x) => (
                      <option value={x.row}>
                        Row {x.row} · {pctText(x.survivalPct)}
                        {r().rowChecks[String(x.row)] ? " ✓" : ""}
                      </option>
                    )}
                  </For>
                </select>
              </label>
              <button class="rounded-md px-4 py-3 btn-default text-lg" disabled={row() >= r().rowCount} onClick={() => goRow(row() + 1)} aria-label="Next row">›</button>
            </div>

            <button class="rounded-md px-3 py-2 border border-zinc-300 dark:border-slate-600 text-sm" disabled={locating()} onClick={findNearest}>
              <i class="fa-solid fa-location-crosshairs" aria-hidden="true" /> {locating() ? "Finding your position…" : "Nearest tree (GPS)"}
            </button>
            <Show when={near()}>
              <div class="flex flex-wrap gap-2">
                <For each={near()}>
                  {(t) => (
                    <button class="rounded-md px-3 py-2 border border-zinc-300 dark:border-slate-600 text-sm" onClick={() => openTree(t)}>
                      {t.name} <span class="opacity-70">{t.distanceM} m</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <p class="text-xs opacity-70">
              Tap a tree to log it. Trees you don't tap stay as they are; when the whole row is looked at, press "Row walked".
              {trees()?.checked ? ` Last walked ${shortDate(trees()!.checked!.at)}.` : ""}
            </p>
            <Show when={trees()} fallback={<p class="text-sm">{rowData.error ? (rowData.error as Error).message : "Loading row…"}</p>}>
              <div class="grid grid-cols-5 sm:grid-cols-8 gap-1.5" role="list" aria-label={`Row ${row()}`}>
                <For each={trees()!.trees}>
                  {(t) => (
                    <button
                      role="listitem"
                      class={`rounded-md border-2 py-2 text-sm leading-tight ${TILE[t.status]}`}
                      classList={{ "ring-4 ring-sky-500": selected() === t.name }}
                      aria-label={`${t.name}: ${STATUS_EN[t.status]}${t.cause ? `, ${causeName(t.cause)}` : ""}`}
                      onClick={(e) => {
                        setSelected(t.name);
                        // keep the tapped tree visible above the sheet
                        const el = e.currentTarget;
                        setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
                      }}
                    >
                      <div class="font-semibold">{t.tree}</div>
                      <div class="text-[10px] opacity-80 truncate px-0.5">{t.status === "alive" ? (t.replanted ? "replanted" : "") : t.cause ? causeName(t.cause).split(" ")[0] : STATUS_EN[t.status]}</div>
                    </button>
                  )}
                </For>
              </div>
              <button class="rounded-md px-3 py-3 btn-default" onClick={rowWalked}>
                Row {row()} walked ✓
              </button>
            </Show>
          </>
        )}
      </Show>

      {/* the tree being logged, fixed at the bottom so it's reachable with a thumb */}
      <Show when={selected()}>
        <div class="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg">
          <div class="mx-auto max-w-xl p-3 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            <div class="flex items-start gap-2">
              <div class="mr-auto">
                <div class="font-bold">{selected()}</div>
                <div class="text-xs opacity-80">{tree()?.label}{tree()?.positionSource === "rtk" ? " · RTK position" : ""}</div>
              </div>
              <button class="text-sm underline" onClick={() => setSelected(null)}>Close</button>
            </div>
            <Show when={tree()} fallback={<p class="text-sm">{detail.error ? (detail.error as Error).message : "Loading…"}</p>}>
              {(t) => (
                <div class="contents">
                  <div class="grid grid-cols-4 gap-1.5" role="group" aria-label="Status">
                    <For each={STATUS}>
                      {([k, label, on]) => (
                        <button class={`rounded-md border-2 py-3 text-sm ${t().status === k ? on : "border-zinc-300 dark:border-slate-600"}`} aria-pressed={t().status === k} onClick={() => t().status !== k && save({ status: k })}>
                          {label}
                        </button>
                      )}
                    </For>
                  </div>
                  <Show when={t().status !== "alive"}>
                    <div class="text-xs">Cause</div>
                    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Cause">
                      <For each={causes()}>
                        {([k, label]) => (
                          <button
                            class={`rounded-full border px-3 py-1.5 text-sm ${t().cause === k ? "bg-sky-700 text-white border-sky-700" : "border-zinc-300 dark:border-slate-600"}`}
                            aria-pressed={t().cause === k}
                            onClick={() => save({ cause: t().cause === k ? null : k })}
                          >
                            {label}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                  <textarea
                    class="p-2 rounded-md border border-zinc-300 dark:border-slate-600 bg-transparent text-sm"
                    rows={2}
                    maxLength={1000}
                    aria-label="Note"
                    placeholder="Note, e.g. bark gnawed at the base, guard missing"
                    value={t().note ?? ""}
                    onBlur={(e) => e.currentTarget.value.trim() !== (t().note ?? "") && save({ note: e.currentTarget.value })}
                  />
                  <Show when={t().status === "dead" || t().status === "missing"}>
                    <button class="rounded-md px-3 py-2 border border-zinc-300 dark:border-slate-600 text-sm self-start" onClick={() => save({ replanted: true })}>
                      Replanted with a new tree
                    </button>
                  </Show>
                  <Show when={t().history?.length}>
                    <details>
                      <summary class="text-xs cursor-pointer">History ({t().history!.length})</summary>
                      <ul class="text-xs mt-1 flex flex-col gap-0.5">
                        <For each={[...(t().history ?? [])].reverse().slice(0, 10)}>
                          {(h) => (
                            <li>
                              {shortDate(h.at)}: {[h.replanted ? "replanted" : h.status ? STATUS_EN[h.status] : "", h.cause ? causeName(h.cause) : "", h.note].filter(Boolean).join(" · ")}
                            </li>
                          )}
                        </For>
                      </ul>
                    </details>
                  </Show>
                </div>
              )}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/trees/$projectId/$registerId")({ component: TreeLog });
