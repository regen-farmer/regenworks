// C · Managed farms: placeholder until the farm operations pages are built
// (care calendar, tasks, tree register, monitoring). See the navigation
// wireframes and the roadmap.
import { createFileRoute, Link } from "@tanstack/solid-router";

function Managed() {
  return (
    <div class="container mx-auto p-4 flex flex-col gap-3 max-w-3xl" data-testid="grove-managed">
      <h1 class="text-2xl font-bold">C · Managed farms</h1>
      <p>
        This is where the farms Grove manages will be run from: care calendar, tasks, the as-planted tree register, survival checks, work log
        and monitoring. Later, farmers may get this part for their own farm only. It isn't switched on for them.
      </p>
      <p class="text-sm opacity-80">
        Not built yet. Until then, management clients are followed as deals in the{" "}
        <Link to="/grove/deals" class="underline">Management clients</Link> funnel, and their farms are under{" "}
        <Link to="/" class="underline">B · Projects</Link>.
      </p>
    </div>
  );
}

export const Route = createFileRoute("/grove/managed")({ component: Managed });
