// The tree register on a project page: survival per field and row, causes,
// a link to log trees on a phone, CSV export, and (Grove team) making a
// register from a design or removing an unused one.
import { Link } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { showToast } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { ConfirmDialog } from "~/grove/ConfirmDialog.tsx";
import { pctText, shortDate, type Register, type RegisterList } from "~/grove/treeTypes.ts";
import { apiFetch, apiFetchBlob } from "~/util/apiFetch.ts";

type Design = { _id: string; field?: string; scenario?: string; prefix: string };
const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";

export function TreeRegisterPanel(props: { projectId: string }) {
  const [data, { refetch }] = createResource(() => props.projectId, (id) => apiFetch<RegisterList>(`/internal/projects/${id}/trees`));
  const d = () => (data.error ? undefined : data.latest);
  const causeName = (k: string) => d()?.causes.find(([c]) => c === k)?.[1] ?? k;
  const [making, setMaking] = createSignal(false);
  const [designs] = createResource(
    () => (making() && canSeeMoney() ? props.projectId : undefined),
    (id) => apiFetch<{ designs: Design[] }>(`/internal/projects/${id}/trees/designs`),
  );
  const [design, setDesign] = createSignal("");
  const [prefix, setPrefix] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [remove, setRemove] = createSignal<Register | null>(null);

  async function make(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiFetch<{ trees: number; rows: number }>(`/internal/projects/${props.projectId}/trees`, {
        method: "POST",
        body: JSON.stringify({ design: design(), prefix: prefix() }),
      });
      showToast({ title: "Tree register made", description: `${r.trees.toLocaleString("da-DK")} trees in ${r.rows} rows` });
      setMaking(false);
      refetch();
    } catch (err) {
      showToast({ title: "Register not made", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv(r: Register) {
    try {
      const blob = await apiFetchBlob(`/internal/projects/${props.projectId}/trees/${r._id}/export.csv`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Tree register - ${r.name.replace(/[\\/:*?"<>|]+/g, "_")}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showToast({ title: "Export failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <section class="flex flex-col gap-2" data-testid="tree-register" aria-label="Tree register">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-xl font-semibold mr-auto">Tree register</h2>
        <Show when={canSeeMoney()}>
          <button class="text-sm underline" onClick={() => setMaking(!making())}>{making() ? "Cancel" : "Make from a design"}</button>
        </Show>
      </div>
      <Show when={data.error}><p class="text-sm text-red-600">{(data.error as Error)?.message}</p></Show>

      <Show when={making()}>
        <form class="flex flex-wrap items-end gap-2 rounded-md border border-zinc-300 dark:border-slate-600 p-3 text-xs" onSubmit={make}>
          <label class="flex flex-col">
            Design (field · scenario)
            <select
              class={input}
              required
              value={design()}
              onChange={(e) => {
                setDesign(e.currentTarget.value);
                const p = designs()?.designs.find((x) => x._id === e.currentTarget.value)?.prefix;
                if (p && !prefix()) setPrefix(p);
              }}
            >
              <option value="">{designs.loading ? "Loading…" : designs()?.designs.length ? "Choose…" : "No designs on this project's farm"}</option>
              <For each={designs()?.designs}>{(x) => <option value={x._id}>{[x.field, x.scenario].filter(Boolean).join(" · ")}</option>}</For>
            </select>
          </label>
          <label class="flex flex-col">
            Tree-ID prefix
            <input class={input} required maxLength={8} pattern="[A-Za-z0-9_\-]+" value={prefix()} placeholder="e.g. EL1" onInput={(e) => setPrefix(e.currentTarget.value)} />
          </label>
          <button class="rounded-sm px-2 py-1 btn-default text-sm" disabled={busy()}>{busy() ? "Laying out…" : "Make register"}</button>
          <p class="basis-full opacity-70">
            Every tree in the design gets an ID like {prefix() || "EL1"}R03T017 (row 3, tree 17), the same names as the RTK stake-out files, so use the same prefix and the design as it was staked. Compare the tree and row counts shown after making it with the stake-out summary. Positions come from the design; as-staked RTK positions can replace them later.
          </p>
        </form>
      </Show>

      <For each={d()?.registers} fallback={<p class="text-sm opacity-70">{data.loading ? "Loading…" : "No tree register yet. Make one from the planted design to start logging trees."}</p>}>
        {(r) => (
          <div class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span class="font-semibold mr-auto">{r.name} <span class="font-normal opacity-70">({r.prefix})</span></span>
              <Link to="/grove/trees/$projectId/$registerId" params={{ projectId: props.projectId, registerId: r._id }} class="rounded-sm px-2 py-1 btn-default text-sm">
                Log trees
              </Link>
              <button class="text-sm underline" onClick={() => exportCsv(r)}>CSV</button>
              <Show when={canSeeMoney() && !r.field.checked}>
                <button class="text-sm underline text-red-700" onClick={() => setRemove(r)}>Delete</button>
              </Show>
            </div>
            <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span><b>{pctText(r.field.survivalPct)}</b> survival{r.field.seen < r.trees ? ` of ${r.field.seen.toLocaleString("da-DK")} trees looked at` : ""}</span>
              <span>{r.trees.toLocaleString("da-DK")} trees · {r.field.rowsWalked} of {r.rowCount} rows walked</span>
              <span>Dead {r.field.dead} · missing {r.field.missing} · weak {r.field.weak}</span>
              <span>{r.field.checked.toLocaleString("da-DK")} logged{r.field.replanted ? ` · ${r.field.replanted} replanted` : ""}</span>
            </div>
            <Show when={Object.keys(r.field.causes).length}>
              <div class="text-xs">
                Causes:{" "}
                {Object.entries(r.field.causes)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => `${causeName(k)} ${n}`)
                  .join(" · ")}
              </div>
            </Show>
            <details>
              <summary class="text-sm cursor-pointer">Per row</summary>
              <div class="overflow-x-auto">
                <table class="w-full text-sm mt-1">
                  <thead>
                    <tr class="text-left text-xs opacity-70">
                      <th class="py-1 pr-3">Row</th>
                      <th class="py-1 pr-3">Survival</th>
                      <th class="py-1 pr-3">Dead</th>
                      <th class="py-1 pr-3">Missing</th>
                      <th class="py-1 pr-3">Weak</th>
                      <th class="py-1 pr-3">Main cause</th>
                      <th class="py-1 pr-3">Walked</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={r.rowStats}>
                      {(x) => {
                        const main = Object.entries(x.causes).sort((a, b) => b[1] - a[1])[0];
                        return (
                          <tr class="border-t border-zinc-200 dark:border-slate-700">
                            <td class="py-1 pr-3">{x.row}</td>
                            <td class="py-1 pr-3" classList={{ "text-red-700 dark:text-red-400 font-semibold": (x.mortalityPct ?? 0) > 10 }}>{pctText(x.survivalPct)}</td>
                            <td class="py-1 pr-3">{x.dead || ""}</td>
                            <td class="py-1 pr-3">{x.missing || ""}</td>
                            <td class="py-1 pr-3">{x.weak || ""}</td>
                            <td class="py-1 pr-3">{main ? `${causeName(main[0])} (${main[1]})` : ""}</td>
                            <td class="py-1 pr-3">{shortDate(r.rowChecks[String(x.row)]?.at)}</td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
              <p class="text-xs opacity-70 mt-1">Survival counts trees looked at: rows marked walked, plus trees logged one by one. Red: more than 10 % dead or missing in the row (the guarantee threshold).</p>
            </details>
          </div>
        )}
      </For>

      <ConfirmDialog
        open={!!remove()}
        title="Delete tree register"
        confirmLabel="Delete register"
        danger
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          try {
            await apiFetch(`/internal/projects/${props.projectId}/trees/${remove()!._id}`, { method: "DELETE" });
            setRemove(null);
            refetch();
          } catch (err) {
            setRemove(null);
            showToast({ title: "Not deleted", description: (err as Error).message, variant: "destructive" });
          }
        }}
      >
        Delete the register "{remove()?.name}" and its {remove()?.trees.toLocaleString("da-DK")} trees? Only possible while no tree has been logged. The design stays.
      </ConfirmDialog>
    </section>
  );
}
