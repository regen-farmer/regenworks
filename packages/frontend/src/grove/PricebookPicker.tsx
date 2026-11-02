// Search the pricebook and pick a product for an offer line. The line is then
// priced from exactly that row (Grove team only; prices never leave /internal).
import { createSignal, For, Show } from "solid-js";
import { canSeeMoney } from "~/grove/access.ts";
import { PROPAGATION_EN, propagationFrom, type OfferLine } from "~/grove/offerTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type Results = { salesPrices: any[]; supplierPrices: any[] };
const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";

/** The plant fields a picked pricebook row fills in on an offer line. */
export function lineFromRow(kind: "sales" | "supplier", r: any): Partial<OfferLine> {
  const organic = r.organicStatus === "organic" ? true : r.organicStatus === "not-organic" ? false : null;
  const height = r.heightMin && r.heightMax ? `${r.heightMin}-${r.heightMax} cm` : undefined;
  return {
    latin: r.latin,
    nameDa: kind === "sales" ? r.commonNameDa : undefined,
    cultivar: r.cultivar ?? "",
    rootstock: r.rootstock ?? "",
    propagation: propagationFrom(r.propagation),
    size: kind === "sales" ? height : r.size ?? height,
    heightMin: r.heightMin,
    heightMax: r.heightMax,
    organic,
    organicRequested: organic,
    pricebookRef: { kind, id: kind === "sales" ? r.salesPriceId : r.priceId },
    priceSource: "none",
    unitPrice: 0,
  };
}

export function PricebookPicker(props: { onPick: (fields: Partial<OfferLine>) => void; onClose?: () => void }) {
  const [q, setQ] = createSignal("");
  const [res, setRes] = createSignal<Results>();
  const [busy, setBusy] = createSignal(false);
  async function search(e?: Event) {
    e?.preventDefault();
    if (!q().trim()) return;
    setBusy(true);
    try {
      setRes(await apiFetch<Results>(`/internal/pricebook/search?q=${encodeURIComponent(q().trim())}`));
    } finally {
      setBusy(false);
    }
  }
  const type = (r: any) => PROPAGATION_EN[propagationFrom(r.propagation) ?? ""] ?? r.propagation ?? "";
  const org = (s: string) => (s === "organic" ? "organic" : s === "not-organic" ? "not organic" : s);
  return (
    <Show when={canSeeMoney()}>
      <div class="flex flex-col gap-2 p-2 rounded-sm border border-zinc-300 dark:border-slate-600 text-sm" data-testid="pricebook-picker">
        <form class="flex gap-2" onSubmit={search}>
          <input class={`${input} flex-1`} placeholder="Search species, cultivar or rootstock (e.g. Corabel, Castanea)" value={q()} onInput={(e) => setQ(e.currentTarget.value)} autofocus />
          <button class="rounded-sm px-2 py-1 btn-default" disabled={busy()}>Search</button>
          <Show when={props.onClose}>
            <button type="button" class="underline" onClick={() => props.onClose?.()}>Close</button>
          </Show>
        </form>
        <Show when={res()}>
          <div class="max-h-72 overflow-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left">
                  <th class="pr-2">Source</th>
                  <th class="pr-2">Plant</th>
                  <th class="pr-2">Cultivar</th>
                  <th class="pr-2">Rootstock</th>
                  <th class="pr-2">Type</th>
                  <th class="pr-2">Size</th>
                  <th class="pr-2">Organic</th>
                  <th class="pr-2">Price</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <For each={res()!.salesPrices}>
                  {(r) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class="pr-2 font-semibold">Grove list</td>
                      <td class="pr-2">{r.commonNameDa} <span class="italic opacity-60">{r.latin}</span></td>
                      <td class="pr-2">{r.cultivar}</td>
                      <td class="pr-2">{r.rootstock}</td>
                      <td class="pr-2">{type(r)}</td>
                      <td class="pr-2">{r.heightMin && r.heightMax ? `${r.heightMin}-${r.heightMax} cm` : ""}</td>
                      <td class="pr-2">{org(r.organicStatus)}</td>
                      <td class="pr-2 whitespace-nowrap">{r.priceExclVat} kr</td>
                      <td><button class="underline" onClick={() => props.onPick(lineFromRow("sales", r))}>Use</button></td>
                    </tr>
                  )}
                </For>
                <For each={res()!.supplierPrices}>
                  {(r) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class="pr-2">{r.supplierId}{r.outdated ? " (old list)" : ""}</td>
                      <td class="pr-2">{r.commonName} <span class="italic opacity-60">{r.latin}</span></td>
                      <td class="pr-2">{r.cultivar}</td>
                      <td class="pr-2">{r.rootstock}</td>
                      <td class="pr-2">{type(r)}</td>
                      <td class="pr-2">{r.size}</td>
                      <td class="pr-2">{org(r.organicStatus)}</td>
                      <td class="pr-2 whitespace-nowrap">{r.price} {r.currency} + margin</td>
                      <td><button class="underline" onClick={() => props.onPick(lineFromRow("supplier", r))}>Use</button></td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={!res()!.salesPrices.length && !res()!.supplierPrices.length}>
              <p class="opacity-70">Nothing found in the pricebook.</p>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
