// "Make offer" on a scenario: creates a draft offer from the design's plant
// list, priced from the pricebook, and opens it. Grove team only.
import { useNavigate } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { showToast } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { apiFetch } from "~/util/apiFetch.ts";

export function MakeOfferButton(props: { projectId: string; title?: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = createSignal(false);
  async function make() {
    setBusy(true);
    try {
      const r = await apiFetch<{ offer: { _id: string }; warning?: string }>("/internal/offers", {
        method: "POST",
        body: JSON.stringify({ projectId: props.projectId, title: props.title }),
      });
      if (r.warning) showToast({ title: r.warning, variant: "destructive" });
      navigate({ to: "/grove/offers/$offerId", params: { offerId: r.offer._id } });
    } catch (err) {
      showToast({ title: "Could not make an offer", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Show when={canSeeMoney()}>
      <button type="button" class="rounded-sm p-2 my-2 btn-default" onClick={make} disabled={busy()}>
        <i class="fas fa-file-invoice mr-2" />
        {busy() ? "Making offer…" : "Make offer"}
      </button>
    </Show>
  );
}
