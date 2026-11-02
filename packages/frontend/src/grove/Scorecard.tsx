// Dashboard scorecard: margin won on spring deals and deposits on forward
// orders, counted per won deal (A) from its accepted offers, against the
// targets set here; the pace needed and the open pipeline. Grove team only.
import { Link } from "@tanstack/solid-router";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { showToast } from "~/components/ui/toast";
import { stageText, type Stage } from "~/grove/projectTypes.ts";
import { dkk } from "~/grove/dealTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type Targets = { label?: string; from?: string; to?: string; margin?: number | null; deposits?: number | null };
type Part = { actual: number; target: number | null; gap: number | null; perWeek: number | null; inSentOffers: number; withoutCost?: number };
type Card = {
  targets: Targets;
  weeksLeft: number | null;
  margin: Part;
  deposits: Part;
  pipeline: { funnel: string; count: number; value: number }[];
  withoutOffer?: { count: number; value: number };
  won: {
    kind: "deal" | "offer";
    offerId?: string | null;
    offers: number;
    funnel?: string;
    withoutOffer: number;
    _id: string;
    title?: string;
    client?: string;
    acceptedOn?: string;
    forwardOrder: boolean;
    net: number;
    margin: number;
    marginPct: number | null;
    deposit: number;
    depositPct: number;
    project: { _id: string; name: string; stage: Stage; step?: string } | null;
  }[];
};

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
const kr = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${Math.round(n).toLocaleString("da-DK")} kr`);
const short = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "");

function Bar(props: { label: string; part: Part; note: string }) {
  const pct = () => (props.part.target ? Math.min(100, Math.round((props.part.actual / props.part.target) * 100)) : 0);
  return (
    <div class="flex flex-col gap-1 min-w-64 flex-1">
      <div class="flex justify-between text-sm">
        <span class="font-semibold">{props.label}</span>
        <span>
          {kr(props.part.actual)} <span class="opacity-70">/ {props.part.target === null ? "no target" : kr(props.part.target)}</span>
        </span>
      </div>
      <div class="h-3 rounded bg-zinc-200 dark:bg-slate-700" role="progressbar" aria-label={props.label} aria-valuenow={pct()} aria-valuemin={0} aria-valuemax={100}>
        <div class="h-3 rounded bg-emerald-700" style={{ width: `${pct()}%` }} />
      </div>
      <div class="text-xs opacity-80">
        {props.part.gap === null ? props.note : props.part.gap === 0 ? "Target reached" : `${kr(props.part.gap)} to go${props.part.perWeek !== null ? ` · ${kr(props.part.perWeek)} a week` : ""}`}
        {props.part.inSentOffers ? ` · ${kr(props.part.inSentOffers)} in sent offers` : ""}
      </div>
    </div>
  );
}

export function Scorecard() {
  const [data, { refetch }] = createResource(() => apiFetch<Card>("/internal/scorecard"));
  const card = () => (data.error ? undefined : data.latest);
  const [editing, setEditing] = createSignal(false);
  const [t, setT] = createSignal<Targets>({});
  const [busy, setBusy] = createSignal(false);
  createEffect(() => {
    const c = card();
    if (c && !editing()) setT(c.targets ?? {});
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/internal/scorecard/targets", { method: "PUT", body: JSON.stringify(t()) });
      setEditing(false);
      refetch();
    } catch (err) {
      showToast({ title: "Targets not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 flex flex-col gap-3" data-testid="grove-scorecard" aria-label="Scorecard">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-xl font-semibold mr-auto">
          Scorecard{card()?.targets.label ? ` · ${card()!.targets.label}` : ""}
          <Show when={card()?.targets.from || card()?.targets.to}>
            <span class="text-sm font-normal opacity-70"> ({card()!.targets.from ?? "…"} to {card()!.targets.to ?? "…"}{card()!.weeksLeft !== null ? `, ${card()!.weeksLeft} weeks left` : ""})</span>
          </Show>
        </h2>
        <button
          class="text-sm underline"
          disabled={!card()}
          onClick={() => {
            // always start from what is saved, so a save can't wipe values not shown yet
            if (!editing()) setT({ ...(card()?.targets ?? {}) });
            setEditing(!editing());
          }}
        >
          {editing() ? "Cancel" : "Set targets"}
        </button>
      </div>
      <Show when={data.error}><p class="text-sm text-red-600">{(data.error as Error)?.message}</p></Show>

      <Show when={editing()}>
        <form class="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs" onSubmit={save}>
          <label class="flex flex-col">Name<input class={input} maxLength={100} value={t().label ?? ""} placeholder="e.g. Spring 2027" onInput={(e) => setT({ ...t(), label: e.currentTarget.value })} /></label>
          <label class="flex flex-col">From<input type="date" class={input} value={t().from ?? ""} onInput={(e) => setT({ ...t(), from: e.currentTarget.value })} /></label>
          <label class="flex flex-col">To<input type="date" class={input} value={t().to ?? ""} onInput={(e) => setT({ ...t(), to: e.currentTarget.value })} /></label>
          <label class="flex flex-col">Margin target, spring deals (kr)<input type="number" min="0" step="1000" class={input} value={t().margin ?? ""} onInput={(e) => setT({ ...t(), margin: e.currentTarget.value === "" ? null : Number(e.currentTarget.value) })} /></label>
          <label class="flex flex-col">Deposit target, forward orders (kr)<input type="number" min="0" step="1000" class={input} value={t().deposits ?? ""} onInput={(e) => setT({ ...t(), deposits: e.currentTarget.value === "" ? null : Number(e.currentTarget.value) })} /></label>
          <div class="col-span-2 md:col-span-5 flex gap-2 items-center">
            <button class="rounded-sm px-2 py-1 btn-default" disabled={busy()}>Save targets</button>
            <span class="opacity-70">Kept in the app's database, not in the code.</span>
          </div>
        </form>
      </Show>

      <Show when={card()} fallback={<p class="text-sm">{data.loading ? "Loading…" : ""}</p>}>
        <div class="flex flex-wrap gap-6">
          <Bar label="Margin on spring deals" part={card()!.margin} note="Set a margin target" />
          <Bar label="Deposits on forward orders" part={card()!.deposits} note="Set a deposit target" />
          <div class="flex flex-col gap-1 min-w-48">
            <span class="font-semibold text-sm">Open deals</span>
            <For each={card()!.pipeline} fallback={<span class="text-xs opacity-70">None</span>}>
              {(f) => <span class="text-xs">{f.funnel}: {f.count} · {kr(f.value)}</span>}
            </For>
          </div>
        </div>
        <Show when={card()!.withoutOffer?.count}>
          <p class="text-xs text-amber-700">
            {card()!.withoutOffer!.count} won deal{card()!.withoutOffer!.count === 1 ? " has" : "s have"} no accepted offer ({dkk(card()!.withoutOffer!.value) || "no value"}), so {card()!.withoutOffer!.count === 1 ? "its" : "their"} margin isn't counted. Accept the offer, or link it to the deal.
          </p>
        </Show>
        <Show when={(card()!.margin.withoutCost ?? 0) > 0}>
          <p class="text-xs text-amber-700">{kr(card()!.margin.withoutCost)} of accepted sales has no known cost, so its margin isn't counted.</p>
        </Show>
        <p class="text-xs opacity-70">
          Counts deals won in the period, from their accepted offers: the internal-sheet margin for spring work, the deposit for offers ticked "Forward order". Accepted offers without a deal count by their acceptance date. Management is billed monthly and isn't counted here.
        </p>

        <details>
          <summary class="text-sm cursor-pointer">Won in the period ({card()!.won.length})</summary>
          <table class="w-full text-sm mt-1">
            <tbody>
              <For each={card()!.won}>
                {(w) => (
                  <tr class="border-t border-zinc-200 dark:border-slate-700">
                    <td class="py-1 pr-3">{short(w.acceptedOn)}</td>
                    <td class="py-1 pr-3">
                      <Show
                        when={w.kind === "deal"}
                        fallback={<Link to="/grove/offers/$offerId" params={{ offerId: w._id }} class="underline">{w.title || "Offer"}</Link>}
                      >
                        <Link to="/grove/deals/$dealId" params={{ dealId: w._id }} class="underline">{w.title || "Deal"}</Link>
                      </Show>{" "}
                      <span class="opacity-70">{[w.client, w.funnel, w.kind === "offer" ? "offer without a deal" : ""].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td class="py-1 pr-3">
                      <Show when={w.kind === "deal" && !w.offers} fallback={[w.margin ? `Margin ${kr(w.margin)}${w.marginPct !== null ? ` (${w.marginPct} %)` : ""}` : "", w.deposit ? `forward-order deposit ${kr(w.deposit)}` : ""].filter(Boolean).join(" · ") || "–"}>
                        <span class="text-amber-700">No accepted offer · deal value {kr(w.withoutOffer)}</span>
                      </Show>
                    </td>
                    <td class="py-1 pr-3">
                      <Show when={w.project}>
                        <Link to="/grove/projects/$projectId" params={{ projectId: w.project!._id }} class="underline">{w.project!.name}</Link>: {stageText(w.project!)}
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </details>

      </Show>
    </section>
  );
}
