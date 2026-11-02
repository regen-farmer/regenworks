// A · Clients & deals: one board per funnel. Deal cards are dragged between
// stages; dropping on Won offers optional next steps, dropping on Lost asks
// for a reason. Grove team only.
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { NewDealDialog, WonDialog } from "~/grove/DealDialogs.tsx";
import { dkk, overdue, shortDay, type Deal, type Funnel, type FunnelStage } from "~/grove/dealTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
const SHOW = 25;

function readFunnel(): string | null {
  try {
    return localStorage.getItem("grove-deals-funnel");
  } catch {
    return null;
  }
}

type Drop = { stage: string; before: string | null } | null;

function Board() {
  const navigate = useNavigate();
  const [funnels] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ funnels: Funnel[] }>("/internal/funnels"));
  const [funnelId, setFunnelId] = createSignal<string | null>(readFunnel());
  const [archived, setArchived] = createSignal(false);
  const funnel = createMemo(() => {
    const list = funnels()?.funnels ?? [];
    return list.find((f) => f._id === funnelId()) ?? list[0];
  });
  createEffect(() => {
    const f = funnel();
    if (!f) return;
    try {
      localStorage.setItem("grove-deals-funnel", f._id);
    } catch {
      // remembering the tab is only a convenience
    }
  });
  const [data, { mutate, refetch }] = createResource(
    () => (funnel() ? { id: funnel()!._id, archived: archived() } : undefined),
    (k) => apiFetch<{ funnel: Funnel; deals: Deal[] }>(`/internal/deals?funnel=${k.id}${k.archived ? "&archived=1" : ""}`),
  );
  const [search, setSearch] = createSignal("");
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [dragging, setDragging] = createSignal<string | null>(null);
  const [drop, setDrop] = createSignal<Drop>(null);
  const [lostAsk, setLostAsk] = createSignal<{ deal: Deal; stage: FunnelStage; before: string | null } | null>(null);
  const [lostReason, setLostReason] = createSignal("");
  const [wonDeal, setWonDeal] = createSignal<Deal | null>(null);
  const [adding, setAdding] = createSignal(false);

  const matches = (d: Deal) => {
    const q = search().trim().toLowerCase();
    return !q || d.title.toLowerCase().includes(q) || (d.client?.name ?? "").toLowerCase().includes(q);
  };
  // .latest keeps showing the board while it reloads (no flash, no scroll jump)
  const inStage = (key: string) => (data.latest?.deals ?? []).filter((d) => d.stage === key && matches(d));
  const total = (list: Deal[]) => list.reduce((n, d) => n + (d.value ?? 0), 0);

  async function move(deal: Deal, stage: FunnelStage, before: string | null, reason?: string) {
    const before0 = data.latest;
    // show the move straight away; the server's order replaces it
    if (before0) {
      const rest = before0.deals.filter((d) => d._id !== deal._id);
      const moved = { ...deal, stage: stage.key, status: stage.kind };
      const at = before ? rest.findIndex((d) => d._id === before) : -1;
      mutate({ ...before0, deals: at < 0 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)] });
    }
    try {
      const r = await apiFetch<{ deal: Deal; wonNow: boolean }>(`/internal/deals/${deal._id}/move`, {
        method: "POST",
        body: JSON.stringify({ stage: stage.key, before, lostReason: reason }),
      });
      refetch();
      if (r.wonNow) setWonDeal(r.deal);
    } catch (err) {
      if (before0) mutate(before0);
      refetch();
      showToast({ title: "Not moved", description: (err as Error).message, variant: "destructive" });
    }
  }

  function dropped(stage: FunnelStage) {
    const id = dragging();
    const target = drop();
    setDragging(null);
    setDrop(null);
    const deal = data.latest?.deals.find((d) => d._id === id);
    if (!deal || !target) return;
    if (target.before === deal._id) return;
    if (stage.kind === "lost" && deal.status !== "lost") {
      setLostReason("");
      setLostAsk({ deal, stage, before: target.before });
      return;
    }
    move(deal, stage, target.before);
  }

  const [importing, setImporting] = createSignal(false);
  async function importDashboard() {
    if (importing()) return;
    if (!window.confirm("Make a deal (and a client) for every Dashboard project that has no deal yet? Projects already imported are skipped.")) return;
    setImporting(true);
    try {
      const r = await apiFetch<{ created: number; clientsCreated: number }>("/internal/deals/import-dashboard", { method: "POST", body: "{}" });
      showToast({ title: `${r.created} deals made from Dashboard projects`, description: `${r.clientsCreated} new clients` });
      refetch();
    } catch (err) {
      showToast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div class="p-4 flex flex-col gap-3" data-testid="grove-deals">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Deals are only shown to the Grove team.</p>}>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-bold mr-4">Deals</h1>
          <div role="tablist" aria-label="Funnel" class="flex flex-wrap gap-1">
            <For each={funnels()?.funnels}>
              {(f) => (
                <button
                  role="tab"
                  aria-selected={f._id === funnel()?._id}
                  class="rounded-sm px-3 py-1 text-sm border border-zinc-300 dark:border-slate-600"
                  classList={{ "bg-zinc-800 text-white dark:bg-slate-200 dark:text-black": f._id === funnel()?._id }}
                  title={f.description}
                  onClick={() => setFunnelId(f._id)}
                >
                  {f.name}
                </button>
              )}
            </For>
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <input class={`${input} w-48`} placeholder="Search deal or client" value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
            <label class="text-sm flex items-center gap-1">
              <input type="checkbox" checked={archived()} onChange={(e) => setArchived(e.currentTarget.checked)} /> Archived
            </label>
            <Link to="/grove/clients" class="text-sm underline">Clients</Link>
            <button class="rounded-sm px-2 py-1 text-sm underline" disabled={importing()} onClick={importDashboard} title="Makes a deal for each Dashboard project that has none yet. Safe to run again.">
              Import from Dashboard
            </button>
            <button class="rounded-sm px-3 py-1 btn-default" onClick={() => setAdding(true)} disabled={!funnel() || archived()}>
              + New deal
            </button>
          </div>
        </div>

        <Show when={data.latest} fallback={<p>Loading…</p>}>
          <div class="overflow-x-auto pb-2">
            <div class="flex gap-3 items-start" style={{ "min-width": "100%" }}>
              <For each={funnel()?.stages}>
                {(stage) => {
                  const list = () => inStage(stage.key);
                  const shown = () => (expanded().has(stage.key) ? list() : list().slice(0, SHOW));
                  const tone = stage.kind === "won" ? "border-t-emerald-600" : stage.kind === "lost" ? "border-t-zinc-500" : "border-t-amber-600";
                  return (
                    <section
                      aria-label={stage.name}
                      class={`flex-1 min-w-56 max-w-80 rounded-md bg-zinc-100 dark:bg-slate-800 border-t-4 ${tone} flex flex-col`}
                      classList={{ "ring-2 ring-emerald-600": drop()?.stage === stage.key && !!dragging() }}
                      onDragOver={(e) => {
                        if (!dragging()) return;
                        e.preventDefault();
                        // cards stop this event, so here the pointer is below or between cards: drop at the end
                        if (drop()?.stage !== stage.key || drop()?.before !== null) setDrop({ stage: stage.key, before: null });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        dropped(stage);
                      }}
                    >
                      <header class="px-2 py-2">
                        <div class="flex justify-between items-baseline gap-2">
                          <h2 class="font-semibold text-sm">{stage.name}</h2>
                          <span class="text-xs opacity-70">{list().length}</span>
                        </div>
                        <div class="text-xs opacity-70">{dkk(total(list())) || "0 kr"}</div>
                      </header>
                      <div class="flex flex-col gap-2 px-2 pb-2 min-h-24">
                        <For each={shown()}>
                          {(d) => (
                            <>
                              <Show when={drop()?.stage === stage.key && drop()?.before === d._id && dragging() !== d._id}>
                                <div class="h-1 rounded bg-emerald-600" aria-hidden="true" />
                              </Show>
                              <Link
                                to="/grove/deals/$dealId"
                                params={{ dealId: d._id }}
                                draggable={!archived()}
                                class="block rounded-md bg-white dark:bg-slate-900 border border-zinc-300 dark:border-slate-600 p-2 text-sm hover:border-emerald-700"
                                classList={{ "opacity-40": dragging() === d._id, "cursor-grab": !archived() }}
                                onDragStart={(e) => {
                                  setDragging(d._id);
                                  e.dataTransfer?.setData("text/plain", d._id);
                                  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => {
                                  setDragging(null);
                                  setDrop(null);
                                }}
                                onDragOver={(e) => {
                                  if (!dragging()) return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  // next card in the full stage, also when the list is cut short
                                  const list0 = list();
                                  const i = list0.findIndex((x) => x._id === d._id);
                                  const before = e.clientY < r.top + r.height / 2 ? d._id : list0[i + 1]?._id ?? null;
                                  if (drop()?.stage !== stage.key || drop()?.before !== before) setDrop({ stage: stage.key, before });
                                }}
                              >
                                <div class="font-semibold leading-tight">{d.title}</div>
                                <div class="opacity-70">{d.client?.name}</div>
                                <div class="flex justify-between gap-2 mt-1 text-xs">
                                  <span>{dkk(d.value)}</span>
                                  <Show when={d.offers?.count}>
                                    <span class="opacity-70">{d.offers!.count} offer{d.offers!.count === 1 ? "" : "s"}</span>
                                  </Show>
                                </div>
                                <Show when={d.nextAction?.text || d.nextAction?.date}>
                                  <div class="text-xs mt-1" classList={{ "text-red-700 dark:text-red-400 font-semibold": overdue(d.nextAction?.date), "opacity-70": !overdue(d.nextAction?.date) }}>
                                    {d.nextAction?.date ? `${shortDay(d.nextAction.date)} · ` : ""}
                                    {d.nextAction?.text || "next action"}
                                  </div>
                                </Show>
                                <Show when={stage.kind === "open" && !d.nextAction?.date}>
                                  <div class="text-xs mt-1 text-amber-700 dark:text-amber-400">No next action</div>
                                </Show>
                              </Link>
                            </>
                          )}
                        </For>
                        <Show when={drop()?.stage === stage.key && drop()?.before === null && !!dragging()}>
                          <div class="h-1 rounded bg-emerald-600" aria-hidden="true" />
                        </Show>
                        <Show when={list().length > SHOW}>
                          <button
                            class="text-xs underline self-start"
                            onClick={() =>
                              setExpanded((s) => {
                                const n = new Set(s);
                                if (n.has(stage.key)) n.delete(stage.key);
                                else n.add(stage.key);
                                return n;
                              })
                            }
                          >
                            {expanded().has(stage.key) ? "Show fewer" : `Show all ${list().length}`}
                          </button>
                        </Show>
                      </div>
                    </section>
                  );
                }}
              </For>
            </div>
          </div>
          <p class="text-xs opacity-70">
            Drag a card to move it; drop it on a card to put it above that card. On a phone, open the deal and change its stage there.
          </p>
        </Show>

        <Dialog open={!!lostAsk()} onOpenChange={(o) => !o && setLostAsk(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark "{lostAsk()?.deal.title}" as lost</DialogTitle>
            </DialogHeader>
            <form
              class="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const a = lostAsk();
                setLostAsk(null);
                if (a) move(a.deal, a.stage, a.before, lostReason());
              }}
            >
              <label class="flex flex-col text-sm gap-1">
                Why was it lost? (optional, helps the win-rate numbers later)
                <input class={input} autofocus value={lostReason()} maxLength={500} placeholder="e.g. price, timing, chose another supplier" onInput={(e) => setLostReason(e.currentTarget.value)} />
              </label>
              <DialogFooter>
                <button type="button" class="rounded-sm p-2 btn-default" onClick={() => setLostAsk(null)}>Cancel</button>
                <button class="rounded-sm p-2 btn-primary">Mark as lost</button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <WonDialog deal={wonDeal()} funnels={funnels()?.funnels ?? []} onClose={() => setWonDeal(null)} onDone={(to) => navigate(to)} />

        <NewDealDialog
          open={adding()}
          funnel={funnel()}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            refetch();
          }}
        />
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/deals/")({ component: Board });
