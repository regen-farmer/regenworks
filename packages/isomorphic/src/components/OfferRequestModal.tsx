import { type Component, For, Show, createSignal, createMemo, createEffect } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { apiFetchOptions } from "~/util/apiFetchOptions";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export interface SpeciesEntry {
  id: string;
  name: string;
  latinName?: string;
  count: number;
}

interface OfferRequestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  speciesBreakdown: SpeciesEntry[];
  configId: string;
  userEmail?: string;
}

export const OfferRequestModal: Component<OfferRequestModalProps> = (props) => {
  const [userEmail, setUserEmail] = createSignal(props.userEmail || "");
  const [userNotes, setUserNotes] = createSignal("");
  const [isSendingOfferRequest, setIsSendingOfferRequest] = createSignal(false);
  const [offerRequestError, setOfferRequestError] = createSignal<string | null>(null);
  const [offerRequestSuccess, setOfferRequestSuccess] = createSignal(false);
  const [editableQuantities, setEditableQuantities] = createSignal<Record<string, number>>({});
  const [enabledSpecies, setEnabledSpecies] = createSignal<Record<string, boolean>>({});

  // Update email when prop changes
  createEffect(() => {
    if (props.userEmail) {
      setUserEmail(props.userEmail);
    }
  });

  // Reset state when modal opens
  createEffect(() => {
    if (props.isOpen) {
      setOfferRequestError(null);
      setOfferRequestSuccess(false);
      setUserNotes("");

      // Initialize editable quantities with the current counts
      const quantities: Record<string, number> = {};
      const enabled: Record<string, boolean> = {};
      props.speciesBreakdown.forEach(entry => {
        quantities[entry.id] = entry.count;
        enabled[entry.id] = true; // All species enabled by default
      });
      setEditableQuantities(quantities);
      setEnabledSpecies(enabled);
    }
  });

  const totalEditableTrees = createMemo(() => {
    const quantities = editableQuantities();
    const enabled = enabledSpecies();
    return Object.entries(quantities).reduce((sum, [id, count]) => {
      return sum + (enabled[id] ? count : 0);
    }, 0);
  });

  const handleSendOfferRequest = async () => {
    if (isSendingOfferRequest()) return;

    const email = userEmail().trim();
    if (!email) {
      setOfferRequestError("Please provide an email address so we can get back to you.");
      return;
    }

    if (totalEditableTrees() === 0) {
      setOfferRequestError("Please select at least one species with a quantity greater than 0.");
      return;
    }

    setIsSendingOfferRequest(true);
    setOfferRequestError(null);

    try {
      const baseOptions = apiFetchOptions();
      const quantities = editableQuantities();
      const enabled = enabledSpecies();

      const response = await fetch(`${BACKEND_URL}/plant-offer-requests`, {
        method: "POST",
        headers: {
          ...(baseOptions.headers || {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          configId: props.configId,
          totalTrees: totalEditableTrees(),
          species: props.speciesBreakdown
            .filter((entry) => enabled[entry.id])
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              count: quantities[entry.id] || 0,
            })),
          email,
          notes: userNotes().trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Request failed with status ${response.status}`);
      }

      setOfferRequestSuccess(true);
    } catch (error) {
      console.error("Failed to send offer request:", error);
      setOfferRequestError(
        error instanceof Error
          ? error.message
          : "Failed to send request. Please try again or contact us directly."
      );
    } finally {
      setIsSendingOfferRequest(false);
    }
  };

  return (
    <Dialog open={props.isOpen} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-3xl lg:max-w-5xl" onClose={() => props.onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Request offer on trees</DialogTitle>
          <DialogDescription>
            Review the amounts before sending your request to our nursery team.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
            <div class="flex items-center justify-between text-base font-semibold mb-3">
              <span>Total trees</span>
              <span>{totalEditableTrees().toLocaleString()}</span>
            </div>
            <Show when={props.speciesBreakdown.length > 0}>
              <div class="mt-3">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Species breakdown
                </h4>
                <div class="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
                  <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                      <thead class="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th class="w-12 px-2 py-2"></th>
                          <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Species</th>
                          <th class="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Design</th>
                          <th class="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Request</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        <For each={props.speciesBreakdown}>
                          {(entry) => {
                            const isEnabled = () => enabledSpecies()[entry.id];
                            return (
                              <tr classList={{ "opacity-50": !isEnabled() }}>
                                <td class="px-2 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    class="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer"
                                    checked={isEnabled()}
                                    onChange={(e) => {
                                      setEnabledSpecies({
                                        ...enabledSpecies(),
                                        [entry.id]: e.currentTarget.checked
                                      });
                                    }}
                                  />
                                </td>
                                <td class="px-3 py-2 text-gray-700 dark:text-gray-300">
                                  <div class="flex flex-col">
                                    <span>{entry.name}</span>
                                    <Show when={entry.latinName && entry.latinName !== entry.name}>
                                      <span class="text-xs italic text-gray-500 dark:text-gray-400">{entry.latinName}</span>
                                    </Show>
                                  </div>
                                </td>
                                <td class="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{entry.count.toLocaleString()}</td>
                                <td class="px-3 py-2 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    disabled={!isEnabled()}
                                    class="w-24 px-2 py-1 text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={editableQuantities()[entry.id] || 0}
                                    onInput={(e) => {
                                      const value = parseInt(e.currentTarget.value) || 0;
                                      setEditableQuantities({
                                        ...editableQuantities(),
                                        [entry.id]: Math.max(0, value)
                                      });
                                    }}
                                  />
                                </td>
                              </tr>
                            );
                          }}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Show>
          </div>

          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200" for="offer-request-email">
              Your email
            </label>
            <input
              id="offer-request-email"
              type="email"
              class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              placeholder="you@example.com"
              value={userEmail()}
              onInput={(event) => setUserEmail((event.currentTarget as HTMLInputElement).value)}
              required
            />
          </div>

          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200" for="offer-request-notes">
              Additional notes (optional)
            </label>
            <textarea
              id="offer-request-notes"
              rows={3}
              class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              placeholder="Any special requests or questions..."
              value={userNotes()}
              onInput={(event) => setUserNotes((event.currentTarget as HTMLTextAreaElement).value)}
            />
          </div>

          <Show when={offerRequestError()}>
            <p class="text-sm text-red-600 dark:text-red-400">{offerRequestError()}</p>
          </Show>
          <Show when={offerRequestSuccess()}>
            <p class="text-sm text-green-600 dark:text-green-400">
              Request sent! We'll be in touch soon.
            </p>
          </Show>
        </div>

        <DialogFooter>
          <Show when={offerRequestSuccess()}>
            <Button onClick={() => props.onOpenChange(false)}>
              Close
            </Button>
          </Show>
          <Show when={!offerRequestSuccess()}>
            <Button
              variant="ghost"
              onClick={() => props.onOpenChange(false)}
              disabled={isSendingOfferRequest()}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendOfferRequest}
              disabled={isSendingOfferRequest() || !userEmail().trim()}
            >
              <Show when={isSendingOfferRequest()} fallback={<span>Send request</span>}>
                Sending…
              </Show>
            </Button>
          </Show>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
