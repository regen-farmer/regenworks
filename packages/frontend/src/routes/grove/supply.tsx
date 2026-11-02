// Supply for forward orders: plants promised (signed) and likely (sent or
// draft offers ticked "Forward order") per species and season, against own
// grafting at the expected take rate plus supplier capacity. The plan is
// edited here and kept in the app's database. Grove team only.
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createResource, createSignal, For, Index, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type PlanRow = { latin: string; season: string; ownGrafts?: number; takePct?: number; suppliers?: { name: string; qty: number }[]; note?: string };
type Row = {
  latin: string;
  name?: string;
  season: string;
  signed: number;
  likely: number;
  ownGrafts: number;
  takePct: number | null;
  ownExpected: number;
  suppliers: { name: string; qty: number }[];
  available: number;
  afterSigned: number;
  afterLikely: number;
  planned: boolean;
  cultivars: { cultivar: string; qty: number }[];
  offers: { _id: string; title?: string; client?: string; status: string }[];
  note?: string;
};
type Data = { plan: PlanRow[]; rows: Row[] };
// the form keeps suppliers as text ("Supplier A: 200; Supplier B: 50") so typing isn't interrupted
type EditRow = { latin: string; season: string; ownGrafts: string; takePct: string; suppliers: string; note: string };

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
const th = "text-left font-semibold py-1 pr-3 whitespace-nowrap";
const td = "py-1 pr-3 align-top";
const n = (x: number) => x.toLocaleString("da-DK");
const STATUS_EN: Record<string, string> = { accepted: "signed", sent: "sent", draft: "draft" };

const toEdit = (p: PlanRow): EditRow => ({
  latin: p.latin,
  season: p.season,
  ownGrafts: p.ownGrafts === undefined ? "" : String(p.ownGrafts),
  takePct: p.takePct === undefined ? "" : String(p.takePct),
  suppliers: (p.suppliers ?? []).map((s) => `${s.name}: ${s.qty}`).join("; "),
  note: p.note ?? "",
});

function parseSuppliers(text: string, row: number): { name: string; qty: number }[] {
  return text
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*?)[:=]\s*([\d.\s]+)$/);
      if (!m || !m[1].trim()) throw new Error(`Row ${row}: write suppliers as "Name: quantity; Name: quantity"`);
      return { name: m[1].trim(), qty: Number(m[2].replace(/[.\s]/g, "")) };
    });
}

