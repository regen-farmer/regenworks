// B · Projects → Economics (Grove team only, 22 Nov 2026): economic scenarios for farm plans,
// and the import of Grove Data's assumptions (yields, prices, costs, area payments).
// Kept apart from offers and from the public app for now.
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney, uploadForm } from "~/grove/access.ts";
import { apiFetch } from "~/util/apiFetch.ts";

export type AssumptionsInfo = {
  active: { version: number; importedAt: string; note?: string; counts: Record<string, number>; warnings: string[] } | null;
  versions: { version: number; importedAt: string; note?: string }[];
  payments: { payment_id: string; scheme: string; scheme_da?: string; rate: number; currency: string; eligibility?: string }[];
  crops: { crop_id: string; common_en?: string; common_da?: string; product?: string; form_at_harvest?: string }[];
  ranges: { parameter: string; crop_id: string; low: number; likely: number; high: number; unit?: string; sources?: string }[];
};
export type Farm = { _id: string; name: string; fields: { _id: string; name: string; size?: number; scenarios: { _id: string; name: string }[] }[] };

const FILES = ["assumption_ranges.csv", "area_payments.csv", "frugt_baer_rules.csv", "crops.csv", "sources.csv"];
const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";

function Economics() {
  const navigate = useNavigate();
  const [list, { refetch: refetchList }] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ scenarios: any[] }>("/internal/economics"));
  const [assumptions, { refetch }] = createResource(() => canSeeMoney() || undefined, () => apiFetch<AssumptionsInfo>("/internal/economics/assumptions"));
  const [farms] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ farms: Farm[] }>("/internal/economics/farms"));
  const [farm, setFarm] = createSignal("");
  const [name, setName] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (!farm()) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ scenario: { _id: string } }>("/internal/economics", { method: "POST", body: JSON.stringify({ farm: farm(), name: name() || undefined }) });
      navigate({ to: "/grove/economics/$scenarioId", params: { scenarioId: r.scenario._id } });
    } catch (err) {
      showToast({ title: "Couldn't create it", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function importFiles(e: SubmitEvent) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    const picked = (formEl.elements.namedItem("files") as HTMLInputElement).files;
    if (!picked?.length) return;
    const form = new FormData();
    for (const f of Array.from(picked)) if (FILES.includes(f.name)) form.append(f.name, f);
    if (!form.has("assumption_ranges.csv") || !form.has("area_payments.csv")) {
      showToast({ title: "assumption_ranges.csv and area_payments.csv are needed", description: "Choose the files in grove-data's assumptions/ folder.", variant: "destructive" });
      return;
    }
    form.append("note", (formEl.elements.namedItem("note") as HTMLInputElement).value);
    setBusy(true);
    try {
      const s = await uploadForm<{ version: number; warnings: string[] }>("/internal/economics/assumptions/import", form);
      showToast({ title: `Assumptions version ${s.version} imported`, description: s.warnings?.[0] });
      formEl.reset();
      refetch();
    } catch (err) {
      showToast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="container mx-auto p-4 flex flex-col gap-6" data-testid="grove-economics">
      <Toaster />
      <div>
        <h1 class="text-3xl font-bold">Economics</h1>
        <p class="text-sm opacity-70">
          What a farm plan earns or costs, year by year, against what the land does today. Every number is a range from Grove Data's
          assumptions; missing numbers are shown as "no data". Grove team only, and separate from offers for now.
        </p>
      </div>
      <Show when={canSeeMoney()} fallback={<p>Economics is only shown to the Grove team.</p>}>
        <section class="flex flex-col gap-2">
          <h2 class="text-xl font-semibold">Economic scenarios</h2>
          <form class="flex gap-2 items-center flex-wrap" onSubmit={create}>
            <select class={input} value={farm()} onChange={(e) => setFarm(e.currentTarget.value)}>
              <option value="">Choose a farm…</option>
              <For each={farms()?.farms}>{(f) => <option value={f._id}>{f.name} ({f.fields.length} fields)</option>}</For>
            </select>
            <input class={input} placeholder="Name (e.g. Plan A, hazel and walnut)" value={name()} onInput={(e) => setName(e.currentTarget.value)} maxLength={120} />
            <button class="rounded-sm px-2 py-1 btn-default text-sm" disabled={!farm() || busy()}>New economic scenario</button>
          </form>
          <Show when={list()?.scenarios.length} fallback={<p class="text-sm opacity-70">{list.loading ? "Loading…" : "None yet."}</p>}>
            <table class="w-full text-sm">
              <thead>
                <tr>
                  <th class="text-left py-1 pr-3">Name</th>
                  <th class="text-left py-1 pr-3">Farm</th>
                  <th class="text-left py-1 pr-3">Fields</th>
                  <th class="text-left py-1 pr-3">Assumptions</th>
                  <th class="text-left py-1 pr-3">Changed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <For each={list()!.scenarios}>
                  {(s) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class="py-1 pr-3">
                        <Link to="/grove/economics/$scenarioId" params={{ scenarioId: s._id }} class="underline">{s.name}</Link>
                      </td>
                      <td class="py-1 pr-3">{s.farm?.name ?? "–"}</td>
                      <td class="py-1 pr-3">{s.fields}</td>
                      <td class="py-1 pr-3">{s.assumptionsVersion ? `v${s.assumptionsVersion}` : "–"}</td>
                      <td class="py-1 pr-3">{new Date(s.updatedAt).toLocaleDateString("da-DK")}</td>
                      <td class="py-1 pr-3 text-right">
                        <button
                          class="text-xs underline opacity-70"
                          onClick={async () => {
                            if (!confirm(`Delete "${s.name}"?`)) return;
                            await apiFetch(`/internal/economics/${s._id}`, { method: "DELETE" });
                            refetchList();
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-xl font-semibold">Assumptions</h2>
          <Show when={assumptions()?.active} fallback={<p class="text-sm">No assumptions imported yet. Import them before calculating.</p>}>
            {(a) => (
              <p class="text-sm">
                Version {a().version}, imported {new Date(a().importedAt).toLocaleString("da-DK")}
                {a().note ? ` · ${a().note}` : ""} · {a().counts.ranges} ranges · {a().counts.payments} area payments · {a().counts.fruitBerry} fruit/berry rules
              </p>
            )}
          </Show>
          <Show when={assumptions()?.active?.warnings.length}>
            <ul class="text-sm list-disc ml-5 text-amber-700">
              <For each={assumptions()!.active!.warnings}>{(w) => <li>{w}</li>}</For>
            </ul>
          </Show>
          <form class="flex gap-2 items-center flex-wrap" onSubmit={importFiles}>
            <input type="file" name="files" accept=".csv,text/csv" multiple class="text-sm" />
            <input name="note" class={input} placeholder="Note (optional)" maxLength={500} />
            <button class="rounded-sm px-2 py-1 btn-default text-sm" disabled={busy()}>Import</button>
          </form>
          <p class="text-xs opacity-70">
            From the private grove-data repo, folder <code>assumptions/</code>: {FILES.join(", ")}. Each import is a new version; scenarios keep the version they were
            calculated with until you switch them to a newer one.
          </p>
        </section>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/economics/")({ component: Economics });
