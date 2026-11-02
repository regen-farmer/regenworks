// A confirmation step for deletes and other actions that are hard to undo.
import { createSignal, type JSX } from "solid-js";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  children?: JSX.Element;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
  onClose: () => void;
}) {
  const [busy, setBusy] = createSignal(false);
  async function confirm() {
    setBusy(true);
    try {
      await props.onConfirm();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && !busy() && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <div class="text-sm">{props.children}</div>
        <DialogFooter>
          <button type="button" class="rounded-sm p-2 btn-default" disabled={busy()} onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            class="rounded-sm p-2"
            classList={{ "bg-red-700 text-white hover:bg-red-800": !!props.danger, "btn-primary": !props.danger }}
            disabled={busy()}
            onClick={confirm}
          >
            {busy() ? "Working…" : props.confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
