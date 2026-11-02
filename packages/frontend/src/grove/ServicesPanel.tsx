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
  /** the offer's EUR rate, so prices shown match what saving gives */
  eurDkk?: number | null;
  /** service ids already on the offer */
  existing: string[];
  onAdd: (lines: OfferLine[]) => void;
  onClose: () => void;
}) {
  const [servicesRes] = createResource(
    () => ({ v: props.version, rate: props.eurDkk }),
    (k) => {
      const qs = new URLSearchParams();
      if (k.v) qs.set("version", String(k.v));
      if (k.rate) qs.set("eurDkk", String(k.rate));
      return apiFetch<{ version: number | null; services: Service[] }>(`/internal/pricebook/services?${qs}`);
    },
  );
  const [designRes] = createResource(
    () => props.offerId,
    (id) => apiFetch<{ fromDesign: boolean; failed?: boolean; quantities: Partial<DesignQuantities> }>(`/internal/offers/${id}/quantities`),
  );
  // a failed request must not take the offer page (and unsaved edits) down
  const services = () => (servicesRes.error ? undefined : servicesRes());
  const fromDesign = () => (designRes.error ? undefined : designRes());
  const [q, setQ] = createSignal<Partial<DesignQuantities>>({});
  const [touched, setTouched] = createSignal(false);
  createEffect(() => {
    const d = fromDesign();
    // quantities typed before the design arrived are kept
    if (d && !touched()) setQ(d.quantities);
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
    const chosen = Object.keys(picked())
      .map((id) => list.find((s) => s.serviceId === id))
      .filter((s): s is Service => !!s);
    const empty = chosen.filter((s) => !(qtyOf(s) > 0));
    if (empty.length) {
      showToast({ title: "Quantity is 0", description: `Type a quantity for: ${empty.map((s) => s.nameEn || s.nameDa).join(", ")}`, variant: "destructive" });
      return;
    }
    const lines = chosen.map(
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
          {designRes.loading
            ? "Reading the design…"
            : fromDesign()?.fromDesign
              ? "Quantities from the offer's design. Change them if the work differs (e.g. fence only part of the boundary)."
              : fromDesign()?.failed || designRes.error
                ? "The design couldn't be read: type the quantities."
                : "This offer has no design: trees come from the plant lines; type the rest."}
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
                  onInput={(e) => {
                    setTouched(true);
                    setQ({ ...q(), [k]: e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value) });
                  }}
                />
              </label>
            )}
          </For>
        </div>
      </div>
      <Show when={!servicesRes.loading} fallback={<p class="text-sm">Loading services…</p>}>
        <Show when={servicesRes.error}><p class="text-sm text-red-600">Services could not be loaded: {(servicesRes.error as Error)?.message}</p></Show>
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
                            step="any"
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
