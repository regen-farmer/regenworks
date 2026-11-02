// Clients: everyone Grove sells to, with how many deals each has.
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createResource, createSignal, For, Show } from "solid-js";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { dkk, type Client } from "~/grove/dealTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";

const field = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";

function NewClientDialog(props: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [busy, setBusy] = createSignal(false);
  async function create(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    try {
      const r = await apiFetch<{ client: Client }>("/internal/clients", {
        method: "POST",
        body: JSON.stringify({ name: v("name"), kind: v("kind"), contactPerson: v("contactPerson"), email: v("email"), phone: v("phone"), region: v("region"), address: v("address") }),
      });
      showToast({ title: "Client created" });
      props.onCreated(r.client._id);
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
          <DialogTitle>New client</DialogTitle>
        </DialogHeader>
        <form class="grid grid-cols-2 gap-2 text-sm" onSubmit={create}>
          <label class="flex flex-col gap-1 col-span-2">Name<input name="name" class={field} required maxLength={200} autofocus placeholder="Person or company" /></label>
          <label class="flex flex-col gap-1">
            Kind
            <select name="kind" class={field}>
              <option value="person">Person</option>
              <option value="company">Company</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">Contact person<input name="contactPerson" class={field} maxLength={200} /></label>
          <label class="flex flex-col gap-1">Email<input name="email" type="email" class={field} maxLength={200} /></label>
          <label class="flex flex-col gap-1">Phone<input name="phone" class={field} maxLength={50} /></label>
          <label class="flex flex-col gap-1">Region<input name="region" class={field} maxLength={100} /></label>
          <label class="flex flex-col gap-1">Address<input name="address" class={field} maxLength={300} /></label>
          <div class="col-span-2">
            <DialogFooter>
              <button type="button" class="rounded-sm p-2 btn-default" onClick={props.onClose}>Cancel</button>
              <button class="rounded-sm p-2 btn-primary" disabled={busy()}>{busy() ? "Creating…" : "Create client"}</button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Clients() {
  const navigate = useNavigate();
  const [adding, setAdding] = createSignal(false);
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
          <button class="rounded-sm px-3 py-1 btn-default" onClick={() => setAdding(true)}>+ New client</button>
        </div>
        <p class="text-xs opacity-70">Add a client here, or type a new name when you create a deal. A client keeps all its deals, so re-purchases show up here.</p>
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
        <NewClientDialog
          open={adding()}
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            navigate({ to: "/grove/clients/$clientId", params: { clientId: id } });
          }}
        />
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/clients/")({ component: Clients });
