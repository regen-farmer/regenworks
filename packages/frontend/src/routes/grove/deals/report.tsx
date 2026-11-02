// Deal report: deals, win rate and won value per source (all funnels), and
// per funnel how deals move through the stages and how long they stay.
// Feeds the channel and ØRD referral KPIs. Grove team only.
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { canSeeMoney } from "~/grove/access.ts";
import { dkk } from "~/grove/dealTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type Report = {
  deals: number;
  truncated?: boolean;
  bySource: { source: string; deals: number; open: number; won: number; lost: number; value: number; wonValue: number; winRate: number | null }[];
  byFunnel: {
    _id: string;
    name: string;
    deals: number;
    won: number;
    lost: number;
    winRate: number | null;
    stages: { key: string; name: string; kind: string; targetDays: number | null; entered: number; movedOn: number; now: number; avgDays: number | null }[];
  }[];
};

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";
const th = "text-left font-semibold py-1 pr-3 whitespace-nowrap text-xs";
const td = "py-1 pr-3";
const pct = (n: number | null) => (n === null ? "–" : `${n.toLocaleString("da-DK")} %`);

function DealReport() {
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [data] = createResource(
    () => (canSeeMoney() ? { from: from(), to: to() } : undefined),
    (k) => apiFetch<Report>(`/internal/deals/report?${k.from ? `from=${k.from}&` : ""}${k.to ? `to=${k.to}` : ""}`),
  );
  const r = () => (data.error ? undefined : data.latest);
  return (
    <div class="container mx-auto p-4 flex flex-col gap-4" data-testid="grove-deal-report">
      <Show when={canSeeMoney()} fallback={<p>Only for the Grove team.</p>}>
        <div class="flex flex-wrap items-end gap-2">
          <h1 class="text-2xl font-bold mr-auto">Deal report</h1>
          <label class="flex flex-col text-xs">Deals made from<input type="date" class={input} value={from()} onInput={(e) => setFrom(e.currentTarget.value)} /></label>
          <label class="flex flex-col text-xs">to<input type="date" class={input} value={to()} onInput={(e) => setTo(e.currentTarget.value)} /></label>
          <Link to="/grove/deals" class="text-sm underline">← Deals</Link>
          <Link to="/grove/funnels" class="text-sm underline">Funnels & sources</Link>
        </div>
        <Show when={data.error}><p class="text-sm text-red-600">{(data.error as Error)?.message}</p></Show>
        <Show when={r()} fallback={<p class="text-sm">Loading…</p>}>
          <Show when={r()!.truncated}><p class="text-sm text-amber-700">Only the newest 20,000 deals are counted.</p></Show>
          <p class="text-xs opacity-70">
            {r()!.deals} deals, archived ones included. Win rate = won ÷ (won + lost); open deals don't count yet. Days per stage: how long deals stayed before the next move (deals still there count with their days so far). Deals imported from the Dashboard count from the import date.
          </p>
          <section class="flex flex-col gap-1">
            <h2 class="text-xl font-semibold">By source</h2>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr>
                    <th class={th}>Source</th>
                    <th class={th}>Deals</th>
                    <th class={th}>Open</th>
                    <th class={th}>Won</th>
                    <th class={th}>Lost</th>
                    <th class={th}>Win rate</th>
                    <th class={th}>Won value</th>
                    <th class={th}>Value, all deals</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={r()!.bySource} fallback={<tr><td class={td}>No deals.</td></tr>}>
                    {(s) => (
                      <tr class="border-t border-zinc-200 dark:border-slate-700">
                        <td class={td}>{s.source}</td>
                        <td class={td}>{s.deals}</td>
                        <td class={td}>{s.open}</td>
                        <td class={td}>{s.won}</td>
                        <td class={td}>{s.lost}</td>
                        <td class={td}>{pct(s.winRate)}</td>
                        <td class={td}>{dkk(s.wonValue) || "0 kr"}</td>
                        <td class={td}>{dkk(s.value) || "0 kr"}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
          <For each={r()!.byFunnel.filter((f) => f.deals)}>
            {(f) => (
              <section class="flex flex-col gap-1">
                <h2 class="text-lg font-semibold">
                  {f.name} <span class="text-sm font-normal opacity-70">{f.deals} deals · won {f.won} · lost {f.lost} · win rate {pct(f.winRate)}</span>
                </h2>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr>
                        <th class={th}>Stage</th>
                        <th class={th}>Came in</th>
                        <th class={th}>Moved on</th>
                        <th class={th}>There now</th>
                        <th class={th}>Avg days</th>
                        <th class={th}>Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={f.stages}>
                        {(s) => (
                          <tr class="border-t border-zinc-200 dark:border-slate-700">
                            <td class={td}>{s.name}</td>
                            <td class={td}>{s.entered}</td>
                            <td class={td}>{s.kind === "open" ? s.movedOn : ""}</td>
                            <td class={td}>{s.now}</td>
                            <td class={td} classList={{ "text-red-700 dark:text-red-400 font-semibold": !!s.targetDays && (s.avgDays ?? 0) > s.targetDays }}>{s.avgDays ?? ""}</td>
                            <td class={td}>{s.targetDays ? `${s.targetDays} d` : ""}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/deals/report")({ component: DealReport });