function Supply() {
  const [data, { refetch }] = createResource(() => (canSeeMoney() ? true : undefined), () => apiFetch<Data>("/internal/supply"));
  const d = () => (data.error ? undefined : data.latest);
  const [editing, setEditing] = createSignal(false);
  const [rows, setRows] = createSignal<EditRow[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [open, setOpen] = createSignal<Set<string>>(new Set());

  const startEdit = () => {
    // start from the saved plan, plus a row for each demand that has no plan yet
    const plan = (d()?.plan ?? []).map(toEdit);
    const missing = (d()?.rows ?? []).filter((r) => !r.planned).map((r) => toEdit({ latin: r.latin, season: r.season }));
    setRows([...plan, ...missing]);
    setEditing(true);
  };
  const setField = (i: number, k: keyof EditRow, v: string) => setRows(rows().map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function save(e: SubmitEvent) {
    e.preventDefault();
    let body: PlanRow[];
    try {
      body = rows()
        .filter((r) => r.latin.trim() || r.season.trim())
        .map((r, i) => ({
          latin: r.latin,
          season: r.season,
          ownGrafts: r.ownGrafts === "" ? undefined : Number(r.ownGrafts),
          takePct: r.takePct === "" ? undefined : Number(r.takePct),
          suppliers: parseSuppliers(r.suppliers, i + 1),
          note: r.note || undefined,
        }));
    } catch (err) {
      showToast({ title: "Check the plan", description: (err as Error).message, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/internal/supply/plan", { method: "PUT", body: JSON.stringify({ rows: body }) });
      setEditing(false);
      refetch();
    } catch (err) {
      showToast({ title: "Plan not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const key = (r: Row) => `${r.latin}|${r.season}`;
  const toggle = (k: string) =>
    setOpen((s) => {
      const x = new Set(s);
      if (x.has(k)) x.delete(k);
      else x.add(k);
      return x;
    });
  const short = () => (d()?.rows ?? []).filter((r) => r.afterSigned < 0).length;

  return (
    <div class="container mx-auto p-4 flex flex-col gap-3" data-testid="grove-supply">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Supply is only shown to the Grove team.</p>}>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-bold mr-auto">Supply for forward orders</h1>
          <button class="rounded-sm px-2 py-1 btn-default" disabled={!d()} onClick={() => (editing() ? setEditing(false) : startEdit())}>
            {editing() ? "Cancel" : "Edit supply plan"}
          </button>
        </div>
        <p class="text-sm opacity-80">
          Plants in offers ticked "Forward order", per species and delivery season: signed (accepted) and likely (sent or draft), against own grafting × expected take plus what suppliers can deliver.
        </p>
        <Show when={data.error}><p class="text-sm text-red-600">{(data.error as Error)?.message}</p></Show>
        <Show when={short()}>
          <p class="text-sm font-semibold text-red-700 dark:text-red-400">{short()} species can't cover what is already signed.</p>
        </Show>

        <Show when={editing()}>
          <form class="flex flex-col gap-2 rounded-md border border-zinc-300 dark:border-slate-600 p-3" onSubmit={save}>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr>
                    <th class={th}>Species (Latin)</th>
                    <th class={th}>Season</th>
                    <th class={th}>Own grafts</th>
                    <th class={th}>Take %</th>
                    <th class={th}>Suppliers (Name: qty; …)</th>
                    <th class={th}>Note</th>
                    <th class={th} />
                  </tr>
                </thead>
                <tbody>
                  <Index each={rows()}>
                    {(r, i) => (
                      <tr>
                        <td class={td}><input class={input} required maxLength={100} value={r().latin} placeholder="Malus domestica" onInput={(e) => setField(i, "latin", e.currentTarget.value)} /></td>
                        <td class={td}><input class={input} required maxLength={40} value={r().season} placeholder="Autumn 2027" onInput={(e) => setField(i, "season", e.currentTarget.value)} /></td>
                        <td class={td}><input class={input} type="number" min="0" value={r().ownGrafts} onInput={(e) => setField(i, "ownGrafts", e.currentTarget.value)} /></td>
                        <td class={td}><input class={input} type="number" min="0" max="100" value={r().takePct} placeholder="e.g. 80" onInput={(e) => setField(i, "takePct", e.currentTarget.value)} /></td>
                        <td class={td}><input class={input} maxLength={1000} value={r().suppliers} placeholder="Supplier A: 200; Supplier B: 50" onInput={(e) => setField(i, "suppliers", e.currentTarget.value)} /></td>
                        <td class={td}><input class={input} maxLength={500} value={r().note} onInput={(e) => setField(i, "note", e.currentTarget.value)} /></td>
                        <td class={td}>
                          <button type="button" class="text-xs underline" onClick={() => setRows(rows().filter((_, j) => j !== i))}>Remove</button>
                        </td>
                      </tr>
                    )}
                  </Index>
                </tbody>
              </table>
            </div>
            <div class="flex flex-wrap gap-2 items-center">
              <button type="button" class="text-sm underline" onClick={() => setRows([...rows(), { latin: "", season: "", ownGrafts: "", takePct: "", suppliers: "", note: "" }])}>
                Add a species
              </button>
              <button class="rounded-sm px-2 py-1 btn-default" disabled={busy()}>Save plan</button>
              <span class="text-xs opacity-70">Season must match the offers' delivery season (e.g. "Autumn 2027") to line up. Kept in the app's database, not in the code.</span>
            </div>
          </form>
        </Show>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr>
                <th class={th}>Species</th>
                <th class={th}>Season</th>
                <th class={th}>Signed</th>
                <th class={th}>Likely</th>
                <th class={th}>Own grafts × take</th>
                <th class={th}>Suppliers</th>
                <th class={th}>Available</th>
                <th class={th}>After signed</th>
                <th class={th}>After likely</th>
              </tr>
            </thead>
            <tbody>
              <For each={d()?.rows} fallback={<tr><td class={td} colSpan={9}>{data.loading ? "Loading…" : "No forward orders or supply plan yet. Tick \"Forward order\" on an offer to see it here."}</td></tr>}>
                {(r) => (
                  <>
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class={td}>
                        <button class="underline text-left" onClick={() => toggle(key(r))} aria-expanded={open().has(key(r))}>
                          <i>{r.latin}</i>
                        </button>
                        <Show when={r.name}><span class="opacity-70"> {r.name}</span></Show>
                        <Show when={!r.planned}><div class="text-xs text-amber-700">No supply plan</div></Show>
                      </td>
                      <td class={td}>{r.season}</td>
                      <td class={td}>{n(r.signed)}</td>
                      <td class={td}>{n(r.likely)}</td>
                      <td class={td}>{r.ownGrafts ? `${n(r.ownGrafts)} × ${r.takePct ?? 0} % = ${n(r.ownExpected)}` : "–"}</td>
                      <td class={td}>{r.suppliers.length ? r.suppliers.map((s) => `${s.name} ${n(s.qty)}`).join(", ") : "–"}</td>
                      <td class={`${td} font-semibold`}>{n(r.available)}</td>
                      <td class={td} classList={{ "text-red-700 dark:text-red-400 font-semibold": r.afterSigned < 0 }}>{n(r.afterSigned)}</td>
                      <td class={td} classList={{ "text-red-700 dark:text-red-400 font-semibold": r.afterLikely < 0, "text-amber-700": r.afterLikely >= 0 && r.afterSigned >= 0 && r.afterLikely < r.available * 0.1 }}>{n(r.afterLikely)}</td>
                    </tr>
                    <Show when={open().has(key(r))}>
                      <tr>
                        <td class={`${td} text-xs`} colSpan={9}>
                          <div class="flex flex-wrap gap-6 pl-3 pb-2">
                            <div>
                              <div class="font-semibold">Cultivars ordered</div>
                              <For each={r.cultivars} fallback={<span class="opacity-70">None</span>}>{(c) => <div>{c.cultivar}: {n(c.qty)}</div>}</For>
                            </div>
                            <div>
                              <div class="font-semibold">Offers</div>
                              <For each={r.offers} fallback={<span class="opacity-70">None</span>}>
                                {(o) => (
                                  <div>
                                    <Link to="/grove/offers/$offerId" params={{ offerId: String(o._id) }} class="underline">{o.title || "Offer"}</Link>
                                    <span class="opacity-70"> {o.client} · {STATUS_EN[o.status] ?? o.status}</span>
                                  </div>
                                )}
                              </For>
                            </div>
                            <Show when={r.note}><div><div class="font-semibold">Note</div>{r.note}</div></Show>
                          </div>
                        </td>
                      </tr>
                    </Show>
                  </>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/supply")({ component: Supply });
