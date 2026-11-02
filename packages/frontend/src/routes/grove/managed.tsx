// C · Management & production: where Grove produces and looks after things.
// Nursery & supply (own grafting and seedlings, stock grown for us by other
// nurseries, against what A has sold) is built; the managed-farm pages (care
// calendar, tasks, survival, thinning, work log, monitoring) come later.
import { createFileRoute, Link } from "@tanstack/solid-router";
import { canSeeMoney } from "~/grove/access.ts";
import { Show } from "solid-js";

function Managed() {
  return (
    <div class="container mx-auto p-4 flex flex-col gap-4 max-w-3xl" data-testid="grove-managed">
      <h1 class="text-2xl font-bold">C · Management & production</h1>
      <p>A sells, B delivers the planting, C produces and looks after it.</p>
      <Show when={canSeeMoney()}>
        <section class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 flex flex-col gap-1">
          <h2 class="text-lg font-semibold">
            <Link to="/grove/supply" class="underline">Nursery & supply</Link>
          </h2>
          <p class="text-sm">Own production (grafts and seedlings) and stock from other nurseries, per product and season, against the forward orders sold in A.</p>
        </section>
      </Show>
      <section class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 flex flex-col gap-1">
        <h2 class="text-lg font-semibold">Managed farms <span class="text-xs font-normal uppercase opacity-60">soon</span></h2>
        <p class="text-sm">
          Running the farms Grove manages: care calendar, tasks, survival checks and replanting, thinning, work log and monitoring, from the tree register.
          Later, farmers may get this part for their own farm only.
        </p>
        <p class="text-sm opacity-80">
          Until then: care contracts are followed as deals in the <Link to="/grove/deals" class="underline">Management clients</Link> funnel, and planted
          projects are under <Link to="/grove/projects" class="underline">B · Projects</Link> (stage Handed over), with their tree register.
        </p>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/grove/managed")({ component: Managed });
