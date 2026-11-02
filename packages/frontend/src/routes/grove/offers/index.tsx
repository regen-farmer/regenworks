// Offers list (Grove team).
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createResource, For, Show } from "solid-js";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { dkk, STATUS_DA, type Offer, type Totals } from "~/grove/offerTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

type Row = Offer & { lineCount: number; totals: Totals };

function Offers() {
  const navigate = useNavigate();
  const [data] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ offers: Row[] }>("/internal/offers"));

  async function newOffer() {
    try {
      const r = await apiFetch<{ offer: Offer }>("/internal/offers", {
        method: "POST",
        body: JSON.stringify({ title: "Nyt tilbud" }),
      });
      navigate({ to: "/grove/offers/$offerId", params: { offerId: r.offer._id } });
    } catch (err) {
      showToast({ title: "Could not create the offer", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <div class="container mx-auto p-4 flex flex-col gap-4" data-testid="grove-offers">
      <Toaster />
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold">Offers</h1>
        <Show when={canSeeMoney()}>
          <button class="rounded-sm px-2 py-1 btn-default" onClick={newOffer}>
            New offer (plant list)
          </button>
        </Show>
      </div>
      <p class="text-sm opacity-70">
        To make an offer from a design, open the scenario and use "Make offer" in its Export panel.
      </p>
      <Show when={canSeeMoney()} fallback={<p>Offers are only shown to the Grove team.</p>}>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left">
              <th class="py-1 pr-3">Offer</th>
              <th class="py-1 pr-3">Client</th>
              <th class="py-1 pr-3">Status</th>
              <th class="py-1 pr-3">Valid until</th>
              <th class="py-1 pr-3">Lines</th>
              <th class="py-1 pr-3 text-right">Total excl. VAT</th>
            </tr>
          </thead>
          <tbody>
            <For each={data()?.offers} fallback={<tr><td class="py-2" colSpan={6}>No offers yet.</td></tr>}>
              {(o) => (
                <tr class="border-t border-zinc-200 dark:border-slate-700">
                  <td class="py-1 pr-3">
                    <Link to="/grove/offers/$offerId" params={{ offerId: o._id }} class="underline">
                      {o.title || "Tilbud"}
                      {o.dineroNumber ? ` (${o.dineroNumber})` : ""}
                    </Link>
                  </td>
                  <td class="py-1 pr-3">{o.client?.name}</td>
                  <td class="py-1 pr-3">{STATUS_DA[o.status]}</td>
                  <td class="py-1 pr-3">{o.validUntil ? new Date(o.validUntil).toLocaleDateString("da-DK") : ""}</td>
                  <td class="py-1 pr-3">{o.lineCount}</td>
                  <td class="py-1 pr-3 text-right">{dkk(o.totals?.net)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/offers/")({ component: Offers });
