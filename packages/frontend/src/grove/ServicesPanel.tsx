// Offer v2: the services calculator. Quantities come from the offer's design
// (trees, metres of row, field boundary, areas) and can be changed; each
// ticked service gets a line with its quantity worked out. Prices come from
// services.csv in the pricebook when the offer is saved.
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { showToast } from "~/components/ui/toast";
import { BASIS_EN, SECTION_EN, SECTIONS, serviceQty, type DesignQuantities, type OfferLine, type Service, type ServiceSection } from "~/grove/offerTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
const QTY_FIELDS: [keyof DesignQuantities, string, string][] = [
  ["trees", "Trees", "1"],
  ["rows", "Rows", "1"],
  ["rowM", "Tree rows (m)", "1"],
  ["perimeterM", "Field boundary (m)", "1"],
  ["fieldHa", "Field (ha)", "0.01"],
  ["treeHa", "Tree cover (ha)", "0.01"],
];

export function ServicesCalculator(props: {
  offerId: string;
  version?: number;
  /** service ids already on the offer */
  existing: string[];
  onAdd: (lines: OfferLine[]) => void;
  onClose: () => void;
}) {
  const [services] = createResource(
    () => props.version ?? "latest",
    (v) => apiFetch<{ version: number | null; services: Service[] }>(`/internal/pricebook/services${v === "latest" ? "" : `?version=${v}`}`),
  );
  const [fromDesign] = createResource(
    () => props.offerId,
    (id) => apiFetch<{ fromDesign: boolean; quantities: Partial<DesignQuantities> }>(`/internal/offers/${id}/quantities`),
  );
  const [q, setQ] = createSignal<Partial<DesignQuantities>>({});
  createEffect(() => {
    const d = fromDesign();
    if (d) setQ(d.quantities);
  });
  const [picked, setPicked] = createSignal<Record<string, number | null>>({});
  const bySection = createMemo(() => {
    const m = new Map<ServiceSection, Service[]>();
    for (const s of services()?.services ?? []) m.set(s.section, [...(m.get(s.section) ?? []), s]);
    return SECTIONS.filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const);
  });
  const qtyOf = (s: Service) => picked()[s.serviceId] ?? serviceQty(s, q());

  function add() {
    const list = services()?.services ?? [];
    const lines = Object.keys(picked())
      .map((id) => list.find((s) => s.serviceId === id))
      .filter((s): s is Service => !!s)
      .map(
        (s): OfferLine => ({
          kind: "service",
          serviceId: s.serviceId,
          section: s.section,
          nameDa: s.nameDa,
          unitDa: s.unitDa,
          qty: qtyOf(s),
          unitPrice: 0,
          priceSource: "none",
          discountPct: 0,
        }),
      );
    if (!lines.length) {
      showToast({ title: "Tick at least one service", variant: "destructive" });
      return;
    }
    props.onAdd(lines);
  }

  return (
    <div class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 flex flex-col gap-3" data-testid="services-calculator">
      <div class="flex items-center gap-2">
        <h3 class="font-semibold mr-auto">Add services</h3>
        <button class="text-sm underline" onClick={props.onClose}>Close</button>
      </div>
      <div>
        <div class="text-xs opacity-70 mb-1">
          {fromDesign.loading
            ? "Reading the design…"
            : fromDesign()?.fromDesign
              ? "Quantities from the offer's design. Change them if the work differs (e.g. fence only part of the boundary)."
              : "This offer has no design: type the quantities."}
        </div>
        <div class="grid grid-cols-2 md:grid-cols-6 gap-2">
          <For each={QTY_FIELDS}>
            {([k, label, step]) => (
              <label class="flex flex-col text-xs">
                {label}
                <input
                  type="number"
                  min="0"
                  step={step}
                  class={input}
                  value={q()[k] ?? ""}
                  onInput={(e) => setQ({ ...q(), [k]: e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value) })}
                />
              </label>
            )}
          </For>
        </div>
      </div>
      <Show when={!services.loading} fallback={<p class="text-sm">Loading services…</p>}>
        <Show when={(services()?.services ?? []).length} fallback={<p class="text-sm">No services in this pricebook version. Add services.csv to the pricebook and import it.</p>}>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <For each={bySection()}>
              {([section, list]) => (
                <fieldset class="flex flex-col gap-1">
                  <legend class="text-sm font-semibold">{SECTION_EN[section]}</legend>
                  <For each={list}>
                    {(s) => {
                      const on = () => s.serviceId in picked();
                      return (
                        <div class="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            id={`svc-${s.serviceId}`}
                            checked={on()}
                            onChange={(e) => {
                              const next = { ...picked() };
                              if (e.currentTarget.checked) next[s.serviceId] = null;
                              else delete next[s.serviceId];
                              setPicked(next);
                            }}
                          />
                          <label for={`svc-${s.serviceId}`} class="flex-1">
                            {s.nameEn || s.nameDa}
                            <span class="opacity-60 text-xs"> · {BASIS_EN[s.basis]}{s.qtyPerBasis !== 1 ? ` × ${s.qtyPerBasis}` : ""}</span>
                            <Show when={props.existing.includes(s.serviceId)}><span class="text-xs text-amber-700"> · already on the offer</span></Show>
                          </label>
                          <input
                            type="number"
                            min="0"
                            class={`${input} w-24`}
                            aria-label={`Quantity of ${s.nameEn || s.nameDa}`}
                            disabled={!on()}
                            value={on() ? qtyOf(s) : serviceQty(s, q())}
                            onInput={(e) => setPicked({ ...picked(), [s.serviceId]: e.currentTarget.value === "" ? null : Number(e.currentTarget.value) })}
                          />
                          <span class="w-10 text-xs">{s.unitDa}</span>
                          <span class="w-24 text-right text-xs" classList={{ "text-red-600": s.unitPrice === null }}>
                            {s.unitPrice === null ? "no price" : `${s.unitPrice.toLocaleString("da-DK")} kr/${s.unitDa}`}
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </fieldset>
              )}
            </For>
          </div>
          <div class="flex gap-2 items-center">
            <button class="rounded-sm px-2 py-1 btn-default" onClick={add}>Add ticked services</button>
            <span class="text-xs opacity-70">Quantities stay as added; they don't follow later design changes. Prices are set when you save.</span>
          </div>
        </Show>
      </Show>
    </div>
  );
}
