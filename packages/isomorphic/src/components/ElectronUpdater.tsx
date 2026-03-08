import { createSignal, onMount, Show } from "solid-js";
import { isElectron } from "~/util/platform";
import { Button } from "~/components/ui/button";

type ElectronAPI = {
  onUpdateAvailable: (cb: (info: { version: string; notes: string }) => void) => void;
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => void;
  installUpdate: () => void;
};

function getElectronAPI(): ElectronAPI | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI ?? null;
}

export default function ElectronUpdater() {
  const [updateInfo, setUpdateInfo] = createSignal<{ version: string; notes: string } | null>(null);
  const [downloaded, setDownloaded] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);

  onMount(() => {
    if (!isElectron()) return;
    const api = getElectronAPI();
    if (!api) return;

    api.onUpdateAvailable((info) => {
      console.log("[Updater] Update available:", info.version);
      setUpdateInfo(info);
      setDismissed(false);
    });

    api.onUpdateDownloaded((info) => {
      console.log("[Updater] Update downloaded:", info.version);
      setDownloaded(true);
    });
  });

  const install = () => {
    const api = getElectronAPI();
    api?.installUpdate();
  };

  return (
    <Show when={updateInfo() && !dismissed()}>
      <div class="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-card p-4 shadow-lg">
        <div class="flex items-start gap-3">
          <div class="flex-1">
            <p class="text-sm font-medium text-card-foreground">
              {downloaded()
                ? `Version ${updateInfo()!.version} ready to install`
                : `Downloading version ${updateInfo()!.version}…`}
            </p>
            <Show when={updateInfo()!.notes}>
              <p class="mt-1 text-xs text-muted-foreground">{updateInfo()!.notes}</p>
            </Show>
          </div>
          <button
            class="text-muted-foreground hover:text-card-foreground"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <Show when={downloaded()}>
          <div class="mt-3 flex gap-2">
            <Button size="sm" onClick={install} class="flex-1">
              Restart & Update
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDismissed(true)}>
              Later
            </Button>
          </div>
        </Show>
      </div>
    </Show>
  );
}
