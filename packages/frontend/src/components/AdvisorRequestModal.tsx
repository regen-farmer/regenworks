import { type Component, createSignal, createEffect } from "solid-js";
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

interface AdvisorRequestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestSent?: () => void;
}

export const AdvisorRequestModal: Component<AdvisorRequestModalProps> = (props) => {
  const [projectDetails, setProjectDetails] = createSignal("");
  const [phoneNumber, setPhoneNumber] = createSignal("");
  const [isSending, setIsSending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal(false);

  // Reset state when modal opens
  createEffect(() => {
    if (props.isOpen) {
      setProjectDetails("");
      setPhoneNumber("");
      setError(null);
      setSuccess(false);
    }
  });

  const handleSendRequest = async () => {
    if (isSending()) return;

    setIsSending(true);
    setError(null);

    try {
      const baseOptions = apiFetchOptions();

      const response = await fetch(`${BACKEND_URL}/advisor-requests`, {
        method: "POST",
        headers: {
          ...(baseOptions.headers || {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectDetails: projectDetails().trim() || undefined,
          phoneNumber: phoneNumber().trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Request failed with status ${response.status}`);
      }

      setSuccess(true);

      // Call the callback if provided
      if (props.onRequestSent) {
        props.onRequestSent();
      }
    } catch (error) {
      console.error("Failed to send advisor request:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send request. Please try again or contact us directly.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={props.isOpen} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-2xl" onClose={() => props.onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Request Agriculture Advisor</DialogTitle>
          <DialogDescription>
            Are you looking for an agroforestry advisor to assist with your project? Then fill out
            the form below.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div>
            <label
              class="text-sm font-medium text-gray-700 dark:text-gray-200"
              for="project-details"
            >
              Tell us a bit more about your project
            </label>
            <textarea
              id="project-details"
              rows={4}
              class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              placeholder="Describe your project, goals, and how an advisor could help..."
              value={projectDetails()}
              onInput={(event) =>
                setProjectDetails((event.currentTarget as HTMLTextAreaElement).value)
              }
            />
          </div>

          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200" for="phone-number">
              Phone number (optional)
            </label>
            <input
              id="phone-number"
              type="tel"
              class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              placeholder="+1 (555) 123-4567"
              value={phoneNumber()}
              onInput={(event) => setPhoneNumber((event.currentTarget as HTMLInputElement).value)}
            />
          </div>

          {error() && <p class="text-sm text-red-600 dark:text-red-400">{error()}</p>}

          {success() && (
            <p class="text-sm text-green-600 dark:text-green-400">
              Request sent! We'll be in touch soon.
            </p>
          )}

          <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
            <p class="text-xs text-gray-600 dark:text-gray-400">
              If you are looking for technical support with RegenWorks, then go to our{" "}
              <a
                href="https://discord.gg/DqUZU7QNF5"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
              >
                Discord support chat here
              </a>
              .
            </p>
          </div>
        </div>

        <DialogFooter>
          {success() ? (
            <Button onClick={() => props.onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => props.onOpenChange(false)}
                disabled={isSending()}
              >
                Cancel
              </Button>
              <Button onClick={handleSendRequest} disabled={isSending()}>
                {isSending() ? "Sending..." : "Send request"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
