// One offer: edit, the Danish offer sheet (print to PDF), Dinero lines and
// the internal sheet with costs and margins. Grove team only.
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/solid-router";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { showToast, Toaster } from "~/components/ui/toast";
import { canSeeMoney } from "~/grove/access.ts";
import {
  dato,
  DISPENSATION_TEXT,
  dkk,
  PROPAGATION_DA,
  PROPAGATION_EN,
  STATUS_EN,
  type Offer,
  type OfferLine,
  type Presented,
} from "~/grove/offerTypes.ts";
import { PricebookPicker } from "~/grove/PricebookPicker.tsx";
import { apiFetch } from "~/util/apiFetch.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm w-full";
const th = "text-left font-semibold py-1 pr-2 whitespace-nowrap";
const td = "py-1 pr-2 align-top";
type Tab = "edit" | "sheet" | "dinero" | "internal";

function OfferPage() {
  const params = useParams({ from: "/grove/offers/$offerId" });
  const navigate = useNavigate();
  const [data, { mutate }] = createResource(
    () => (canSeeMoney() ? params().offerId : undefined),
    (id) => apiFetch<Presented>(`/internal/offers/${id}`),
  );
  const [projects] = createResource(() => canSeeMoney() || undefined, () => apiFetch<{ projects: { _id: string; name: string; status: string }[] }>("/internal/projects"));
  const [draft, setDraft] = createStore<Offer>({} as Offer);
  const [dirty, setDirty] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [tab, setTab] = createSignal<Tab>("edit");
  const [picking, setPicking] = createSignal<"new" | number | null>(null);

  createEffect(() => {
    const d = data();
    if (d) {
      setDraft(reconcile(structuredClone(d.offer)));
      setDirty(false);
    }
  });

  const edit = (...args: any[]) => {
    (setDraft as any)(...args);
    setDirty(true);
  };

  async function call(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const r = await apiFetch<Presented>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      mutate(r);
      if (r.warning) showToast({ title: r.warning, variant: "destructive" });
      return r;
    } catch (err) {
      showToast({ title: "Not saved", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    call(`/internal/offers/${params().offerId}`, "PUT", data()?.offer.status === "accepted" ? { dineroNumber: draft.dineroNumber, notes: draft.notes, groveProject: draft.groveProject ?? null } : {
      dineroNumber: draft.dineroNumber,
      title: draft.title,
      status: draft.status,
      client: draft.client,
      clientOrganic: draft.clientOrganic,
      offerDate: draft.offerDate,
      validUntil: draft.validUntil,
      marginPct: draft.marginPct ?? undefined,
      eurDkk: draft.eurDkk ?? undefined,
      discountPct: draft.discountPct,
      terms: draft.terms,
      notes: draft.notes,
      groveProject: draft.groveProject ?? null,
      lines: draft.lines.map(({ pricing: _p, ...l }) => l),
    }).then((r) => {
      if (r) showToast({ title: "Offer saved" });
      return r;
    });

  async function reprice(latest = false) {
    if (dirty() && !(await save())) return;
    await call(`/internal/offers/${params().offerId}/reprice`, "POST", { latest });
  }

  async function remove() {
    if (!confirmDelete()) return;
    try {
      await apiFetch(`/internal/offers/${params().offerId}`, { method: "DELETE" });
      navigate({ to: "/grove/offers" });
    } catch (err) {
      showToast({ title: "Not deleted", description: (err as Error).message, variant: "destructive" });
    }
  }
  const [deleteArmed, setDeleteArmed] = createSignal(false);
  const confirmDelete = () => {
    // two clicks instead of a browser dialog
    if (deleteArmed()) return true;
    setDeleteArmed(true);
    setTimeout(() => setDeleteArmed(false), 4000);
    return false;
  };

  // flags by line id, so they stay on the right line while editing
  const flags = (i: number) => {
    const id = draft.lines?.[i]?._id;
    return id ? data()?.internal.lines.find((f) => f.id === id) : undefined;
  };
  // dates as the Danish calendar day (not UTC)
  const dateValue = (d: string | undefined) => {
    if (!d) return "";
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };

  return (
    <div class="container mx-auto p-4 flex flex-col gap-4 offer-page" data-testid="grove-offer">
      <Toaster />
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .offer-sheet, .offer-sheet * { visibility: visible; }
          .offer-sheet { position: absolute; left: 0; top: 0; width: 100%; color: #000; background: #fff; }
          .no-print { display: none !important; }
        }
      `}</style>
      <Show when={canSeeMoney()} fallback={<p>Offers are only shown to the Grove team.</p>}>
        <Show when={data()} fallback={<p>Loading…</p>}>
          <div class="flex flex-wrap items-center gap-2 no-print">
            <Link to="/grove/offers" class="text-sm underline">
              ← Offers
            </Link>
            <h1 class="text-2xl font-bold mr-auto">{draft.title || "Tilbud"}</h1>
            <For each={["edit", "sheet", "dinero", "internal"] as Tab[]}>
              {(t) => (
                <button
                  class="rounded-sm px-2 py-1 text-sm"
                  classList={{ "btn-default": tab() === t, underline: tab() !== t }}
                  onClick={() => setTab(t)}
                >
                  {{ edit: "Edit", sheet: "Offer sheet (DA)", dinero: "Dinero lines", internal: "Internal" }[t]}
                </button>
              )}
            </For>
          </div>

          <Show when={tab() === "edit"}>
            <div class="flex flex-wrap gap-2 items-center no-print">
              <button class="rounded-sm px-2 py-1 btn-default" disabled={busy() || !dirty()} onClick={save}>
                {dirty() ? "Save" : "Saved"}
              </button>
              <button class="rounded-sm px-2 py-1 btn-default" disabled={busy()} onClick={() => reprice(false)}>
                Price again
              </button>
              <Show when={draft.status === "draft"}>
                <button class="rounded-sm px-2 py-1 text-sm underline" disabled={busy()} onClick={() => reprice(true)}>
                  Use newest pricebook
                </button>
              </Show>
              <span class="text-xs opacity-70">
                Priced with pricebook v{data()!.offer.pricebookVersion ?? "–"} · prices you typed are kept · new or changed plants and a new margin are priced when you save
              </span>
              <Show when={draft.status === "accepted"}>
                <span class="text-xs text-amber-700">Accepted: locked except Dinero no. and notes.</span>
              </Show>
              <button class="ml-auto text-xs underline text-red-600" onClick={remove}>
                {deleteArmed() ? "Click again to delete" : "Delete offer"}
              </button>
            </div>

            <section class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label class="flex flex-col text-xs">
                Title
                <input class={input} value={draft.title ?? ""} onInput={(e) => edit("title", e.currentTarget.value)} />
              </label>
              <label class="flex flex-col text-xs">
                Dinero tilbud no.
                <input class={input} value={draft.dineroNumber ?? ""} onInput={(e) => edit("dineroNumber", e.currentTarget.value)} />
              </label>
              <label class="flex flex-col text-xs">
                Dashboard project
                <select class={input} value={draft.groveProject ?? ""} onChange={(e) => edit("groveProject", e.currentTarget.value || null)}>
                  <option value="">–</option>
                  <For each={projects()?.projects.filter((x) => x.status !== "archived" || x._id === draft.groveProject)}>{(x) => <option value={x._id}>{x.name}</option>}</For>
                </select>
              </label>
              <label class="flex flex-col text-xs">
                Status
                <select class={input} value={draft.status} disabled={data()?.offer.status === "accepted"} onChange={(e) => edit("status", e.currentTarget.value)}>
                  <For each={Object.entries(STATUS_EN)}>{([k, v]) => <option value={k}>{v}</option>}</For>
                </select>
              </label>
              <For each={[["name", "Client"], ["contactPerson", "Contact person"], ["cvr", "CVR"], ["address", "Address"], ["email", "Email"], ["phone", "Phone"]] as const}>
                {([k, label]) => (
                  <label class="flex flex-col text-xs">
                    {label}
                    <input class={input} value={(draft.client as any)?.[k] ?? ""} onInput={(e) => edit("client", k, e.currentTarget.value)} />
                  </label>
                )}
              </For>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.clientOrganic} onChange={(e) => edit("clientOrganic", e.currentTarget.checked)} />
                Client is organic
              </label>
              <label class="flex flex-col text-xs">
                Offer date
                <input
                  type="date"
                  class={input}
                  value={dateValue(draft.offerDate)}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    if (!v) return;
                    // "valid until" follows while it is still the default 2 weeks
                    const plus14 = (d: string) => {
                      const x = new Date(d);
                      x.setDate(x.getDate() + 14);
                      return x;
                    };
                    const wasDefault = dateValue(draft.validUntil) === dateValue(plus14(draft.offerDate).toISOString());
                    edit("offerDate", `${v}T12:00:00`);
                    if (wasDefault) edit("validUntil", plus14(`${v}T12:00:00`).toISOString());
                  }}
                />
              </label>
              <label class="flex flex-col text-xs">
                Valid until (default 2 weeks)
                <input type="date" class={input} value={dateValue(draft.validUntil)} onInput={(e) => edit("validUntil", `${e.currentTarget.value}T12:00:00`)} />
              </label>
              <label class="flex flex-col text-xs">
                Margin on supplier cost (%)
                <input type="number" class={input} value={draft.marginPct ?? ""} onInput={(e) => edit("marginPct", e.currentTarget.value === "" ? null : Number(e.currentTarget.value))} />
              </label>
              <label class="flex flex-col text-xs">
                EUR → DKK
                <input type="number" step="0.01" class={input} value={draft.eurDkk ?? ""} onInput={(e) => edit("eurDkk", e.currentTarget.value === "" ? null : Number(e.currentTarget.value))} />
              </label>
              <label class="flex flex-col text-xs">
                Discount on the whole offer (%)
                <input type="number" class={input} value={draft.discountPct ?? 0} onInput={(e) => edit("discountPct", Number(e.currentTarget.value) || 0)} />
              </label>
            </section>

            <section class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr>
                    <th class={th}>Plant (DA)</th>
                    <th class={th}>Latin</th>
                    <th class={th}>Cultivar</th>
                    <th class={th}>Rootstock</th>
                    <th class={th}>Type</th>
                    <th class={th}>Size</th>
                    <th class={th}>Organic</th>
                    <th class={th}>Qty</th>
                    <th class={th}>Unit price</th>
                    <th class={th}>Disc. %</th>
                    <th class={th}>Total</th>
                    <th class={th} />
                  </tr>
                </thead>
                <tbody>
                  <For each={draft.lines}>
                    {(l, i) => (
                      <tr class="border-t border-zinc-200 dark:border-slate-700">
                        <td class={td}><input class={input} value={l.nameDa ?? ""} onInput={(e) => edit("lines", i(), "nameDa", e.currentTarget.value)} /></td>
                        <td class={td}><input class={input} value={l.latin ?? ""} onInput={(e) => edit("lines", i(), { latin: e.currentTarget.value, pricebookRef: null })} /></td>
                        <td class={td}><input class={input} value={l.cultivar ?? ""} onInput={(e) => edit("lines", i(), { cultivar: e.currentTarget.value, pricebookRef: null })} /></td>
                        <td class={td}><input class={input} value={l.rootstock ?? ""} onInput={(e) => edit("lines", i(), { rootstock: e.currentTarget.value, pricebookRef: null })} /></td>
                        <td class={td}>
                          <select class={input} value={l.propagation ?? ""} onChange={(e) => edit("lines", i(), { propagation: e.currentTarget.value || undefined, pricebookRef: null })}>
                            <option value="">–</option>
                            <For each={Object.entries(PROPAGATION_EN)}>{([k, v]) => <option value={k}>{v}</option>}</For>
                          </select>
                        </td>
                        <td class={td}><input class={input} value={l.size ?? ""} onInput={(e) => edit("lines", i(), { size: e.currentTarget.value, pricebookRef: null })} /></td>
                        <td class={td}>
                          <select class={input} title="Open (?) lets the client decide: organic clients get organic plants" value={l.organicRequested === true ? "yes" : l.organicRequested === false ? "no" : ""} onChange={(e) => {
                            const v = e.currentTarget.value === "yes" ? true : e.currentTarget.value === "no" ? false : null;
                            edit("lines", i(), { organic: v, organicRequested: v, pricebookRef: null });
                          }}>
                            <option value="">? ({l.organic === true ? "organic" : l.organic === false ? "not organic" : "–"})</option>
                            <option value="yes">organic</option>
                            <option value="no">not organic</option>
                          </select>
                        </td>
                        <td class={td}><input type="number" min="0" class={`${input} w-20`} value={l.qty} onInput={(e) => edit("lines", i(), "qty", Number(e.currentTarget.value) || 0)} /></td>
                        <td class={td}>
                          <input type="number" min="0" step="5" class={`${input} w-24`} value={l.unitPrice} onInput={(e) => edit("lines", i(), { unitPrice: Number(e.currentTarget.value) || 0, priceSource: "manual" })} />
                          <div class="text-xs opacity-60">{{ sales: "Grove price list", "cost+margin": "cost + margin", manual: "set by hand", none: "no price" }[l.priceSource]}</div>
                        </td>
                        <td class={td}><input type="number" min="0" max="100" class={`${input} w-16`} value={l.discountPct ?? 0} onInput={(e) => edit("lines", i(), "discountPct", Number(e.currentTarget.value) || 0)} /></td>
                        <td class={`${td} whitespace-nowrap`}>{dkk((l.qty || 0) * (l.unitPrice || 0) * (1 - (l.discountPct || 0) / 100))}</td>
                        <td class={td}>
                          <div class="flex flex-col gap-0.5 text-xs">
                            <Show when={draft.clientOrganic && l.organic !== true}><span class="text-amber-600">needs dispensation</span></Show>
                            <Show when={flags(i())?.outdated}><span class="text-amber-600">price may be outdated</span></Show>
                            <Show when={flags(i())?.vatUnclear}><span class="text-amber-600">supplier VAT unclear</span></Show>
                            <Show when={flags(i())?.pickedMissing}><span class="text-amber-600">picked product not used: check</span></Show>
                            <Show when={flags(i())?.stale}><span class="text-amber-600">not in this pricebook: old price kept</span></Show>
                            <Show when={flags(i())?.ambiguous}><span class="text-amber-600">several prices fit: check type/size</span></Show>
                            <Show when={l.priceSource === "none"}><span class="text-red-600">no price</span></Show>
                            <button class="underline text-left" onClick={() => setPicking(i())}>pick product</button>
                            <Show when={l.pricebookRef}><span class="opacity-60">from pricebook</span></Show>
                            <button
                              class="underline text-left"
                              onClick={() => {
                                setPicking(null); // a picker open for another line would point at the wrong one
                                edit("lines", (ls: OfferLine[]) => ls.filter((_, j) => j !== i()));
                              }}
                            >
                              remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <div class="flex gap-2 mt-2">
                <button class="rounded-sm px-2 py-1 btn-default text-sm" onClick={() => setPicking("new")}>
                  + Add plant from pricebook
                </button>
                <button
                  class="rounded-sm px-2 py-1 text-sm underline"
                  onClick={() => edit("lines", (ls: OfferLine[]) => [...(ls ?? []), { qty: 1, unitPrice: 0, priceSource: "none", discountPct: 0, organic: null }])}
                >
                  + Empty line
                </button>
              </div>
              <Show when={picking() !== null}>
                <div class="mt-2">
                  <p class="text-xs opacity-70 mb-1">
                    {picking() === "new" ? "Pick a product for a new line." : `Pick a product for line ${(picking() as number) + 1}; its quantity and discount stay.`} It is priced from that product when you save.
                  </p>
                  <PricebookPicker
                    version={data()!.offer.pricebookVersion ?? undefined}
                    onClose={() => setPicking(null)}
                    onPick={(fields) => {
                      const at = picking();
                      if (at === "new") edit("lines", (ls: OfferLine[]) => [...(ls ?? []), { qty: 1, discountPct: 0, ...fields } as OfferLine]);
                      // Keep the line's price: a different product is priced again on
                      // save, the same product leaves the line as it was.
                      // A different species gets its Danish name from the pricebook.
                      else if (typeof at === "number") {
                        const { unitPrice: _u, priceSource: _s, ...plant } = fields;
                        edit("lines", at, (l: OfferLine) => ({ ...l, ...plant, nameDa: plant.nameDa ?? (plant.latin === l.latin ? l.nameDa : undefined) }));
                      }
                      setPicking(null);
                    }}
                  />
                </div>
              </Show>
              <p class="text-xs opacity-70 mt-1">
                Changes to quantities or plants are saved with "Save"; "Price from pricebook" then prices the lines that have no hand-set price.
              </p>
            </section>

            <section class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label class="flex flex-col text-xs">
                Delivery season
                <input class={input} value={draft.terms?.deliverySeason ?? ""} placeholder="fx Efterår 2027" onInput={(e) => edit("terms", "deliverySeason", e.currentTarget.value)} />
              </label>
              <label class="flex flex-col text-xs">
                Deposit
                <input class={input} value={draft.terms?.deposit ?? ""} placeholder="fx 50 % ved ordre, rest ved levering" onInput={(e) => edit("terms", "deposit", e.currentTarget.value)} />
              </label>
              <label class="flex flex-col text-xs md:col-span-2">
                Other terms (shown on the offer)
                <textarea class={input} rows={3} value={draft.terms?.text ?? ""} onInput={(e) => edit("terms", "text", e.currentTarget.value)} />
              </label>
              <label class="flex flex-col text-xs md:col-span-2">
                Internal notes (not on the offer)
                <textarea class={input} rows={2} value={draft.notes ?? ""} onInput={(e) => edit("notes", e.currentTarget.value)} />
              </label>
            </section>
          </Show>

          <Show when={tab() === "sheet"}>
            <div class="no-print flex gap-2 items-center">
              <button class="rounded-sm px-2 py-1 btn-default" onClick={() => window.print()}>
                Print / save as PDF
              </button>
              <Show when={dirty()}><span class="text-xs text-amber-600">Unsaved changes are not shown: save first.</span></Show>
            </div>
            <OfferSheet p={data()!} />
          </Show>

          <Show when={tab() === "dinero"}>
            <DineroLines p={data()!} />
          </Show>

          <Show when={tab() === "internal"}>
            <Internal p={data()!} />
          </Show>
        </Show>
      </Show>
    </div>
  );
}

/** The Danish offer sheet sent to the client (print to PDF). */
function OfferSheet(props: { p: Presented }) {
  const o = () => props.p.offer;
  const t = () => props.p.totals;
  const groups = () => {
    const m = new Map<string, OfferLine[]>();
    for (const l of o().lines) {
      const k = `${l.nameDa ?? ""}|${l.latin ?? ""}`;
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.values()];
  };
  const lineTotal = (l: OfferLine) => (l.qty || 0) * (l.unitPrice || 0) * (1 - (l.discountPct || 0) / 100);
  return (
    <div class="offer-sheet bg-white text-black p-8 rounded-sm border border-zinc-200 max-w-4xl" style={{ "font-family": "system-ui, sans-serif" }}>
      <div class="flex justify-between items-start mb-6">
        <div>
          <div class="text-2xl font-bold">Tilbud{o().dineroNumber ? ` nr. ${o().dineroNumber}` : ""}</div>
          <div class="text-sm">{o().title}</div>
        </div>
        <div class="text-right text-sm">
          <div class="font-semibold">Grove</div>
          <div>Dato: {dato(o().offerDate)}</div>
          <div>Gyldigt til: {dato(o().validUntil)}</div>
        </div>
      </div>
      <div class="text-sm mb-6">
        <div class="font-semibold">{o().client?.name}</div>
        <Show when={o().client?.contactPerson}><div>Att.: {o().client.contactPerson}</div></Show>
        <Show when={o().client?.address}><div style={{ "white-space": "pre-line" }}>{o().client.address}</div></Show>
        <Show when={o().client?.cvr}><div>CVR: {o().client.cvr}</div></Show>
      </div>
      <table class="w-full text-sm" style={{ "border-collapse": "collapse" }}>
        <thead>
          <tr style={{ "border-bottom": "1px solid #000" }}>
            <th class="text-left py-1">Plante</th>
            <th class="text-left py-1">Sort / grundstamme</th>
            <th class="text-left py-1">Type og størrelse</th>
            <th class="text-right py-1">Antal</th>
            <th class="text-right py-1">Stk.-pris</th>
            <th class="text-right py-1">Rabat</th>
            <th class="text-right py-1">I alt</th>
          </tr>
        </thead>
        <tbody>
          <For each={groups()}>
            {(lines) => (
              <For each={lines}>
                {(l, i) => (
                  <tr style={{ "border-bottom": "1px solid #ddd" }}>
                    <td class="py-1 pr-2 align-top">
                      <Show when={i() === 0}>
                        <div class="font-semibold">{l.nameDa}</div>
                        <div class="italic text-xs">{l.latin}</div>
                      </Show>
                    </td>
                    <td class="py-1 pr-2 align-top">
                      {l.cultivar}
                      <Show when={l.rootstock}><span class="text-xs"> på {l.rootstock}</span></Show>
                    </td>
                    <td class="py-1 pr-2 align-top">
                      {[l.propagation ? PROPAGATION_DA[l.propagation] ?? l.propagation : "", l.size, l.organic === true ? "økologisk" : ""].filter(Boolean).join(", ")}
                      <Show when={o().clientOrganic && l.organic !== true}>
                        <div class="text-xs" style={{ color: "#a15c00" }}>{DISPENSATION_TEXT}</div>
                      </Show>
                    </td>
                    <td class="py-1 text-right align-top">{(l.qty || 0).toLocaleString("da-DK")}</td>
                    <td class="py-1 text-right align-top whitespace-nowrap">{dkk(l.unitPrice)}</td>
                    <td class="py-1 text-right align-top">{l.discountPct ? `${l.discountPct.toLocaleString("da-DK")} %` : ""}</td>
                    <td class="py-1 text-right align-top whitespace-nowrap">{dkk(lineTotal(l))}</td>
                  </tr>
                )}
              </For>
            )}
          </For>
        </tbody>
      </table>
      <table class="ml-auto mt-4 text-sm">
        <tbody>
          <tr><td class="pr-6">Subtotal</td><td class="text-right">{dkk(t().subtotal)}</td></tr>
          <Show when={t().discount > 0}>
            <tr><td class="pr-6">Rabat {o().discountPct.toLocaleString("da-DK")} %</td><td class="text-right">-{dkk(t().discount)}</td></tr>
          </Show>
          <tr><td class="pr-6">Moms 25 %</td><td class="text-right">{dkk(t().vat)}</td></tr>
          <tr class="font-bold" style={{ "border-top": "1px solid #000" }}><td class="pr-6">I alt inkl. moms</td><td class="text-right">{dkk(t().total)}</td></tr>
        </tbody>
      </table>
      <div class="text-sm mt-6 flex flex-col gap-1">
        <div class="font-semibold">Betingelser</div>
        <div>Tilbuddet er gældende til {dato(o().validUntil)}.</div>
        <Show when={o().terms?.deliverySeason}><div>Levering: {o().terms.deliverySeason}</div></Show>
        <Show when={o().terms?.deposit}><div>Depositum: {o().terms.deposit}</div></Show>
        <Show when={o().terms?.text}><div style={{ "white-space": "pre-line" }}>{o().terms.text}</div></Show>
        <div>Alle priser er i danske kroner. Priser pr. stk. er ekskl. moms.</div>
      </div>
    </div>
  );
}

function DineroLines(props: { p: Presented }) {
  const text = () => props.p.dinero.map((d) => `${d.text}\t${d.amount.toFixed(2).replace(".", ",")}`).join("\n");
  return (
    <section class="flex flex-col gap-2">
      <p class="text-sm opacity-70">One line per species for the Dinero tilbud (amounts excl. VAT). The offer number comes from Dinero.</p>
      <table class="text-sm">
        <tbody>
          <For each={props.p.dinero}>
            {(d) => (
              <tr class="border-t border-zinc-200 dark:border-slate-700">
                <td class="py-1 pr-6">{d.text}</td>
                <td class="py-1 text-right">{dkk(d.amount)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <button
        class="rounded-sm px-2 py-1 btn-default self-start"
        onClick={() => navigator.clipboard?.writeText(text()).then(() => showToast({ title: "Copied" }))}
      >
        Copy lines
      </button>
    </section>
  );
}

function Internal(props: { p: Presented }) {
  const o = () => props.p.offer;
  return (
    <section class="flex flex-col gap-4">
      <p class="text-sm text-amber-700">Internal: costs and margins. Never send this page to a client.</p>
      <table class="w-full text-sm">
        <thead>
          <tr>
            <th class={th}>Plant</th>
            <th class={th}>Qty</th>
            <th class={th}>Price</th>
            <th class={th}>Source</th>
            <th class={th}>Supplier / cost</th>
            <th class={th}>Price list date</th>
            <th class={th}>Margin</th>
            <th class={th}>Flags</th>
          </tr>
        </thead>
        <tbody>
          <For each={o().lines}>
            {(l, i) => {
              const f = () => props.p.internal.lines[i()];
              return (
                <tr class="border-t border-zinc-200 dark:border-slate-700">
                  <td class={td}>{[l.nameDa || l.latin, l.cultivar, l.rootstock && `på ${l.rootstock}`].filter(Boolean).join(" ")}</td>
                  <td class={td}>{l.qty}</td>
                  <td class={td}>{dkk(l.unitPrice)}</td>
                  <td class={td}>{l.priceSource}{l.pricing?.matchNote ? ` · ${l.pricing.matchNote}` : ""}</td>
                  <td class={td}>
                    <Show when={l.pricing?.supplierId}>
                      {l.pricing!.supplierId}: {l.pricing!.costPrice} {l.pricing!.costCurrency} ({l.pricing!.vat ?? "VAT?"}) = {dkk(l.pricing!.unitCostDkk)}
                      <Show when={l.pricing!.size}><span class="opacity-60"> · {l.pricing!.size}</span></Show>
                    </Show>
                  </td>
                  <td class={td}>{l.pricing?.documentDate}</td>
                  <td class={td}>{f()?.margin ? `${dkk(f()!.margin!.unitMargin)} (${f()!.margin!.marginPct} %)` : "–"}</td>
                  <td class={`${td} text-xs text-amber-700`}>
                    {[f()?.dispensation && "dispensation", f()?.outdated && "outdated price", f()?.costReferenceOutdated && "cost reference outdated", f()?.stale && "not in this pricebook", f()?.vatUnclear && "VAT unclear", f()?.ambiguous && "check type/size", f()?.unpriced && "no price"].filter(Boolean).join(", ")}
                  </td>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
      <div>
        <h3 class="font-semibold">Purchase list per nursery (for the order when the client signs)</h3>
        <For each={props.p.internal.purchaseList}>
          {(s) => (
            <div class="mt-2">
              <div class="font-semibold text-sm">{s.supplierId} · cost {dkk(s.totalCostDkk)}</div>
              <ul class="text-sm list-disc ml-5">
                <For each={s.lines}>
                  {(l) => <li>{l.qty} × {l.latin} {l.cultivar ?? ""} {l.rootstock ? `on ${l.rootstock}` : ""} {l.size ?? ""} {l.organic ? "(organic)" : ""} {l.costPrice ? `@ ${l.costPrice} ${l.costCurrency}` : ""}</li>}
                </For>
              </ul>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}

export const Route = createFileRoute("/grove/offers/$offerId")({ component: OfferPage });
