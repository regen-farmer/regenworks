// Grove pricebook: upload a version from the private grove-pricebook repo,
// see documents with their dates, and search prices. Grove team only.
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney, kr, uploadForm } from "~/grove/access.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type Summary = {
  version: number | null;
  importedAt?: string;
  note?: string;
  counts?: { suppliers: number; documents: number; supplierPrices: number; salesPrices: number; services?: number };
  warnings?: string[];
  suppliers?: { supplierId: string; name: string; country?: string; organicCertification?: string }[];
  documents?: { docId: string; supplierId: string; title?: string; documentDate: string; dateBasis?: string; outdated: boolean }[];
};

const FILES = ["suppliers.csv", "documents.csv", "supplier_prices.csv", "sales_prices.csv"];
const th = "text-left font-semibold py-1 pr-3";
const td = "py-1 pr-3 align-top";
const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";

function Pricebook() {
  const [summary, { refetch }] = createResource(() => canSeeMoney() || undefined, () => apiFetch<Summary>("/internal/pricebook"));
  const [busy, setBusy] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<{ salesPrices: any[]; supplierPrices: any[] }>();

  async function importFiles(e: SubmitEvent) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    const picked = (formEl.elements.namedItem("files") as HTMLInputElement).files;
    if (!picked?.length) return;
    const form = new FormData();
    for (const f of Array.from(picked)) {
      if (FILES.includes(f.name) || f.name === "settings.csv" || f.name === "services.csv") form.append(f.name, f);
    }
    const missing = FILES.filter((n) => !form.has(n));
    if (missing.length) {
      showToast({ title: `Missing: ${missing.join(", ")}`, description: "Choose all four CSV files from the grove-pricebook repo.", variant: "destructive" });
      return;
    }
    form.append("note", (formEl.elements.namedItem("note") as HTMLInputElement).value);
    setBusy(true);
    try {
      const s = await uploadForm<Summary>("/internal/pricebook/import", form);
      const servicesWarning = s.warnings?.find((w) => w.startsWith("services.csv was not included"));
      showToast({ title: `Pricebook version ${s.version} imported`, description: servicesWarning, variant: servicesWarning ? "destructive" : undefined });
      formEl.reset();
      refetch();
    } catch (err) {
      showToast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function search(e?: Event) {
    e?.preventDefault();
    setResults(await apiFetch(`/internal/pricebook/search?q=${encodeURIComponent(query())}`));
  }

  const supplierName = (id: string) => summary()?.suppliers?.find((s) => s.supplierId === id)?.name ?? id;

  return (
    <div class="container mx-auto p-4 flex flex-col gap-6" data-testid="grove-pricebook">
      <Toaster />
      <div>
        <h1 class="text-3xl font-bold">Pricebook</h1>
        <Link to="/grove/prices" class="text-sm underline">See all prices, costs and margins →</Link>
        <p class="text-sm opacity-70">
          Grove's prices from the private grove-pricebook repo. Offers use Grove's sales price where one exists, otherwise
          the supplier price plus margin, rounded to 5 kr.
        </p>
      </div>

      <Show when={canSeeMoney()} fallback={<p>Prices are only shown to the Grove team.</p>}>
        <section class="flex flex-col gap-2">
          <h2 class="text-xl font-semibold">Current version</h2>
          <Show when={summary()?.version} fallback={<p>No pricebook imported yet.</p>}>
            <p class="text-sm">
              Version {summary()!.version}, imported {new Date(summary()!.importedAt!).toLocaleString("da-DK")}
              {summary()!.note ? ` · ${summary()!.note}` : ""} · {summary()!.counts?.supplierPrices} supplier prices ·{" "}
              {summary()!.counts?.salesPrices} sales prices · {summary()!.counts?.services ?? 0} services · {summary()!.counts?.suppliers} suppliers
            </p>
            <table class="w-full text-sm">
              <thead>
                <tr>
                  <th class={th}>Document</th>
                  <th class={th}>Supplier</th>
                  <th class={th}>Document date</th>
                  <th class={th}>Date from</th>
                  <th class={th} />
                </tr>
              </thead>
              <tbody>
                <For each={summary()!.documents}>
                  {(d) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class={td}>{d.title ?? d.docId}</td>
                      <td class={td}>{supplierName(d.supplierId)}</td>
                      <td class={td}>{d.documentDate}</td>
                      <td class={`${td} opacity-70`}>{d.dateBasis}</td>
                      <td class={td}>
                        <Show when={d.outdated}>
                          <span class="text-amber-600 font-semibold">price may be outdated (over 3 years)</span>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={summary()!.warnings?.length}>
              <details class="text-sm">
                <summary>{summary()!.warnings!.length} warning(s) from the import</summary>
                <ul class="list-disc ml-5">
                  <For each={summary()!.warnings}>{(w) => <li>{w}</li>}</For>
                </ul>
              </details>
            </Show>
          </Show>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-xl font-semibold">Import a new version</h2>
          <form class="flex flex-wrap gap-2 items-end" onSubmit={importFiles}>
            <label class="flex flex-col text-xs">
              <span class="opacity-70">The four CSV files ({FILES.join(", ")}), plus settings.csv and services.csv</span>
              <input name="files" type="file" accept=".csv,text/csv" multiple class="text-sm" />
            </label>
            <label class="flex flex-col text-xs">
              <span class="opacity-70">Note (optional)</span>
              <input name="note" class={input} placeholder="e.g. new nursery price list added" maxLength={500} />
            </label>
            <button class="rounded-sm px-2 py-1 btn-default" disabled={busy()}>
              {busy() ? "Importing…" : "Import"}
            </button>
          </form>
          <p class="text-xs opacity-70">
            Each import becomes a new version; older versions are kept so earlier offers can be explained.
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-xl font-semibold">Search prices</h2>
          <form class="flex gap-2" onSubmit={search}>
            <input class={input} placeholder="Species, cultivar or rootstock" value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />
            <button class="rounded-sm px-2 py-1 btn-default">Search</button>
          </form>
          <Show when={results()}>
            <h3 class="font-semibold mt-2">Grove sales prices ({results()!.salesPrices.length})</h3>
            <table class="w-full text-sm">
              <thead>
                <tr>
                  <th class={th}>Species</th>
                  <th class={th}>Cultivar</th>
                  <th class={th}>Rootstock</th>
                  <th class={th}>Organic</th>
                  <th class={th}>Size</th>
                  <th class={th}>Excl. VAT</th>
                  <th class={th}>Incl. VAT</th>
                </tr>
              </thead>
              <tbody>
                <For each={results()!.salesPrices}>
                  {(p) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class={td}>{p.commonNameDa ?? p.latin} <span class="opacity-60 italic">{p.latin}</span></td>
                      <td class={td}>{p.cultivar}</td>
                      <td class={td}>{p.rootstock}</td>
                      <td class={td}>{p.organicStatus}</td>
                      <td class={td}>{p.heightMin && p.heightMax ? `${p.heightMin}–${p.heightMax} cm` : ""}</td>
                      <td class={td}>{kr(p.priceExclVat)}</td>
                      <td class={td}>{kr(p.priceInclVat)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <h3 class="font-semibold mt-2">Supplier prices ({results()!.supplierPrices.length})</h3>
            <table class="w-full text-sm">
              <thead>
                <tr>
                  <th class={th}>Species</th>
                  <th class={th}>Cultivar</th>
                  <th class={th}>Rootstock</th>
                  <th class={th}>Organic</th>
                  <th class={th}>Size</th>
                  <th class={th}>Price</th>
                  <th class={th}>Supplier</th>
                  <th class={th}>Date</th>
                </tr>
              </thead>
              <tbody>
                <For each={results()!.supplierPrices}>
                  {(p) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class={td}>{p.commonName ?? ""} <span class="opacity-60 italic">{p.latin}</span></td>
                      <td class={td}>{p.cultivar}</td>
                      <td class={td}>{p.rootstock}</td>
                      <td class={td}>{p.organicStatus}</td>
                      <td class={td}>{p.size}</td>
                      <td class={td}>
                        {p.price} {p.currency}
                        <Show when={p.vat}>
                          <span class="opacity-60"> ({p.vat})</span>
                        </Show>
                      </td>
                      <td class={td}>{supplierName(p.supplierId)}</td>
                      <td class={td}>
                        {p.documentDate}
                        <Show when={p.outdated}>
                          <span class="text-amber-600"> · may be outdated</span>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </section>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/pricebook")({ component: Pricebook });
