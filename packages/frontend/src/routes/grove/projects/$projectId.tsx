// One dashboard project: details, linked farm, offers, archive.
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/solid-router";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import { dkk, STATUS_EN } from "~/grove/offerTypes.ts";
import { STAGES, TYPES, type GroveProject } from "~/grove/projectTypes.ts";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
type Detail = { project: GroveProject; offers: { _id: string; title?: string; dineroNumber?: string; status: keyof typeof STATUS_EN; validUntil?: string; net: number }[] };

const day = (d: string | null | undefined) => {
  if (!d) return "";
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const noon = (v: string) => (v ? `${v}T12:00:00` : null);

function ProjectPage() {
  const params = useParams({ from: "/grove/projects/$projectId" });
  const navigate = useNavigate();
  const [data, { mutate, refetch }] = createResource(() => params().projectId, (id) => apiFetch<Detail>(`/internal/projects/${id}`));
  const [farms] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ farms: { _id: string; name: string }[] }>("/internal/projects/farms"));
  const [people] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ people: { _id: string; email?: string; name?: string; roles?: string[] }[] }>("/internal/projects/people"));
  const [p, setP] = createStore<GroveProject>({} as GroveProject);
  const [dirty, setDirty] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    const d = data();
    if (d) {
      setP(reconcile(structuredClone(d.project)));
      setDirty(false);
    }
  });
  const edit = (...args: any[]) => {
    (setP as any)(...args);
    setDirty(true);
  };

  async function save(extra: Partial<GroveProject> = {}) {
    setBusy(true);
    try {
      const r = await apiFetch<{ project: GroveProject }>(`/internal/projects/${params().projectId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: p.name,
          type: p.type,
          stage: p.stage,
          status: p.status,
          client: p.client ?? {},
          farm: p.farm?._id ?? null,
          region: p.region ?? "",
          responsible: p.responsible ?? "",
          nextAction: { text: p.nextAction?.text ?? "", date: p.nextAction?.date ?? null },
          plantingDate: p.plantingDate ?? null,
          contractEnd: p.contractEnd ?? null,
          plannedHa: p.plannedHa ?? null,
          trees: p.trees ?? null,
          assignees: p.assignees ?? [],
          notes: p.notes ?? "",
          ...extra,
        }),
      });
      mutate({ ...data()!, project: r.project });
      showToast({ title: "Saved" });
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function newOffer() {
    try {
      const r = await apiFetch<{ offer: { _id: string } }>("/internal/offers", {
        method: "POST",
        body: JSON.stringify({ title: p.name, groveProjectId: params().projectId, client: { name: p.client?.name, contactPerson: p.client?.contactPerson, email: p.client?.email, phone: p.client?.phone } }),
      });
      navigate({ to: "/grove/offers/$offerId", params: { offerId: r.offer._id } });
    } catch (err) {
      showToast({ title: "Could not create the offer", description: (err as Error).message, variant: "destructive" });
    }
  }

  const team = () => canSeeMoney();

  return (
    <div class="container mx-auto p-4 flex flex-col gap-4" data-testid="grove-project">
      <Toaster />
      <Show when={data()} fallback={<p>Loading…</p>}>
        <div class="flex flex-wrap items-center gap-2">
          <Link to="/grove" class="text-sm underline">← Dashboard</Link>
          <h1 class="text-2xl font-bold mr-auto">{p.name}</h1>
          <Show when={team()}>
            <button class="rounded-sm px-2 py-1 btn-default" disabled={busy() || !dirty()} onClick={() => save()}>
              {dirty() ? "Save" : "Saved"}
            </button>
            <button class="rounded-sm px-2 py-1 text-sm underline" disabled={busy() || dirty()} title={dirty() ? "Save your changes first" : ""} onClick={() => save({ status: p.status === "archived" ? "active" : "archived" }).then(refetch)}>
              {p.status === "archived" ? "Restore" : "Archive"}
            </button>
          </Show>
        </div>

        <fieldset disabled={!team() || busy()} class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label class="flex flex-col text-xs">Name<input class={input} value={p.name ?? ""} onInput={(e) => edit("name", e.currentTarget.value)} /></label>
          <label class="flex flex-col text-xs">
            Type
            <select class={input} value={p.type} onChange={(e) => edit("type", e.currentTarget.value)}>
              <For each={TYPES}>{([k, v]) => <option value={k}>{v}</option>}</For>
            </select>
          </label>
          <label class="flex flex-col text-xs">
            Stage
            <select class={input} value={p.stage} onChange={(e) => edit("stage", e.currentTarget.value)}>
              <For each={STAGES}>{([k, v]) => <option value={k}>{v}</option>}</For>
            </select>
          </label>
          <label class="flex flex-col text-xs">
            Status
            <select class={input} value={p.status} onChange={(e) => edit("status", e.currentTarget.value)}>
              <option value="active">Active</option>
              <option value="on-hold">On hold</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label class="flex flex-col text-xs">Owner at Grove<input class={input} value={p.responsible ?? ""} onInput={(e) => edit("responsible", e.currentTarget.value)} /></label>
          <label class="flex flex-col text-xs">Region<input class={input} value={p.region ?? ""} onInput={(e) => edit("region", e.currentTarget.value)} /></label>
          <Show when={team()}>
            <For each={[["name", "Client"], ["contactPerson", "Contact person"], ["email", "Email"], ["phone", "Phone"]] as const}>
              {([k, label]) => (
                <label class="flex flex-col text-xs">
                  {label}
                  <input class={input} value={(p.client as any)?.[k] ?? ""} onInput={(e) => edit("client", (c: any) => ({ ...(c ?? {}), [k]: e.currentTarget.value }))} />
                </label>
              )}
            </For>
          </Show>
          <label class="flex flex-col text-xs">
            Farm
            <select class={input} value={p.farm?._id ?? ""} onChange={(e) => edit("farm", e.currentTarget.value ? { _id: e.currentTarget.value } : null)}>
              <option value="">–</option>
              <Show when={p.farm?._id && !farms()?.farms.some((f) => f._id === p.farm?._id)}>
                <option value={p.farm!._id}>{p.farm?.name ?? p.farm?._id}</option>
              </Show>
              <For each={farms()?.farms}>{(f) => <option value={f._id}>{f.name}</option>}</For>
            </select>
          </label>
          <Show when={p.farm?._id}>
            <div class="text-sm self-end">
              <Link to="/parcels/$parcelId" params={{ parcelId: p.farm!._id }} class="underline">Open farm →</Link>
            </div>
          </Show>
          <label class="flex flex-col text-xs md:col-start-1">Next action<input class={input} value={p.nextAction?.text ?? ""} onInput={(e) => edit("nextAction", (n: any) => ({ ...(n ?? {}), text: e.currentTarget.value }))} /></label>
          <label class="flex flex-col text-xs">Next action date<input type="date" class={input} value={day(p.nextAction?.date)} onInput={(e) => edit("nextAction", (n: any) => ({ ...(n ?? {}), date: noon(e.currentTarget.value) }))} /></label>
          <label class="flex flex-col text-xs">Planting date<input type="date" class={input} value={day(p.plantingDate)} onInput={(e) => edit("plantingDate", noon(e.currentTarget.value))} /></label>
          <label class="flex flex-col text-xs">Contract end<input type="date" class={input} value={day(p.contractEnd)} onInput={(e) => edit("contractEnd", noon(e.currentTarget.value))} /></label>
          <label class="flex flex-col text-xs">Planned ha<input type="number" min="0" step="0.1" class={input} value={p.plannedHa ?? ""} onInput={(e) => edit("plannedHa", e.currentTarget.value === "" ? null : Number(e.currentTarget.value))} /></label>
          <label class="flex flex-col text-xs">
            Trees (blank: from signed offers)
            <input type="number" min="0" class={input} value={p.trees ?? ""} placeholder={p.signedTrees ? `${p.signedTrees.toLocaleString("da-DK")} from signed offers` : ""} onInput={(e) => edit("trees", e.currentTarget.value === "" ? null : Number(e.currentTarget.value))} />
          </label>
          <Show when={team()}>
            <div class="flex flex-col text-xs md:col-span-3">
              Assigned (field users see only projects they are assigned to)
              <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                <For each={people()?.people}>
                  {(u) => (
                    <label class="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={(p.assignees ?? []).includes(u._id)}
                        onChange={(e) => edit("assignees", (a: string[] | undefined) => (e.currentTarget.checked ? [...(a ?? []), u._id] : (a ?? []).filter((x) => x !== u._id)))}
                      />
                      {u.name || u.email}
                      <span class="opacity-60">({(u.roles ?? []).join(", ") || "admin"})</span>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <Show when={team()}>
            <label class="flex flex-col text-xs md:col-span-3">Notes<textarea class={input} rows={3} value={p.notes ?? ""} onInput={(e) => edit("notes", e.currentTarget.value)} /></label>
          </Show>
        </fieldset>

        <Show when={team()}>
          <section class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-semibold mr-auto">Offers</h2>
              <button class="rounded-sm px-2 py-1 btn-default text-sm" onClick={newOffer}>New offer (plant list)</button>
            </div>
            <p class="text-xs opacity-70">
              To offer a design, use "Make offer" on the scenario, then choose this project on the offer page. Making an offer moves a prospect to "Design & offer"; accepting it moves the project to "Signed".
            </p>
            <table class="w-full text-sm">
              <tbody>
                <For each={data()!.offers} fallback={<tr><td class="py-1">No offers yet.</td></tr>}>
                  {(o) => (
                    <tr class="border-t border-zinc-200 dark:border-slate-700">
                      <td class="py-1 pr-3">
                        <Link to="/grove/offers/$offerId" params={{ offerId: o._id }} class="underline">
                          {o.title || "Tilbud"}
                          {o.dineroNumber ? ` (${o.dineroNumber})` : ""}
                        </Link>
                      </td>
                      <td class="py-1 pr-3">{STATUS_EN[o.status]}</td>
                      <td class="py-1 pr-3">{o.validUntil ? new Date(o.validUntil).toLocaleDateString("da-DK") : ""}</td>
                      <td class="py-1 pr-3 text-right">{dkk(o.net)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </section>
        </Show>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/grove/projects/$projectId")({ component: ProjectPage });
