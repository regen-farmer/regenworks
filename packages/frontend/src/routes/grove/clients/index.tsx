// Clients: everyone Grove sells to, with how many deals each has.
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { dkk, type Client } from "~/grove/dealTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";

function Clients() {
  const [q, setQ] = createSignal("");
  const [typed, setTyped] = createSignal("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const [archived, setArchived] = createSignal(false);
  const [data] = createResource(
    () => (canSeeMoney() ? { q: q(), archived: archived() } : undefined),
    (k) => apiFetch<{ clients: Client[] }>(`/internal/clients?q=${encodeURIComponent(k.q)}${k.archived ? "&archived=1" : ""}`),
  );
  return (
    <div class="container mx-auto p-4 flex flex-col gap-3" data-testid="grove-clients">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Clients are only shown to the Grove team.</p>}>
        <div class="flex flex-wrap items-center gap-2">
          <Link to="/grove/deals" class="text-sm underline">← Deals</Link>
          <h1 class="text-2xl font-bold mr-auto">Clients</h1>
          <input class={input} placeholder="Search by name" value={typed()} onInput={(e) => {
            const v = e.currentTarget.value;
            setTyped(v);
            clearTimeout(timer);
            timer = setTimeout(() => setQ(v), 250);
          }} />
          <label class="text-sm flex items-center gap-1">
            <input type="checkbox" checked={archived()} onChange={(e) => setArchived(e.currentTarget.checked)} /> Archived
          </label>
        </div>
        <p class="text-xs opacity-70">New clients are made when you create a deal. A client keeps all its deals, so re-purchases show up here.</p>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left">
              <th class="py-1 pr-3">Client</th>
              <th class="py-1 pr-3">Contact</th>
              <th class="py-1 pr-3">Region</th>
              <th class="py-1 pr-3 text-right">Open deals</th>
              <th class="py-1 pr-3 text-right">Won deals</th>
              <th class="py-1 pr-3 text-right">Won value</th>
            </tr>
          </thead>
          <tbody>
            <For each={data.latest?.clients} fallback={<tr><td class="py-1">{data.loading ? "Loading…" : "No clients yet."}</td></tr>}>
              {(c) => (
                <tr class="border-t border-zinc-200 dark:border-slate-700">
                  <td class="py-1 pr-3"><Link to="/grove/clients/$clientId" params={{ clientId: c._id }} class="underline">{c.name}</Link></td>
                  <td class="py-1 pr-3">{[c.contactPerson, c.email, c.phone].filter(Boolean).join(" · ")}</td>
                  <td class="py-1 pr-3">{c.region}</td>
                  <td class="py-1 pr-3 text-right">{c.open || ""}</td>
                  <td class="py-1 pr-3 text-right">{c.won || ""}</td>
                  <td class="py-1 pr-3 text-right">{c.wonValue ? dkk(c.wonValue) : ""}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/clients/")({ component: Clients });
