// One client: contact details and every deal over time (re-purchases are
// new deals on the same client).
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/solid-router";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { NewDealDialog } from "~/grove/DealDialogs.tsx";
import { dkk, STATUS_LABEL, type Client, type Deal, type Funnel } from "~/grove/dealTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
type Detail = { client: Client; deals: (Deal & { funnelName?: string; stageName?: string })[] };

function ClientPage() {
  const params = useParams({ from: "/grove/clients/$clientId" });
  const navigate = useNavigate();
  const [data, { refetch }] = createResource(() => (canSeeMoney() ? params().clientId : undefined), (id) => apiFetch<Detail>(`/internal/clients/${id}`));
  const [funnels] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ funnels: Funnel[] }>("/internal/funnels"));
  const [c, setC] = createStore<Client>({} as Client);
  const [dirty, setDirty] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [newIn, setNewIn] = createSignal<Funnel | undefined>();

  createEffect(() => {
    const x = data();
    if (x) {
      setC(reconcile(structuredClone(x.client)));
      setDirty(false);
    }
  });
  const edit = (k: keyof Client, v: unknown) => {
    setC(k as any, v as any);
    setDirty(true);
  };

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await apiFetch(`/internal/clients/${params().clientId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: c.name,
          kind: c.kind,
          contactPerson: c.contactPerson ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
          address: c.address ?? "",
          region: c.region ?? "",
          notes: c.notes ?? "",
          ...extra,
        }),
      });
      showToast({ title: "Saved" });
      refetch();
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const lifetime = () => (data()?.deals ?? []).filter((d) => d.status === "won").reduce((n, d) => n + (d.value ?? 0), 0);

  return (
    <div class="container mx-auto p-4 flex flex-col gap-4" data-testid="grove-client">
      <Toaster />
      <Show when={canSeeMoney()} fallback={<p>Clients are only shown to the Grove team.</p>}>
        <Show when={data()} fallback={<p>Loading…</p>}>
          <div class="flex flex-wrap items-center gap-2">
            <Link to="/grove/clients" class="text-sm underline">← Clients</Link>
            <h1 class="text-2xl font-bold mr-auto">{c.name}</h1>
            <button class="rounded-sm px-2 py-1 btn-default" disabled={busy() || !dirty()} onClick={() => save()}>{dirty() ? "Save" : "Saved"}</button>
            <button class="rounded-sm px-2 py-1 text-sm underline" disabled={busy() || dirty()} onClick={() => save({ archived: !c.archived })}>{c.archived ? "Restore" : "Archive"}</button>
          </div>

          <fieldset disabled={busy()} class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label class="flex flex-col text-xs">Name<input class={input} maxLength={200} value={c.name ?? ""} onInput={(e) => edit("name", e.currentTarget.value)} /></label>
            <label class="flex flex-col text-xs">
              Kind
              <select class={input} value={c.kind} onChange={(e) => edit("kind", e.currentTarget.value)}>
                <option value="person">Person</option>
                <option value="company">Company</option>
              </select>
            </label>
            <label class="flex flex-col text-xs">Contact person<input class={input} maxLength={200} value={c.contactPerson ?? ""} onInput={(e) => edit("contactPerson", e.currentTarget.value)} /></label>
            <label class="flex flex-col text-xs">Email<input class={input} type="email" maxLength={200} value={c.email ?? ""} onInput={(e) => edit("email", e.currentTarget.value)} /></label>
            <label class="flex flex-col text-xs">Phone<input class={input} maxLength={50} value={c.phone ?? ""} onInput={(e) => edit("phone", e.currentTarget.value)} /></label>
            <label class="flex flex-col text-xs">Region<input class={input} maxLength={100} value={c.region ?? ""} onInput={(e) => edit("region", e.currentTarget.value)} /></label>
            <label class="flex flex-col text-xs md:col-span-3">Address<input class={input} maxLength={300} value={c.address ?? ""} onInput={(e) => edit("address", e.currentTarget.value)} /></label>
            <label class="flex flex-col text-xs md:col-span-3">Notes<textarea class={input} rows={3} maxLength={5000} value={c.notes ?? ""} onInput={(e) => edit("notes", e.currentTarget.value)} /></label>
          </fieldset>

          <section class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl font-semibold mr-auto">Deals</h2>
              <span class="text-sm opacity-70">Won so far: {dkk(lifetime()) || "0 kr"}</span>
              <select class={`${input} w-auto`} aria-label="New deal in funnel" value="" onChange={(e) => { setNewIn(funnels()?.funnels.find((f) => f._id === e.currentTarget.value)); e.currentTarget.value = ""; }}>
                <option value="">+ New deal for this client…</option>
                <For each={funnels()?.funnels}>{(f) => <option value={f._id}>{f.name}</option>}</For>
              </select>
            </div>
            <table class="w-full text-sm">
              <tbody>
                <For each={data()!.deals} fallback={<tr><td class="py-1">No deals yet.</td></tr>}>
                  {(d) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class="py-1 pr-3"><Link to="/grove/deals/$dealId" params={{ dealId: d._id }} class="underline">{d.title}</Link>{d.archived ? <span class="opacity-60"> (archived)</span> : ""}</td>
                      <td class="py-1 pr-3">{d.funnelName}</td>
                      <td class="py-1 pr-3">{d.stageName}</td>
                      <td class="py-1 pr-3">{STATUS_LABEL[d.status]}</td>
                      <td class="py-1 pr-3 text-right">{dkk(d.value)}</td>
                      <td class="py-1 pr-3 opacity-70">{d.createdAt ? new Date(d.createdAt).toLocaleDateString("da-DK") : ""}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </section>
          <NewDealDialog
            open={!!newIn()}
            funnel={newIn()}
            clientId={params().clientId}
            clientName={c.name}
            onClose={() => setNewIn(undefined)}
            onCreated={(id) => {
              setNewIn(undefined);
              navigate({ to: "/grove/deals/$dealId", params: { dealId: id } });
            }}
          />
        </Show>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/clients/$clientId")({ component: ClientPage });
