// Dashboard, A · Deals tab: open deals that need something today (next
// action overdue or missing, too long in a stage, closing soon), most urgent
// first. Grove team only.
import { Link } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { dkk, shortDay } from "~/grove/dealTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type Reason = { key: "overdue" | "no-action" | "slow" | "closing" | "close-passed"; text: string };
type Item = {
  _id: string;
  title: string;
  client?: { name?: string } | null;
  value?: number | null;
  nextAction?: { text?: string; date?: string | null };
  expectedClose?: string | null;
  funnel?: { _id: string; name: string } | null;
  stage: string;
  reasons: Reason[];
};

const TONE: Record<Reason["key"], string> = {
  overdue: "bg-red-700 text-white",
  "close-passed": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  slow: "bg-amber-500 text-black",
  closing: "bg-emerald-700 text-white",
  "no-action": "bg-zinc-200 text-zinc-800 dark:bg-slate-700 dark:text-slate-100",
};
const FILTERS: [string, string][] = [
  ["", "All"],
  ["overdue", "Overdue"],
  ["slow", "Too long in stage"],
  ["closing", "Closing soon"],
  ["no-action", "No next action"],
];

export function DealsAttention() {
  const [data] = createResource(() => apiFetch<{ total: number; open: number; deals: Item[] }>("/internal/deals/attention"));
  const d = () => (data.error ? undefined : data.latest);
  const [filter, setFilter] = createSignal("");
  const shown = () => (d()?.deals ?? []).filter((x) => !filter() || x.reasons.some((r) => r.key === filter() || (filter() === "closing" && r.key === "close-passed")));
  return (
    <section class="flex flex-col gap-2" aria-label="Deals that need attention">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-xl font-semibold mr-auto">
          Needs attention <span class="text-sm font-normal opacity-70">{d() ? `${d()!.total} of ${d()!.open} open deals` : ""}</span>
        </h2>
        <For each={FILTERS}>
          {([k, l]) => (
            <button class="rounded-sm px-2 py-0.5 text-xs border border-zinc-300 dark:border-slate-600" classList={{ "bg-zinc-800 text-white dark:bg-slate-200 dark:text-black": filter() === k }} onClick={() => setFilter(k)}>
              {l}
            </button>
          )}
        </For>
        <Link to="/grove/deals" class="text-sm underline">Board →</Link>
      </div>
      <Show when={data.error}><p class="text-sm text-red-600">{(data.error as Error)?.message}</p></Show>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs opacity-70">
              <th class="py-1 pr-3">Deal</th>
              <th class="py-1 pr-3">Funnel · stage</th>
              <th class="py-1 pr-3">Why</th>
              <th class="py-1 pr-3">Next action</th>
              <th class="py-1 pr-3 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            <For each={shown()} fallback={<tr><td class="py-2 text-sm opacity-70" colSpan={5}>{data.loading ? "Loading…" : "Nothing needs attention."}</td></tr>}>
              {(x) => (
                <tr class="border-t border-zinc-200 dark:border-slate-700 align-top">
                  <td class="py-1 pr-3">
                    <Link to="/grove/deals/$dealId" params={{ dealId: x._id }} class="underline font-semibold">{x.title}</Link>
                    <div class="text-xs opacity-70">{x.client?.name}</div>
                  </td>
                  <td class="py-1 pr-3 text-xs">{x.funnel?.name} · {x.stage}</td>
                  <td class="py-1 pr-3">
                    <div class="flex flex-wrap gap-1">
                      <For each={x.reasons}>{(r) => <span class={`rounded-sm px-1.5 py-0.5 text-xs ${TONE[r.key]}`}>{r.text}</span>}</For>
                    </div>
                  </td>
                  <td class="py-1 pr-3 text-xs">
                    {x.nextAction?.text}
                    {x.nextAction?.date ? ` (${shortDay(x.nextAction.date)})` : ""}
                    <Show when={x.expectedClose}><div class="opacity-70">Close {shortDay(x.expectedClose)}</div></Show>
                  </td>
                  <td class="py-1 pr-3 text-right whitespace-nowrap">{dkk(x.value)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}
