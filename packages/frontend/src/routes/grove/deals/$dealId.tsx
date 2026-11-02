// One deal: details, stage, offers, history and optional next steps.
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/solid-router";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { WonDialog } from "~/grove/DealDialogs.tsx";
import { day, dkk, noon, SOURCES, STATUS_LABEL, type Client, type Deal, type Funnel } from "~/grove/dealTypes.ts";
import { STATUS_EN } from "~/grove/offerTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
type Detail = {
  deal: Deal;
  client: Client | null;
  funnel: Funnel | null;
  project: { _id: string; name: string; stage: string; status: string } | null;
  offers: { _id: string; title?: string; dineroNumber?: string; status: keyof typeof STATUS_EN; validUntil?: string; net: number }[];
};

function DealPage() {
  const params = useParams({ from: "/grove/deals/$dealId" });
  const navigate = useNavigate();
  const [data, { refetch }] = createResource(() => (canSeeMoney() ? params().dealId : undefined), (id) => apiFetch<Detail>(`/internal/deals/${id}`));
  const [funnels] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ funnels: Funnel[] }>("/internal/funnels"));
  const [d, setD] = createStore<Deal>({} as Deal);
  const [dirty, setDirty] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [won, setWon] = createSignal<Deal | null>(null);
  const [lostReason, setLostReason] = createSignal("");

  // .latest: keep the page on screen while it reloads after a save or move
  const view = () => data.latest;
  createEffect(() => {
    const x = view();
    if (x) {
      try {
        localStorage.setItem("grove-deals-funnel", String(x.deal.funnel));
      } catch {
        // "← Deals" then opens this deal's funnel; only a convenience
      }
      setD(reconcile(structuredClone(x.deal)));
      setLostReason(x.deal.lostReason ?? "");
      setDirty(false);
    }
  });
  const edit = (...args: any[]) => {
    (setD as any)(...args);
    setDirty(true);
  };
  const stageName = (funnelId: string | undefined, key: string) => {
    const f = funnels()?.funnels.find((x) => x._id === funnelId) ?? view()?.funnel;
    return f?.stages.find((s) => s.key === key)?.name ?? key;
  };
  const funnelName = (id: string | undefined) => funnels()?.funnels.find((x) => x._id === id)?.name ?? "";

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await apiFetch(`/internal/deals/${params().dealId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: d.title,
          value: d.value ?? null,
          expectedClose: d.expectedClose ?? null,
          source: d.source ?? "",
          nextAction: { text: d.nextAction?.text ?? "", date: d.nextAction?.date ?? null },
          notes: d.notes ?? "",
          ...(d.status === "lost" ? { lostReason: lostReason() } : {}),
          ...extra,
        }),
      });
      showToast({ title: "Saved" });
      refetch();
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function move(funnel: string, stage: string): Promise<boolean> {
    if (dirty()) {
      showToast({ title: "Save your changes first", variant: "destructive" });
      return false;
    }
    const f = funnels()?.funnels.find((x) => x._id === funnel);
    const kind = f?.stages.find((s) => s.key === stage)?.kind;
    setBusy(true);
    try {
      const r = await apiFetch<{ deal: Deal; wonNow: boolean }>(`/internal/deals/${params().dealId}/move`, {
        method: "POST",
        body: JSON.stringify({ funnel, stage, lostReason: kind === "lost" ? lostReason() : undefined }),
      });
      refetch();
      if (r.wonNow) setWon(r.deal);
      return true;
    } catch (err) {
      showToast({ title: "Not moved", description: (err as Error).message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function newOffer() {
    const x = view();
    if (!x) return;
    try {
      const r = await apiFetch<{ offer: { _id: string } }>("/internal/offers", {
        method: "POST",
        body: JSON.stringify({
          title: x.deal.title,
          deal: x.deal._id,
          ...(x.deal.groveProject ? { groveProjectId: x.deal.groveProject } : {}),
          client: { name: x.client?.name, contactPerson: x.client?.contactPerson, email: x.client?.email, phone: x.client?.phone },
        }),
      });
      navigate({ to: "/grove/offers/$offerId", params: { offerId: r.offer._id } });
    } catch (err) {
      showToast({ title: "Could not create the offer", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <div class="container mx-auto p-4 flex flex-col gap-4" data-testid="grove-deal">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Deals are only shown to the Grove team.</p>}>
        <Show when={view()} fallback={<p>Loading…</p>}>
          <div class="flex flex-wrap items-center gap-2">
            <Link to="/grove/deals" class="text-sm underline">← Deals</Link>
            <h1 class="text-2xl font-bold mr-auto">{d.title}</h1>
            <span class="text-sm rounded-sm px-2 py-0.5 bg-zinc-200 dark:bg-slate-700">{STATUS_LABEL[d.status] ?? d.status}</span>
            <button class="rounded-sm px-2 py-1 btn-default" disabled={busy() || !dirty()} onClick={() => save()}>
              {dirty() ? "Save" : "Saved"}
            </button>
            <button class="rounded-sm px-2 py-1 text-sm underline" disabled={busy() || dirty()} title={dirty() ? "Save your changes first" : ""} onClick={() => save({ archived: !d.archived })}>
              {d.archived ? "Restore" : "Archive"}
            </button>
          </div>

          <section class="flex flex-wrap items-end gap-3 rounded-md border border-zinc-300 dark:border-slate-600 p-3">
            <label class="flex flex-col text-xs">
              Funnel
              <select class={input} value={d.funnel} disabled={busy() || d.archived} onChange={async (e) => {
                const el = e.currentTarget;
                const f = funnels()?.funnels.find((x) => x._id === el.value);
                // keep a won deal won (and a lost one lost) when it moves to another funnel
                const target = f?.stages.find((s) => s.kind === d.status) ?? f?.stages.find((s) => s.kind === "open");
                const ok = f && target && window.confirm(`Move this deal to "${f.name}" · ${target.name}?`) ? await move(f._id, target.key) : false;
                if (!ok) el.value = String(d.funnel);
              }}>
                <For each={funnels()?.funnels}>{(f) => <option value={f._id}>{f.name}</option>}</For>
              </select>
            </label>
            <div class="flex flex-col text-xs">
              Stage
              <div class="flex flex-wrap gap-1 mt-0.5" role="group" aria-label="Stage">
                <For each={view()!.funnel?.stages}>
                  {(s) => (
                    <button
                      class="rounded-sm px-2 py-1 text-sm border border-zinc-300 dark:border-slate-600"
                      classList={{ "bg-emerald-700 text-white border-emerald-700": s.key === d.stage }}
                      aria-pressed={s.key === d.stage}
                      disabled={busy() || d.archived || s.key === d.stage}
                      onClick={() => move(String(d.funnel), s.key)}
                    >
                      {s.name}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <Show when={d.status === "lost" || view()!.funnel?.stages.some((s) => s.kind === "lost")}>
              <label class="flex flex-col text-xs flex-1 min-w-48">
                Lost reason {d.status === "lost" ? "" : "(used if you mark it lost)"}
                <input class={input} value={lostReason()} maxLength={500} onInput={(e) => { setLostReason(e.currentTarget.value); if (d.status === "lost") setDirty(true); }} />
              </label>
            </Show>
          </section>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <fieldset disabled={busy()} class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label class="flex flex-col text-xs md:col-span-2">Title<input class={input} maxLength={200} value={d.title ?? ""} onInput={(e) => edit("title", e.currentTarget.value)} /></label>
              <label class="flex flex-col text-xs">Value (kr, excl. VAT)<input class={input} type="number" min="0" step="1000" value={d.value ?? ""} onInput={(e) => edit("value", e.currentTarget.value === "" ? null : Number(e.currentTarget.value))} /></label>
              <label class="flex flex-col text-xs">Expected close<input class={input} type="date" value={day(d.expectedClose)} onInput={(e) => edit("expectedClose", noon(e.currentTarget.value))} /></label>
              <label class="flex flex-col text-xs">Next action<input class={input} maxLength={500} value={d.nextAction?.text ?? ""} onInput={(e) => edit("nextAction", (n: any) => ({ ...n, text: e.currentTarget.value }))} /></label>
              <label class="flex flex-col text-xs">Next action date<input class={input} type="date" value={day(d.nextAction?.date)} onInput={(e) => edit("nextAction", (n: any) => ({ ...n, date: noon(e.currentTarget.value) }))} /></label>
              <label class="flex flex-col text-xs">
                Source
                <select class={input} value={d.source ?? ""} onChange={(e) => edit("source", e.currentTarget.value)}>
                  <option value="">–</option>
                  <Show when={d.source && !SOURCES.includes(d.source)}><option value={d.source}>{d.source}</option></Show>
                  <For each={SOURCES}>{(s) => <option value={s}>{s}</option>}</For>
                </select>
              </label>
              <div class="flex flex-col text-xs">
                Farm
                <span class="text-sm mt-1">
                  <Show when={d.farm?._id} fallback="–">
                    <Link to="/parcels/$parcelId" params={{ parcelId: d.farm!._id }} class="underline">{d.farm?.name ?? "Open farm"}</Link>
                  </Show>
                </span>
              </div>
              <label class="flex flex-col text-xs md:col-span-2">Notes<textarea class={input} rows={4} maxLength={5000} value={d.notes ?? ""} onInput={(e) => edit("notes", e.currentTarget.value)} /></label>
            </fieldset>

            <div class="flex flex-col gap-3">
              <section class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 text-sm">
                <div class="text-xs opacity-70">Client</div>
                <Show when={view()!.client} fallback="–">
                  <Link to="/grove/clients/$clientId" params={{ clientId: view()!.client!._id }} class="font-semibold underline">{view()!.client!.name}</Link>
                  <div class="opacity-80">{[view()!.client!.contactPerson, view()!.client!.email, view()!.client!.phone].filter(Boolean).join(" · ")}</div>
                </Show>
              </section>
              <section class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 text-sm flex flex-col gap-2">
                <div class="text-xs opacity-70">Next steps (optional)</div>
                <Show
                  when={view()!.project}
                  fallback={<button class="rounded-sm p-1 btn-default self-start" disabled={d.status === "lost" || d.archived} onClick={() => setWon(view()!.deal)}>Create project or follow-up deal…</button>}
                >
                  <span>Project: <Link to="/grove/projects/$projectId" params={{ projectId: view()!.project!._id }} class="underline">{view()!.project!.name}</Link></span>
                  <button class="rounded-sm p-1 btn-default self-start" disabled={d.status === "lost" || d.archived} onClick={() => setWon(view()!.deal)}>Follow-up deal…</button>
                </Show>
              </section>
            </div>
          </div>

          <section class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-semibold mr-auto">Offers</h2>
              <button class="rounded-sm px-2 py-1 btn-default text-sm" onClick={newOffer}>New offer (plant list)</button>
            </div>
            <p class="text-xs opacity-70">To offer a design, use "Make offer" on the scenario, then choose this deal on the offer page. Accepting an offer linked to an open deal moves the deal to Won.</p>
            <table class="w-full text-sm">
              <tbody>
                <For each={view()!.offers} fallback={<tr><td class="py-1">No offers yet.</td></tr>}>
                  {(o) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class="py-1 pr-3"><Link to="/grove/offers/$offerId" params={{ offerId: o._id }} class="underline">{o.title || "Offer"}{o.dineroNumber ? ` (${o.dineroNumber})` : ""}</Link></td>
                      <td class="py-1 pr-3">{STATUS_EN[o.status]}</td>
                      <td class="py-1 pr-3">{o.validUntil ? new Date(o.validUntil).toLocaleDateString("da-DK") : ""}</td>
                      <td class="py-1 pr-3 text-right">{dkk(o.net)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </section>

          <section class="flex flex-col gap-1">
            <h2 class="text-xl font-semibold">History</h2>
            <ul class="text-sm">
              <For each={[...(view()!.deal.history ?? [])].reverse()}>
                {(h) => (
                  <li class="border-t border-zinc-200 dark:border-slate-700 py-1">
                    {new Date(h.at).toLocaleString("da-DK", { dateStyle: "medium", timeStyle: "short" })} · {h.funnel && String(h.funnel) !== String(d.funnel) ? `${funnelName(h.funnel)} · ` : ""}
                    {stageName(h.funnel, h.stage)}
                    {h.note ? <span class="opacity-70"> · {h.note}</span> : ""}
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
        <WonDialog deal={won()} funnels={funnels()?.funnels ?? []} onClose={() => { setWon(null); refetch(); }} onDone={(to) => navigate(to)} />
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/deals/$dealId")({ component: DealPage });
