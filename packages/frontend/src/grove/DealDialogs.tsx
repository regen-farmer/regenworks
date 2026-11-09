// Dialogs for A · Clients & deals: new deal, and optional next steps after a win.
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { showToast } from "~/components/ui/toast";
import { noon, type Client, type Deal, type Funnel } from "~/grove/dealTypes.ts";
import { SourceSelect } from "~/grove/SourceSelect.tsx";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";

/** After a win: optional next steps. Nothing happens unless one is chosen. */
export function WonDialog(props: { deal: Deal | null; funnels: Funnel[]; onClose: () => void; onDone: (to: any) => void }) {
  const [busy, setBusy] = createSignal(false);
  const [followFunnel, setFollowFunnel] = createSignal("");
  const [followTitle, setFollowTitle] = createSignal("");
  createEffect(() => {
    const d = props.deal;
    if (!d) return;
    const management = props.funnels.find((f) => f.key === "management");
    setFollowFunnel(management?._id ?? props.funnels[0]?._id ?? "");
    setFollowTitle(/^care contract/i.test(d.title) ? `${d.title} · renewal` : `Care contract · ${d.title}`);
  });

  async function handover(body: Record<string, unknown>) {
    const d = props.deal;
    if (!d) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ project?: { _id: string }; deal?: { _id: string } }>(`/internal/deals/${d._id}/handover`, { method: "POST", body: JSON.stringify(body) });
      props.onClose();
      if (r.project) props.onDone({ to: "/grove/projects/$projectId", params: { projectId: r.project._id } });
      else if (r.deal) props.onDone({ to: "/grove/deals/$dealId", params: { dealId: r.deal._id } });
    } catch (err) {
      showToast({ title: "Not done", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!props.deal} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.deal?.status === "won" ? "Won" : "Next steps"}: {props.deal?.title}</DialogTitle>
        </DialogHeader>
        <p class="text-sm">These are optional. You can also do them later from the deal page.</p>
        <div class="flex flex-col gap-3 text-sm">
          <div class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 flex flex-col gap-2">
            <b>Project on the Dashboard</b>
            <span class="opacity-70">For design and planting work: a project in B · Projects with the client and farm, starting with Screening.</span>
            <button class="rounded-sm p-2 btn-default self-start" disabled={busy()} onClick={() => handover({ action: "project" })}>
              {props.deal?.groveProject ? "Open its project" : "Create project"}
            </button>
          </div>
          <div class="rounded-md border border-zinc-300 dark:border-slate-600 p-3 flex flex-col gap-2">
            <b>Follow-up deal for the same client</b>
            <span class="opacity-70">E.g. a care contract, or more trees next season.</span>
            <div class="flex flex-wrap gap-2">
              <select class={`${input} w-auto`} value={followFunnel()} onChange={(e) => setFollowFunnel(e.currentTarget.value)} aria-label="Funnel for the follow-up deal">
                <For each={props.funnels}>{(f) => <option value={f._id}>{f.name}</option>}</For>
              </select>
              <input class={`${input} flex-1 min-w-48`} value={followTitle()} maxLength={200} onInput={(e) => setFollowTitle(e.currentTarget.value)} aria-label="Title of the follow-up deal" />
            </div>
            <button class="rounded-sm p-2 btn-default self-start" disabled={busy() || !followFunnel()} onClick={() => handover({ action: "followup", funnel: followFunnel(), title: followTitle() })}>
              Create follow-up deal
            </button>
          </div>
        </div>
        <DialogFooter>
          <button class="rounded-sm p-2 btn-default" onClick={props.onClose}>Not now</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** New deal in a funnel: an existing client (picked by name) or a new one. */
export function NewDealDialog(props: { open: boolean; funnel?: Funnel; clientId?: string; clientName?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [clients] = createResource(() => (props.open ? true : undefined), () => apiFetch<{ clients: Client[] }>("/internal/clients"));
  const [title, setTitle] = createSignal("");
  const [clientName, setClientName] = createSignal("");
  const [stage, setStage] = createSignal("");
  const [value, setValue] = createSignal("");
  const [source, setSource] = createSignal("");
  const [sourceDetail, setSourceDetail] = createSignal("");
  const [forwardOrder, setForwardOrder] = createSignal(false);
  const [nextText, setNextText] = createSignal("");
  const [nextDate, setNextDate] = createSignal("");
  const [contactPerson, setContactPerson] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  createEffect(() => {
    if (!props.open) return;
    setTitle("");
    setClientName(props.clientName ?? "");
    setStage(props.funnel?.stages.find((s) => s.kind === "open")?.key ?? "");
    setValue("");
    setSource(props.clientId ? "Re-purchase" : "");
    setSourceDetail("");
    setForwardOrder(false);
    setNextText("");
    setNextDate("");
  });
  const existingClient = () => {
    const list = clients()?.clients;
    if (props.clientId) return list?.find((c) => c._id === props.clientId);
    const n = clientName().trim().toLowerCase();
    return list?.find((c) => c.name.trim().toLowerCase() === n);
  };
  const existing = () => props.clientId ?? existingClient()?._id;
  // contact details: filled from the client on file, or blank for a new client
  createEffect(() => {
    if (!props.open) return;
    const c = existingClient();
    setContactPerson(c?.contactPerson ?? "");
    setPhone(c?.phone ?? "");
    setEmail(c?.email ?? "");
  });
  const contact = () => ({ contactPerson: contactPerson().trim(), phone: phone().trim(), email: email().trim() });

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (!props.funnel) return;
    setBusy(true);
    try {
      const id = existing();
      const r = await apiFetch<{ deal: Deal }>("/internal/deals", {
        method: "POST",
        body: JSON.stringify({
          title: title() || clientName(),
          funnel: props.funnel._id,
          stage: stage(),
          value: value() === "" ? null : value(),
          source: source(),
          sourceDetail: sourceDetail(),
          forwardOrder: forwardOrder(),
          nextAction: { text: nextText(), date: noon(nextDate()) },
          ...(id ? { client: id } : { newClient: { name: clientName(), ...contact() } }),
        }),
      });
      // an existing client: save contact details that were added or changed here
      const c = existingClient();
      if (id && c) {
        const changed = Object.fromEntries(Object.entries(contact()).filter(([k, v]) => v !== ((c as any)[k] ?? "")));
        if (Object.keys(changed).length) {
          try {
            await apiFetch(`/internal/clients/${id}`, { method: "PUT", body: JSON.stringify(changed) });
          } catch (err) {
            showToast({ title: "Deal created, but the contact details weren't saved", description: (err as Error).message, variant: "destructive" });
          }
        }
      }
      showToast({ title: "Deal created" });
      props.onCreated(r.deal._id);
    } catch (err) {
      showToast({ title: "Not created", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New deal · {props.funnel?.name}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-2 text-sm" onSubmit={create}>
          <Show
            when={!props.clientId}
            fallback={<div>Client: <b>{props.clientName}</b></div>}
          >
            <label class="flex flex-col gap-1">
              Client
              <input class={input} list="grove-client-names" required maxLength={200} value={clientName()} onInput={(e) => setClientName(e.currentTarget.value)} placeholder="Name of a person or company" />
              <datalist id="grove-client-names">
                <For each={clients()?.clients}>{(c) => <option value={c.name} />}</For>
              </datalist>
              <span class="text-xs opacity-70">{clientName().trim() ? (existing() ? "Existing client" : "A new client will be created") : ""}</span>
            </label>
          </Show>
          <fieldset class="grid grid-cols-2 gap-2 border border-zinc-300 dark:border-slate-600 rounded-sm p-2">
            <legend class="px-1 text-xs opacity-70">Contact{existing() ? " (saved to the client)" : ""}</legend>
            <label class="flex flex-col gap-1">
              Phone
              <input class={input} type="tel" autocomplete="off" maxLength={50} value={phone()} onInput={(e) => setPhone(e.currentTarget.value)} placeholder="e.g. +45 12 34 56 78" />
            </label>
            <label class="flex flex-col gap-1">
              Email
              <input class={input} type="email" autocomplete="off" maxLength={200} value={email()} onInput={(e) => setEmail(e.currentTarget.value)} placeholder="name@example.dk" />
            </label>
            <label class="flex flex-col gap-1 col-span-full">
              Contact person <span class="text-xs opacity-70">(if the client is a company)</span>
              <input class={input} maxLength={200} value={contactPerson()} onInput={(e) => setContactPerson(e.currentTarget.value)} />
            </label>
          </fieldset>
          <label class="flex flex-col gap-1">
            Deal title
            <input class={input} maxLength={200} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="e.g. 2 ha hazel, autumn 2027 (blank: client name)" />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1">
              Stage
              <select class={input} value={stage()} onChange={(e) => setStage(e.currentTarget.value)}>
                <For each={props.funnel?.stages}>{(s) => <option value={s.key}>{s.name}</option>}</For>
              </select>
            </label>
            <label class="flex flex-col gap-1">
              Value (kr, excl. VAT)
              <input class={input} type="number" min="0" step="1000" value={value()} onInput={(e) => setValue(e.currentTarget.value)} />
            </label>
            <label class="flex flex-col gap-1">
              Source
              <SourceSelect class={input} value={source()} onChange={setSource} />
            </label>
            <label class="flex flex-col gap-1">
              Source detail
              <input class={input} maxLength={200} value={sourceDetail()} placeholder="e.g. ØRD adviser, date of the check" onInput={(e) => setSourceDetail(e.currentTarget.value)} />
            </label>
            <label class="flex items-center gap-2 col-span-full">
              <input type="checkbox" checked={forwardOrder()} onChange={(e) => setForwardOrder(e.currentTarget.checked)} />
              Forward order (trees for a later season)
            </label>
            <label class="flex flex-col gap-1">
              Next action date
              <input class={input} type="date" value={nextDate()} onInput={(e) => setNextDate(e.currentTarget.value)} />
            </label>
          </div>
          <label class="flex flex-col gap-1">
            Next action
            <input class={input} maxLength={500} value={nextText()} onInput={(e) => setNextText(e.currentTarget.value)} placeholder="e.g. Call to book a site visit" />
          </label>
          <DialogFooter>
            <button type="button" class="rounded-sm p-2 btn-default" onClick={props.onClose}>Cancel</button>
            <button class="rounded-sm p-2 btn-primary" disabled={busy() || (!props.clientId && !clientName().trim())}>
              {busy() ? "Creating…" : "Create deal"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

