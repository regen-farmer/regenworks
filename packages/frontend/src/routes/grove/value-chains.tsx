// Library → Value chains: draw a processing line (harvest → husk → dry → store →
// grade → crack → press …) from the equipment catalogue and see, week by
// week, where it gets stuck. Inputs are typed in by hand for now (hazel,
// walnut, chestnut, currants); later they come from the yield series of
// chosen plans. The catalogue is imported from the private grove-data repo
// (equipment/equipment.csv). The flow runs in the browser
// (@rw/modelling/valuechain/flow.ts). Grove team only.
import { runFlow, type Crop, type FlowEdge, type FlowLine, type FlowNode, type NodeResult } from "@rw/modelling/valuechain/flow.ts";
import { createFileRoute } from "@tanstack/solid-router";
import { batch, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type Item = {
  id: string;
  category: string;
  name: string;
  maker?: string;
  model?: string;
  crops: string[];
  inputForm?: string;
  outputForms: string[];
  mode: "rate" | "batch" | "area" | "store";
  capLow: number | null;
  capHigh: number | null;
  capUnit: string;
  batchHoursLow: number | null;
  batchHoursHigh: number | null;
  powerKw: number | null;
  priceLow: number | null;
  priceHigh: number | null;
  currency?: string;
  priceVat?: string;
  priceBasis?: string;
  observedDate?: string;
  sourceTitle: string;
  sourceUrl?: string;
  notes?: string;
};
type Catalogue = { version: number; importedAt?: string; fileName?: string; items: Item[] };
type SavedLine = FlowLine & { id: string; name: string; notes?: string; updatedAt?: string };
type Data = { catalogue: Catalogue | null; lines: SavedLine[] };

const CROPS: { crop: Crop; label: string; weeks: [number, number] }[] = [
  { crop: "hazel", label: "Hazel", weeks: [36, 40] },
  { crop: "walnut", label: "Walnut", weeks: [39, 42] },
  { crop: "chestnut", label: "Chestnut", weeks: [40, 43] },
  { crop: "blackcurrant", label: "Blackcurrant", weeks: [27, 29] },
  { crop: "redcurrant", label: "Redcurrant", weeks: [27, 29] },
];
const CATEGORY_EN: Record<string, string> = {
  harvest: "Harvest",
  "clean-husk": "Husk, clean, wash",
  dry: "Dry",
  store: "Store",
  grade: "Grade, sort",
  crack: "Crack",
  press: "Press",
  roast: "Roast",
  peel: "Peel",
  other: "Other",
};
const NODE_W = 168;
const NODE_H = 84;
const CANVAS_W = 1600;
const CANVAS_H = 760;

let seq = 0;
const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const mid = (a: number | null, b: number | null) => (a != null && b != null ? (a + b) / 2 : (a ?? b));
const kg = (x: number) => `${Math.round(x).toLocaleString("da-DK")} kg`;
const pct = (x: number | null) => (x == null ? "–" : Number.isFinite(x) ? `${Math.round(x * 100)} %` : "can't run");
/** ISO week for display: 53 and up are next year's weeks */
const wk = (w: number | null) => (w == null ? "–" : w > 52 ? `${w - 52} (next yr)` : `${w}`);
const priceText = (it: Item) => {
  if (it.priceLow == null && it.priceHigh == null) return "no price";
  const lo = it.priceLow ?? it.priceHigh!;
  const hi = it.priceHigh ?? it.priceLow!;
  const amount = lo === hi ? lo.toLocaleString("da-DK") : `${lo.toLocaleString("da-DK")}–${hi.toLocaleString("da-DK")}`;
  const basis = it.priceBasis === "rent-per-day" ? " per day (rent)" : it.priceBasis === "rent-per-month" ? " per month (rent)" : it.priceBasis === "used" ? " used" : "";
  const vat = it.priceVat === "incl" ? " incl. VAT" : it.priceVat === "excl" ? " excl. VAT" : "";
  return `${it.currency ?? ""} ${amount}${basis}${vat}`.trim();
};
const capText = (it: Item) => {
  if (it.capLow == null && it.capHigh == null) return "no capacity";
  const lo = it.capLow ?? it.capHigh!;
  const hi = it.capHigh ?? it.capLow!;
  const v = lo === hi ? `${hi}` : `${lo}–${hi}`;
  const batch = it.mode === "batch" && it.batchHoursHigh != null ? ` · ${it.batchHoursLow ?? it.batchHoursHigh}–${it.batchHoursHigh} h` : "";
  return `${v} ${it.capUnit}${batch}`;
};

/** A box for the flow from a catalogue item. Capacities the flow can't use directly (litres, trees/h, ha/h, m³) are left for the user to fill in. */
export function nodeFromItem(it: Item, x: number, y: number): FlowNode {
  const label = it.model ? `${it.name} (${it.model})` : it.name;
  if (it.mode === "store") {
    return { id: newId("n"), kind: "store", label, x, y, equipmentId: it.id, capacityKg: it.capUnit === "kg" ? mid(it.capLow, it.capHigh) : null, releaseKgPerWeek: null };
  }
  const hours = it.category === "dry" ? { hoursPerDay: 24, daysPerWeek: 7 } : it.category === "harvest" ? { hoursPerDay: 8, daysPerWeek: 6 } : { hoursPerDay: 8, daysPerWeek: 5 };
  if (it.mode === "batch") {
    return { id: newId("n"), kind: "machine", label, x, y, equipmentId: it.id, mode: "batch", kgPerBatch: it.capUnit === "kg/batch" ? mid(it.capLow, it.capHigh) : null, batchHours: mid(it.batchHoursLow, it.batchHoursHigh), ...hours, loss: 0, count: 1 };
  }
  return { id: newId("n"), kind: "machine", label, x, y, equipmentId: it.id, mode: "rate", kgPerHour: it.capUnit === "kg/h" ? mid(it.capLow, it.capHigh) : null, ...hours, loss: 0, count: 1 };
}

function inputNode(c: (typeof CROPS)[number], x: number, y: number): FlowNode {
  return { id: newId("n"), kind: "input", label: `${c.label} harvest`, x, y, crop: c.crop, kg: 10000, weekFrom: c.weeks[0], weekTo: c.weeks[1] };
}

/** A starting line to edit: hazel in husk → dryer → grader → grade A / grade B → cracker → kernels + shells. */
function exampleLine(items: Item[]): FlowLine {
  const find = (id: string) => items.find((i) => i.id === id);
  const machine = (id: string, label: string, x: number, y: number, fallback: Partial<Extract<FlowNode, { kind: "machine" }>>): FlowNode => {
    const it = find(id);
    return it ? nodeFromItem(it, x, y) : { id: newId("n"), kind: "machine", label, x, y, mode: "rate", kgPerHour: null, hoursPerDay: 8, daysPerWeek: 5, loss: 0, count: 1, ...fallback };
  };
  const input = inputNode(CROPS[0], 20, 260);
  if (input.kind === "input") input.kg = 30000;
  const dry = machine("dry-bin-5t", "Bin dryer 5 t", 210, 260, { mode: "batch", kgPerBatch: 5000, batchHours: null, hoursPerDay: 24, daysPerWeek: 7 });
  if (dry.kind === "machine") {
    dry.loss = 0.15;
    if (dry.batchHours == null) {
      dry.batchHours = 24;
      dry.label += " (24 h batch assumed)";
    }
  }
  const grade = machine("grade-facma-cal", "Nut calibrator", 400, 260, {});
  const a: FlowNode = { id: newId("n"), kind: "output", label: "Grade A in shell → direct sale", x: 590, y: 140 };
  const crack = machine("crack-feucht-p200", "Hazelnut cracker", 590, 380, {});
  const kernels: FlowNode = { id: newId("n"), kind: "output", label: "Kernels → wholesale", x: 780, y: 320 };
  const shells: FlowNode = { id: newId("n"), kind: "output", label: "Shells → fuel", x: 780, y: 460 };
  const e = (from: FlowNode, to: FlowNode, share?: number): FlowEdge => ({ id: newId("e"), from: from.id, to: to.id, share: share ?? null });
  return { nodes: [input, dry, grade, a, crack, kernels, shells], edges: [e(input, dry), e(dry, grade), e(grade, a, 0.7), e(grade, crack, 0.3), e(crack, kernels, 0.45), e(crack, shells, 0.55)] };
}

function ValueChains() {
  const [data, { refetch }] = createResource<Data>(() => (canSeeMoney() ? apiFetch<Data>("/internal/value-chains") : Promise.resolve({ catalogue: null, lines: [] })));
  const [line, setLine] = createStore<SavedLine>({ id: newId("l"), name: "New line", nodes: [], edges: [] });
  const [selected, setSelected] = createSignal<{ type: "node" | "edge"; id: string } | null>(null);
  const [connectFrom, setConnectFrom] = createSignal<string | null>(null);
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [cropFilter, setCropFilter] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [zoom, setZoom] = createSignal(0.75);

  const items = () => data()?.catalogue?.items ?? [];
  const itemById = createMemo(() => new Map(items().map((i) => [i.id, i])));
  const shownItems = createMemo(() => {
    const q = search().trim().toLowerCase();
    return items().filter((i) => (!cropFilter() || i.crops.includes(cropFilter())) && (!q || `${i.name} ${i.maker ?? ""} ${i.model ?? ""}`.toLowerCase().includes(q)));
  });
  const groups = createMemo(() => Object.keys(CATEGORY_EN).map((c) => ({ c, items: shownItems().filter((i) => i.category === c) })).filter((g) => g.items.length));

  const result = createMemo(() => runFlow({ nodes: line.nodes, edges: line.edges } as FlowLine));
  const resultById = createMemo(() => new Map(result().nodes.map((r) => [r.id, r])));
  const nodeById = (id: string) => line.nodes.find((n) => n.id === id);
  const selNode = () => (selected()?.type === "node" ? nodeById(selected()!.id) : undefined);
  const selEdge = () => (selected()?.type === "edge" ? line.edges.find((e) => e.id === selected()!.id) : undefined);
  const touch = () => setDirty(true);

  const freeSpot = () => {
    const n = line.nodes.length;
    return { x: 40 + (n % 6) * 220, y: 40 + Math.floor(n / 6) * 130 };
  };
  const addNode = (node: FlowNode) => {
    setLine("nodes", (ns) => [...ns, node]);
    setSelected({ type: "node", id: node.id });
    touch();
  };
  const removeSelected = () => {
    const s = selected();
    if (!s) return;
    batch(() => {
      if (s.type === "node") {
        setLine("nodes", (ns) => ns.filter((n) => n.id !== s.id));
        setLine("edges", (es) => es.filter((e) => e.from !== s.id && e.to !== s.id));
      } else setLine("edges", (es) => es.filter((e) => e.id !== s.id));
      setSelected(null);
    });
    touch();
  };
  const clickNode = (id: string) => {
    const from = connectFrom();
    if (from && from !== id) {
      if (!line.edges.some((e) => e.from === from && e.to === id)) {
        setLine("edges", (es) => [...es, { id: newId("e"), from, to: id, share: null }]);
        touch();
      }
      setConnectFrom(null);
      return;
    }
    setConnectFrom(null);
    setSelected({ type: "node", id });
  };
  const setNodeField = (id: string, field: string, value: unknown) => {
    const i = line.nodes.findIndex((n) => n.id === id);
    if (i < 0) return;
    setLine("nodes", i, produce((n: any) => void (n[field] = value)));
    touch();
  };
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

  // dragging boxes
  let drag: { id: string; dx: number; dy: number } | null = null;
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const i = line.nodes.findIndex((n) => n.id === drag!.id);
    if (i < 0) return;
    const z = zoom();
    setLine("nodes", i, { x: Math.round(Math.max(0, Math.min(CANVAS_W - NODE_W, e.clientX / z - drag.dx))), y: Math.round(Math.max(0, Math.min(CANVAS_H - NODE_H, e.clientY / z - drag.dy))) });
    touch();
  };
  const onUp = () => (drag = null);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  onCleanup(() => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  });
  const startDrag = (e: PointerEvent, n: FlowNode) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag = { id: n.id, dx: e.clientX / zoom() - n.x, dy: e.clientY / zoom() - n.y };
  };

  const loadLine = (id: string) => {
    if (dirty() && !confirm("Discard unsaved changes to this line?")) return;
    const l = data()?.lines.find((x) => x.id === id);
    if (!l) return;
    setLine(reconcile(structuredClone(l)));
    setSelected(null);
    setDirty(false);
  };
  const newLine = (example: boolean) => {
    if (dirty() && !confirm("Discard unsaved changes to this line?")) return;
    const l = example ? exampleLine(items()) : { nodes: [], edges: [] };
    setLine(reconcile({ id: newId("l"), name: example ? "Example hazel line" : "New line", ...l }));
    setSelected(null);
    setDirty(example);
  };
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/internal/value-chains/lines/${line.id}`, { method: "PUT", body: JSON.stringify({ line: { name: line.name, notes: line.notes, nodes: line.nodes, edges: line.edges } }) });
      setDirty(false);
      await refetch();
      showToast({ title: "Line saved", variant: "success" });
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!data()?.lines.some((l) => l.id === line.id)) return newLine(false);
    if (!confirm(`Delete the line "${line.name}"?`)) return;
    try {
      await apiFetch(`/internal/value-chains/lines/${line.id}`, { method: "DELETE" });
      setDirty(false);
      await refetch();
      newLine(false);
    } catch (err) {
      showToast({ title: "Not deleted", description: (err as Error).message, variant: "destructive" });
    }
  };
  const importCatalogue = async (file: File | undefined) => {
    if (!file) return;
    try {
      const csv = await file.text();
      const r = await apiFetch<{ catalogue: Catalogue }>(`/internal/value-chains/catalogue?fileName=${encodeURIComponent(file.name)}`, { method: "PUT", headers: { "Content-Type": "text/csv" }, body: csv });
      await refetch();
      showToast({ title: `Catalogue v${r.catalogue.version}: ${r.catalogue.items.length} items`, variant: "success" });
    } catch (err) {
      showToast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const edgePath = (e: FlowEdge) => {
    const a = nodeById(e.from);
    const b = nodeById(e.to);
    if (!a || !b) return null;
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const c = Math.max(40, Math.abs(x2 - x1) / 2);
    return { d: `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2 - 6} ${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  };
  const shareLabel = (e: FlowEdge) => {
    const outs = line.edges.filter((x) => x.from === e.from);
    if (outs.length < 2 && e.share == null) return "";
    return e.share == null ? "rest" : `${Math.round(e.share * 100)} %`;
  };
  const kindStyle = (n: FlowNode, r?: NodeResult) => {
    if (n.kind === "input" || n.kind === "output") return "bg-emerald-50 dark:bg-emerald-950 border-emerald-600 rounded-[2rem]";
    if (n.kind === "store") return "bg-sky-50 dark:bg-sky-950 border-sky-700 border-dashed rounded-md";
    if (r?.peakLoad != null && r.peakLoad > 1) return "bg-orange-50 dark:bg-orange-950 border-orange-700 rounded-md";
    return "bg-white dark:bg-slate-800 border-zinc-800 dark:border-zinc-300 rounded-md";
  };
  const nodeSub = (n: FlowNode, r?: NodeResult) => {
    if (!r) return "";
    if (n.kind === "input") return `${kg(n.kg)} · wk ${n.weekFrom}–${n.weekTo}`;
    if (n.kind === "output") return kg(r.inKg);
    if (n.kind === "store") return `max ${kg(r.maxWaitingKg)} in stock`;
    if (r.weeklyCapacityKg == null) return "no capacity data";
    return `peak ${pct(r.peakLoad)} · wk ${wk(r.peakWeek)}`;
  };
  const unknownCapacity = () => result().nodes.filter((r) => r.kind === "machine" && r.weeklyCapacityKg == null).length;
  const bottleneck = () => (result().bottleneck ? resultById().get(result().bottleneck!) : undefined);
  const selResult = () => (selNode() ? resultById().get(selNode()!.id) : undefined);
  const chartMax = createMemo(() => {
    const r = selResult();
    if (!r) return 1;
    return Math.max(1, ...r.weeks.map((w) => w.arrivedKg + w.waitingKg), r.weeklyCapacityKg ?? 0);
  });

  const th = "text-left font-semibold px-2 py-1 border-b border-zinc-300 dark:border-slate-600";
  const td = "px-2 py-1 border-b border-zinc-200 dark:border-slate-700 align-top";
  const input = "border border-zinc-300 dark:border-slate-600 rounded-sm px-2 py-1 w-full bg-white dark:bg-slate-800";

  return (
    <div class="p-4 flex flex-col gap-3" data-testid="grove-value-chains">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Value chains are only shown to the Grove team.</p>}>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-bold mr-auto">Value chains</h1>
          <label class="text-sm flex items-center gap-1">
            Line
            <select class={`${input} w-56`} value={data()?.lines.some((l) => l.id === line.id) ? line.id : ""} onChange={(e) => e.currentTarget.value && loadLine(e.currentTarget.value)}>
              <option value="">{dirty() ? "(unsaved)" : "Choose a saved line"}</option>
              <For each={data()?.lines ?? []}>{(l) => <option value={l.id} selected={l.id === line.id}>{l.name}</option>}</For>
            </select>
          </label>
          <button class="rounded-sm px-2 py-1 btn-default" onClick={() => newLine(false)}>New</button>
          <button class="rounded-sm px-2 py-1 btn-default" onClick={() => newLine(true)}>Example hazel line</button>
          <button class="rounded-sm px-2 py-1 btn-default" disabled={saving() || !line.nodes.length} onClick={save}>{saving() ? "Saving…" : dirty() ? "Save*" : "Save"}</button>
          <button class="rounded-sm px-2 py-1 btn-danger" onClick={remove}>Delete</button>
        </div>
        <p class="text-sm opacity-80">
          Draw a processing line from the equipment catalogue and see, week by week, how much each machine has to do and where nuts or berries pile up. Inputs are typed in by hand for now; later they come from the yield series of chosen plans. Example figures until real harvests are logged.
        </p>
        <Show when={data.error}><p class="text-sm text-red-600">{(data.error as Error)?.message}</p></Show>

        <div class="flex flex-wrap gap-3 items-start">
          {/* catalogue */}
          <aside class="w-72 shrink-0 flex flex-col gap-2 rounded-md border border-zinc-300 dark:border-slate-600 p-2" aria-label="Equipment catalogue">
            <div class="text-xs font-semibold uppercase tracking-wide opacity-80">Inputs (typed in)</div>
            <div class="flex flex-wrap gap-1">
              <For each={CROPS}>
                {(c) => (
                  <button class="rounded-full px-2 py-1 text-sm border border-emerald-600 bg-emerald-50 dark:bg-emerald-950" onClick={() => addNode(inputNode(c, freeSpot().x, freeSpot().y))}>
                    + {c.label}
                  </button>
                )}
              </For>
            </div>
            <div class="flex flex-wrap gap-1">
              <button class="rounded-sm px-2 py-1 text-sm btn-default" onClick={() => addNode({ id: newId("n"), kind: "machine", label: "Machine", ...freeSpot(), mode: "rate", kgPerHour: null, hoursPerDay: 8, daysPerWeek: 5, loss: 0, count: 1 })}>+ Machine</button>
              <button class="rounded-sm px-2 py-1 text-sm btn-default" onClick={() => addNode({ id: newId("n"), kind: "store", label: "Store", ...freeSpot(), capacityKg: null, releaseKgPerWeek: null })}>+ Store</button>
              <button class="rounded-sm px-2 py-1 text-sm btn-default" onClick={() => addNode({ id: newId("n"), kind: "output", label: "Product → channel", ...freeSpot() })}>+ Output</button>
            </div>
            <div class="text-xs font-semibold uppercase tracking-wide opacity-80 mt-2">
              Equipment catalogue
              <Show when={data()?.catalogue}>{(c) => <span class="font-normal normal-case"> · v{c().version}, {c().items.length} items</span>}</Show>
            </div>
            <div class="flex gap-1">
              <input class={input} type="search" placeholder="Search" aria-label="Search equipment" value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
              <select class={`${input} w-28`} aria-label="Crop" value={cropFilter()} onChange={(e) => setCropFilter(e.currentTarget.value)}>
                <option value="">All crops</option>
                <For each={CROPS}>{(c) => <option value={c.crop}>{c.label}</option>}</For>
              </select>
            </div>
            <div class="flex flex-col gap-2 max-h-[560px] overflow-y-auto pr-1">
              <Show when={items().length} fallback={<p class="text-sm opacity-80">No catalogue yet. Import <code>equipment/equipment.csv</code> from the grove-data repo below.</p>}>
                <For each={groups()}>
                  {(g) => (
                    <div class="flex flex-col gap-1">
                      <div class="text-xs font-semibold opacity-80">{CATEGORY_EN[g.c]}</div>
                      <For each={g.items}>
                        {(it) => (
                          <div class="rounded-sm border border-zinc-300 dark:border-slate-600 p-1.5 text-xs flex flex-col gap-0.5">
                            <div class="flex items-start gap-1">
                              <span class="font-semibold mr-auto">{it.name}{it.model ? ` · ${it.model}` : ""}</span>
                              <button class="rounded-sm px-1.5 btn-default" aria-label={`Add ${it.name} to the line`} onClick={() => { const s = freeSpot(); addNode(nodeFromItem(it, s.x, s.y)); }}>Add</button>
                            </div>
                            <span classList={{ "text-orange-700 dark:text-orange-400 font-semibold": it.capHigh == null && it.capLow == null }}>{capText(it)}</span>
                            <span classList={{ "text-orange-700 dark:text-orange-400 font-semibold": it.priceLow == null && it.priceHigh == null }}>{priceText(it)}</span>
                            <Show when={it.sourceUrl} fallback={<span class="opacity-70">{it.sourceTitle}</span>}>
                              <a class="underline opacity-80 truncate" href={it.sourceUrl} target="_blank" rel="noopener noreferrer">{it.sourceTitle}</a>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </Show>
            </div>
            <label class="text-xs mt-1 flex flex-col gap-1">
              Import catalogue (equipment.csv)
              <input type="file" accept=".csv,text/csv" onChange={(e) => importCatalogue(e.currentTarget.files?.[0])} />
            </label>
          </aside>

          {/* canvas */}
          <div class="flex-1 min-w-[320px] flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <input class={`${input} w-64`} aria-label="Line name" value={line.name} onInput={(e) => { setLine("name", e.currentTarget.value); touch(); }} />
              <Show when={connectFrom()}>
                <span class="font-semibold">Click the box the arrow goes to</span>
                <button class="rounded-sm px-2 py-0.5 btn-default" onClick={() => setConnectFrom(null)}>Cancel</button>
              </Show>
              <label class="flex items-center gap-1 ml-auto">
                Zoom
                <select class={`${input} w-20`} value={String(zoom())} onChange={(e) => setZoom(Number(e.currentTarget.value))}>
                  <For each={[0.5, 0.75, 1]}>{(z) => <option value={String(z)}>{z * 100} %</option>}</For>
                </select>
              </label>
            </div>
            <div class="flex flex-wrap gap-x-4 text-sm">
              <Show when={bottleneck()}>
                {(b) => (
                  <span classList={{ "text-orange-700 dark:text-orange-400 font-semibold": (b().peakLoad ?? 0) > 1 }}>
                    {(b().peakLoad ?? 0) > 1 ? "Bottleneck" : "Busiest machine"}: {b().label}, {pct(b().peakLoad)} of its capacity in week {wk(b().peakWeek)}
                  </span>
                )}
              </Show>
              <Show when={unknownCapacity()}>
                <span class="text-orange-700 dark:text-orange-400">{unknownCapacity()} machine{unknownCapacity() === 1 ? " has" : "s have"} no capacity data and can't be checked</span>
              </Show>
            </div>
            <For each={result().warnings}>{(w) => <p class="text-sm text-red-600">{w}</p>}</For>
            <div class="overflow-auto rounded-md border border-zinc-300 dark:border-slate-600 bg-zinc-50 dark:bg-slate-900" style={{ "max-height": "70vh" }}>
              <div style={{ width: `${CANVAS_W * zoom()}px`, height: `${CANVAS_H * zoom()}px` }}>
              <div class="relative" style={{ width: `${CANVAS_W}px`, height: `${CANVAS_H}px`, transform: `scale(${zoom()})`, "transform-origin": "0 0" }} onClick={(e) => e.target === e.currentTarget && (setSelected(null), setConnectFrom(null))}>
                <svg class="absolute inset-0" width={CANVAS_W} height={CANVAS_H} aria-hidden="true">
                  <defs>
                    <marker id="vc-arrow" orient="auto" markerWidth="8" markerHeight="8" refX="6" refY="4">
                      <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
                    </marker>
                  </defs>
                  <For each={line.edges}>
                    {(e) => {
                      const p = () => edgePath(e);
                      const on = () => selected()?.type === "edge" && selected()!.id === e.id;
                      return (
                        <Show when={p()}>
                          {(pp) => (
                            <g class={on() ? "text-sky-700" : "text-zinc-600 dark:text-zinc-300"} style={{ cursor: "pointer" }} onClick={() => setSelected({ type: "edge", id: e.id })}>
                              <path d={pp().d} stroke="transparent" stroke-width="14" fill="none" />
                              <path d={pp().d} stroke="currentColor" stroke-width={on() ? 3 : 2} fill="none" marker-end="url(#vc-arrow)" />
                              <Show when={shareLabel(e)}>
                                <text x={pp().mx} y={pp().my - 6} text-anchor="middle" font-size="12" fill="currentColor">{shareLabel(e)}</text>
                              </Show>
                            </g>
                          )}
                        </Show>
                      );
                    }}
                  </For>
                </svg>
                <For each={line.nodes}>
                  {(n) => {
                    const r = () => resultById().get(n.id);
                    const on = () => selected()?.type === "node" && selected()!.id === n.id;
                    return (
                      <div
                        class={`absolute border-2 px-2 py-1 text-xs flex flex-col justify-center select-none touch-none ${kindStyle(n, r())}`}
                        classList={{ "ring-2 ring-sky-600": on(), "ring-2 ring-emerald-500": connectFrom() === n.id }}
                        style={{ left: `${n.x}px`, top: `${n.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px`, cursor: "grab" }}
                        onPointerDown={(e) => startDrag(e, n)}
                        onClick={() => clickNode(n.id)}
                        role="group"
                        aria-label={n.label}
                      >
                        <span class="font-semibold leading-tight line-clamp-2">{n.label}</span>
                        <span class="opacity-80">{nodeSub(n, r())}</span>
                        <Show when={r()?.warnings.length}><span class="text-orange-700 dark:text-orange-400">⚠ {r()!.warnings.length}</span></Show>
                        <Show when={n.kind !== "output"}>
                          <button class="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border border-zinc-500 bg-white dark:bg-slate-700 text-xs" aria-label={`Draw an arrow from ${n.label}`} title="Draw an arrow from here" onClick={(e) => { e.stopPropagation(); setConnectFrom(n.id); }}>→</button>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
              </div>
            </div>
          </div>

          {/* properties */}
          <aside class="w-80 shrink-0 flex flex-col gap-2 rounded-md border border-zinc-300 dark:border-slate-600 p-3 text-sm" aria-label="Selected">
            <Show when={selNode()} fallback={
              <Show when={selEdge()} fallback={<p class="opacity-80">Select a box or an arrow. Add boxes from the left, drag them into place, and use → on a box to draw an arrow to the next step.</p>}>
                {(e) => (
                  <>
                    <div class="font-semibold">Arrow: {nodeById(e().from)?.label} → {nodeById(e().to)?.label}</div>
                    <label class="flex flex-col gap-1">
                      Share of what leaves {nodeById(e().from)?.label} (%)
                      <input class={input} type="number" min="0" max="100" step="1" value={e().share == null ? "" : Math.round(e().share! * 1000) / 10} placeholder="rest (split equally)" onChange={(ev) => { const i = line.edges.findIndex((x) => x.id === e().id); const v = numOrNull(ev.currentTarget.value); setLine("edges", i, "share", v == null ? null : Math.min(1, Math.max(0, v / 100))); touch(); }} />
                    </label>
                    <p class="text-xs opacity-80">E.g. a grader: 70 % grade A, 30 % grade B. Leave empty to share what is left equally.</p>
                    <button class="rounded-sm px-2 py-1 btn-danger self-start" onClick={removeSelected}>Delete arrow</button>
                  </>
                )}
              </Show>
            }>
              {(n) => {
                const it = () => (n() as any).equipmentId ? itemById().get((n() as any).equipmentId) : undefined;
                const r = () => resultById().get(n().id);
                return (
                  <>
                    <label class="flex flex-col gap-1">Name<input class={input} value={n().label} onInput={(e) => setNodeField(n().id, "label", e.currentTarget.value)} /></label>
                    <Show when={n().kind === "input" ? (n() as Extract<FlowNode, { kind: "input" }>) : null}>
                      {(inp) => (
                        <>
                          <label class="flex flex-col gap-1">Crop
                            <select class={input} value={inp().crop} onChange={(e) => setNodeField(n().id, "crop", e.currentTarget.value)}>
                              <For each={CROPS}>{(c) => <option value={c.crop}>{c.label}</option>}</For>
                            </select>
                          </label>
                          <label class="flex flex-col gap-1">Season harvest (kg)<input class={input} type="number" min="0" value={inp().kg} onChange={(e) => setNodeField(n().id, "kg", numOrNull(e.currentTarget.value) ?? 0)} /></label>
                          <div class="flex gap-2">
                            <label class="flex flex-col gap-1 flex-1">From week<input class={input} type="number" min="1" max="53" value={inp().weekFrom} onChange={(e) => setNodeField(n().id, "weekFrom", numOrNull(e.currentTarget.value) ?? 36)} /></label>
                            <label class="flex flex-col gap-1 flex-1">To week<input class={input} type="number" min="1" max="53" value={inp().weekTo} onChange={(e) => setNodeField(n().id, "weekTo", numOrNull(e.currentTarget.value) ?? 40)} /></label>
                          </div>
                          <p class="text-xs opacity-80">Typed in for now. The harvest is spread over the weeks, peaking in the middle.</p>
                        </>
                      )}
                    </Show>
                    <Show when={n().kind === "machine" ? (n() as Extract<FlowNode, { kind: "machine" }>) : null}>
                      {(m) => (
                        <>
                          <label class="flex flex-col gap-1">Works
                            <select class={input} value={m().mode} onChange={(e) => setNodeField(n().id, "mode", e.currentTarget.value)}>
                              <option value="rate">Continuously (kg per hour)</option>
                              <option value="batch">In batches</option>
                            </select>
                          </label>
                          <Show when={m().mode === "rate"} fallback={
                            <div class="flex gap-2">
                              <label class="flex flex-col gap-1 flex-1">kg per batch<input class={input} type="number" min="0" value={m().kgPerBatch ?? ""} placeholder="no data" onChange={(e) => setNodeField(n().id, "kgPerBatch", numOrNull(e.currentTarget.value))} /></label>
                              <label class="flex flex-col gap-1 flex-1">Hours per batch<input class={input} type="number" min="0" value={m().batchHours ?? ""} placeholder="no data" onChange={(e) => setNodeField(n().id, "batchHours", numOrNull(e.currentTarget.value))} /></label>
                            </div>
                          }>
                            <label class="flex flex-col gap-1">kg per hour<input class={input} type="number" min="0" value={m().kgPerHour ?? ""} placeholder="no data" onChange={(e) => setNodeField(n().id, "kgPerHour", numOrNull(e.currentTarget.value))} /></label>
                          </Show>
                          <div class="flex gap-2">
                            <label class="flex flex-col gap-1 flex-1">Hours/day<input class={input} type="number" min="0" max="24" value={m().hoursPerDay} onChange={(e) => setNodeField(n().id, "hoursPerDay", numOrNull(e.currentTarget.value) ?? 0)} /></label>
                            <label class="flex flex-col gap-1 flex-1">Days/week<input class={input} type="number" min="0" max="7" value={m().daysPerWeek} onChange={(e) => setNodeField(n().id, "daysPerWeek", numOrNull(e.currentTarget.value) ?? 0)} /></label>
                            <label class="flex flex-col gap-1 w-16">How many<input class={input} type="number" min="1" max="100" value={m().count ?? 1} onChange={(e) => setNodeField(n().id, "count", Math.max(1, Math.floor(numOrNull(e.currentTarget.value) ?? 1)))} /></label>
                          </div>
                          <label class="flex flex-col gap-1">Weight lost (%: moisture, husk, shell not counted as output)<input class={input} type="number" min="0" max="100" value={Math.round((m().loss ?? 0) * 1000) / 10} onChange={(e) => setNodeField(n().id, "loss", Math.min(1, Math.max(0, (numOrNull(e.currentTarget.value) ?? 0) / 100)))} /></label>
                        </>
                      )}
                    </Show>
                    <Show when={n().kind === "store" ? (n() as Extract<FlowNode, { kind: "store" }>) : null}>
                      {(s) => (
                        <>
                          <label class="flex flex-col gap-1">Holds (kg)<input class={input} type="number" min="0" value={s().capacityKg ?? ""} placeholder="no data" onChange={(e) => setNodeField(n().id, "capacityKg", numOrNull(e.currentTarget.value))} /></label>
                          <label class="flex flex-col gap-1">Sends on (kg per week)<input class={input} type="number" min="0" value={s().releaseKgPerWeek ?? ""} placeholder="everything at once" onChange={(e) => setNodeField(n().id, "releaseKgPerWeek", numOrNull(e.currentTarget.value))} /></label>
                          <p class="text-xs opacity-80">A cooling container for chestnuts or currants: set how much it holds and how fast it is sold or sent on. A 20 ft reefer is about 28–30 m³ inside; how many kg fit depends on the crates.</p>
                        </>
                      )}
                    </Show>
                    <Show when={it()}>
                      {(i) => (
                        <div class="rounded-sm bg-zinc-100 dark:bg-slate-800 p-2 text-xs flex flex-col gap-0.5">
                          <span class="font-semibold">From the catalogue</span>
                          <span>{capText(i())}</span>
                          <span>{priceText(i())}</span>
                          <Show when={i().notes}><span class="opacity-80">{i().notes}</span></Show>
                          <Show when={i().sourceUrl} fallback={<span class="opacity-80">Source: {i().sourceTitle}</span>}>
                            <a class="underline" href={i().sourceUrl} target="_blank" rel="noopener noreferrer">Source: {i().sourceTitle}</a>
                          </Show>
                        </div>
                      )}
                    </Show>
                    <Show when={r()}>
                      {(res) => (
                        <div class="flex flex-col gap-1 border-t border-zinc-200 dark:border-slate-700 pt-2">
                          <span>In: {kg(res().inKg)}{n().kind !== "output" ? ` · out: ${kg(res().outKg)}` : ""}</span>
                          <Show when={n().kind === "machine"}>
                            <span>Capacity: {res().weeklyCapacityKg == null ? "no data" : `${kg(res().weeklyCapacityKg!)} a week`}</span>
                            <span classList={{ "text-orange-700 dark:text-orange-400 font-semibold": (res().peakLoad ?? 0) > 1 }}>Peak: {pct(res().peakLoad)} in week {wk(res().peakWeek)} · average {pct(res().avgUse)}</span>
                            <span>Weeks over capacity: {res().weeksOverCapacity} · most waiting: {kg(res().maxWaitingKg)}</span>
                          </Show>
                          <Show when={n().kind === "store"}><span>Most in stock: {kg(res().maxWaitingKg)} · left at the end: {kg(res().leftKg)}</span></Show>
                          <For each={res().warnings}>{(w) => <span class="text-orange-700 dark:text-orange-400">{w}</span>}</For>
                          <Show when={n().kind !== "output" && n().kind !== "input"}>
                            <div class="flex items-end gap-0.5 h-24 mt-1 border-b border-zinc-400 relative" aria-label="Arrived and waiting per week">
                              <Show when={res().weeklyCapacityKg}>
                                <div class="absolute left-0 right-0 border-t-2 border-dashed border-orange-700" style={{ bottom: `${(res().weeklyCapacityKg! / chartMax()) * 100}%` }} title="capacity" />
                              </Show>
                              <For each={res().weeks.filter((w) => w.arrivedKg + w.waitingKg > 0.5)}>
                                {(w) => (
                                  <div class="flex-1 flex flex-col justify-end h-full" title={`week ${wk(w.week)}: ${kg(w.arrivedKg)} arrived, ${kg(w.waitingKg)} left waiting`}>
                                    <div class="bg-orange-300 dark:bg-orange-800" style={{ height: `${(w.waitingKg / chartMax()) * 100}%` }} />
                                    <div class="bg-emerald-600" style={{ height: `${(w.arrivedKg / chartMax()) * 100}%` }} />
                                  </div>
                                )}
                              </For>
                            </div>
                            <span class="text-xs opacity-80">Green: arrived that week · orange: left waiting · dashed: capacity</span>
                          </Show>
                        </div>
                      )}
                    </Show>
                    <button class="rounded-sm px-2 py-1 btn-danger self-start mt-1" onClick={removeSelected}>Delete box</button>
                  </>
                );
              }}
            </Show>
          </aside>
        </div>

        {/* results */}
        <Show when={result().nodes.length}>
          <div class="overflow-x-auto">
            <table class="w-full text-sm min-w-[900px]">
              <thead>
                <tr>
                  <th class={th}>Step</th>
                  <th class={th}>In</th>
                  <th class={th}>Out</th>
                  <th class={th}>Capacity a week</th>
                  <th class={th}>Peak</th>
                  <th class={th}>Average use</th>
                  <th class={th}>Weeks over</th>
                  <th class={th}>Most waiting / in stock</th>
                  <th class={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                <For each={result().nodes}>
                  {(r) => (
                    <tr classList={{ "bg-orange-50 dark:bg-orange-950": r.id === result().bottleneck && (r.peakLoad ?? 0) > 1 }}>
                      <td class={td}><button class="underline text-left" onClick={() => setSelected({ type: "node", id: r.id })}>{r.label}</button></td>
                      <td class={td}>{kg(r.inKg)}</td>
                      <td class={td}>{r.kind === "output" ? "–" : kg(r.outKg)}</td>
                      <td class={td}>{r.kind === "machine" ? (r.weeklyCapacityKg == null ? "no data" : kg(r.weeklyCapacityKg)) : "–"}</td>
                      <td class={td}>{r.kind === "machine" ? `${pct(r.peakLoad)}${r.peakWeek ? ` (wk ${wk(r.peakWeek)})` : ""}` : "–"}</td>
                      <td class={td}>{r.kind === "machine" ? pct(r.avgUse) : "–"}</td>
                      <td class={td}>{r.kind === "machine" || r.kind === "store" ? r.weeksOverCapacity : "–"}</td>
                      <td class={td}>{r.kind === "machine" || r.kind === "store" ? kg(r.maxWaitingKg) : "–"}</td>
                      <td class={td}>{r.warnings.join("; ")}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/value-chains")({ component: ValueChains });
