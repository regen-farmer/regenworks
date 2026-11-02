// Plant catalogue: hybrid groups, cultivars and rootstocks.
// Shared list curated by the Grove team, plus each user's private entries.
import { createFileRoute } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { showToast, Toaster } from "~/components/ui/toast";
import { getSpecies } from "~/util/getSpecies.ts";
import {
  canEditSharedCatalogue,
  canUsePlantCatalogue,
  createCultivar,
  createHybridGroup,
  createRootstock,
  getPlantCatalogue,
  saveCultivar,
  saveRootstock,
  VIGOUR_OPTIONS,
  type CatalogueCultivar,
  type CatalogueRootstock,
} from "~/util/plantCatalogue.ts";

const input = "p-1 rounded-sm border border-zinc-300 dark:border-slate-600 bg-transparent text-sm";
const th = "text-left font-semibold py-1 pr-3";
const td = "py-1 pr-3 align-top";
const CERTAINTY: Record<string, string> = {
  known: "known",
  partial: "partly known",
  uncertain: "uncertain",
};

function Field(props: { label: string; children: JSX.Element }) {
  return (
    <label class="flex flex-col gap-0.5 text-xs">
      <span class="opacity-70">{props.label}</span>
      {props.children}
    </label>
  );
}

function PlantCatalogue() {
  const species = getSpecies();
  const [catalogue, { refetch }] = getPlantCatalogue();

  const speciesById = () => species()?.speciesById;
  const speciesName = (id?: string | null) => {
    const s = id ? (speciesById()?.get(String(id)) as any) : undefined;
    if (!s) return "";
    return s.species === "hybrid" ? s.nameCommon : `${s.nameCommon} (${s.genus} ${s.species})`;
  };
  // Trees and shrubs only (no herbs or grasses), sorted by name.
  const woody = createMemo(() =>
    [...(species()?.species ?? [])]
      .filter((s: any) => !["herb", "grass"].includes(s.form))
      .sort((a: any, b: any) => String(a.nameCommon).localeCompare(String(b.nameCommon))),
  );

  const fail = (err: unknown) =>
    showToast({ title: (err as Error).message || "Could not save", variant: "destructive" });
  const mine = (o: { shared?: boolean }) => (o.shared ? "shared" : "mine");

  // ---- hybrid groups ----
  const blankHybrid = () => ({
    nameCommon: "",
    genus: "",
    parents: [] as string[],
    parentageCertainty: "uncertain",
    growsLike: "",
  });
  const [hybrid, setHybrid] = createStore(blankHybrid());
  const parentChoices = createMemo(() =>
    woody().filter(
      (s: any) => s.species !== "hybrid" && (!hybrid.genus || s.genus === hybrid.genus.trim()),
    ),
  );
  async function addHybrid() {
    try {
      await createHybridGroup({ ...hybrid, growsLike: hybrid.growsLike || undefined });
      setHybrid(blankHybrid());
      showToast({ title: "Hybrid group added. Reload the page to pick it in species lists." });
      refetch();
    } catch (err) {
      fail(err);
    }
  }

  // ---- cultivars ----
  const blankCultivar = (): Partial<CatalogueCultivar> => ({
    name: "",
    species: "",
    pedigree: "",
    pollination: "",
    ripening: "",
    vigour: "",
    description: "",
    shared: canEditSharedCatalogue(),
  });
  const [cultivar, setCultivar] = createStore(blankCultivar());
  const [editingCultivar, setEditingCultivar] = createSignal<string | null>(null);
  const [cultivarFilter, setCultivarFilter] = createSignal("");
  async function submitCultivar() {
    try {
      const id = editingCultivar();
      if (id) await saveCultivar(id, cultivar);
      else await createCultivar(cultivar);
      setCultivar(blankCultivar());
      setEditingCultivar(null);
      refetch();
    } catch (err) {
      fail(err);
    }
  }
  const cultivarsShown = createMemo(() => {
    const f = cultivarFilter().toLowerCase();
    return (catalogue()?.cultivars ?? [])
      .map((c) => ({ ...c, speciesLabel: speciesName(c.species) }))
      .filter((c) => !f || `${c.name} ${c.speciesLabel}`.toLowerCase().includes(f))
      .sort((a, b) => a.speciesLabel.localeCompare(b.speciesLabel) || a.name.localeCompare(b.name));
  });

  // ---- rootstocks ----
  const blankRootstock = (): Partial<CatalogueRootstock> => ({
    name: "",
    species: "",
    propagation: undefined,
    vigour: "",
    notes: "",
    shared: canEditSharedCatalogue(),
  });
  const [rootstock, setRootstock] = createStore(blankRootstock());
  const [editingRootstock, setEditingRootstock] = createSignal<string | null>(null);
  async function submitRootstock() {
    try {
      const id = editingRootstock();
      if (id) await saveRootstock(id, rootstock);
      else await createRootstock(rootstock);
      setRootstock(blankRootstock());
      setEditingRootstock(null);
      refetch();
    } catch (err) {
      fail(err);
    }
  }

  const SpeciesSelect = (p: { value?: string | null; onChange: (v: string) => void; optional?: boolean }) => (
    <select class={input} value={p.value ?? ""} onChange={(e) => p.onChange(e.currentTarget.value)}>
      <option value="">{p.optional ? "(not set)" : "Choose species or hybrid group"}</option>
      <For each={woody()}>
        {(s: any) => <option value={s._id}>{speciesName(s._id)}</option>}
      </For>
    </select>
  );

  const VigourSelect = (p: { value?: string | null; onChange: (v: string) => void }) => (
    <select class={input} value={p.value ?? ""} onChange={(e) => p.onChange(e.currentTarget.value)}>
      <option value="">(not set)</option>
      <For each={VIGOUR_OPTIONS}>{(v) => <option value={v}>{v}</option>}</For>
    </select>
  );

  const canChange = (o: { shared?: boolean }) => !o.shared || canEditSharedCatalogue();

  return (
    <div class="container mx-auto p-4 flex flex-col gap-8" data-testid="plant-catalogue">
      <Toaster />
      <div>
        <h1 class="text-3xl font-bold">Plant catalogue</h1>
        <p class="text-sm opacity-70 mt-1">
          Hybrid groups, cultivars and rootstocks to choose in designs. The shared list is kept by
          the Grove team; entries marked "mine" are only visible to you.
        </p>
      </div>

      <Show
        when={canUsePlantCatalogue()}
        fallback={<p>The plant catalogue is only available to the Grove team for now.</p>}
      >
        {/* HYBRID GROUPS */}
        <section>
          <h2 class="text-xl font-semibold mb-2">Hybrid groups</h2>
          <p class="text-sm opacity-70 mb-2">
            One entry per group of hybrids, used like a species. A cultivar's exact pedigree goes on
            the cultivar.
          </p>
          <table class="w-full text-sm mb-3">
            <thead>
              <tr>
                <th class={th}>Name</th>
                <th class={th}>Parents</th>
                <th class={th}>Parentage</th>
                <th class={th}>Grows like</th>
              </tr>
            </thead>
            <tbody>
              <For each={catalogue()?.hybridGroups}>
                {(h) => (
                  <tr class="border-t border-zinc-200 dark:border-slate-700">
                    <td class={td}>{h.nameCommon}</td>
                    <td class={td}>
                      {h.hybrid.parents
                        .map((p) => (speciesById()?.get(String(p)) as any)?.species ?? "?")
                        .map((s: string) => `${h.genus.charAt(0)}. ${s}`)
                        .join(" × ")}
                    </td>
                    <td class={td}>{CERTAINTY[h.hybrid.parentageCertainty] ?? ""}</td>
                    <td class={td}>{speciesName(h.hybrid.growsLike)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>

          <Show when={canEditSharedCatalogue()}>
            <div class="flex flex-wrap gap-2 items-end p-2 rounded-sm border border-zinc-200 dark:border-slate-700">
              <Field label="Name">
                <input
                  class={input}
                  placeholder="Castanea Euro-Japanese hybrid"
                  value={hybrid.nameCommon}
                  onInput={(e) => setHybrid("nameCommon", e.currentTarget.value)}
                />
              </Field>
              <Field label="Genus">
                <input
                  class={input}
                  placeholder="Castanea"
                  value={hybrid.genus}
                  onInput={(e) => setHybrid({ genus: e.currentTarget.value, parents: [], growsLike: "" })}
                />
              </Field>
              <Field label="Parentage">
                <select
                  class={input}
                  value={hybrid.parentageCertainty}
                  onChange={(e) => setHybrid("parentageCertainty", e.currentTarget.value)}
                >
                  <option value="known">known</option>
                  <option value="partial">partly known</option>
                  <option value="uncertain">uncertain</option>
                </select>
              </Field>
              <Field label="Grows like">
                <select
                  class={input}
                  value={hybrid.growsLike}
                  onChange={(e) => setHybrid("growsLike", e.currentTarget.value)}
                >
                  <option value="">(first parent)</option>
                  <For each={hybrid.parents}>
                    {(p) => <option value={p}>{speciesName(p)}</option>}
                  </For>
                </select>
              </Field>
              <div class="w-full">
                <span class="text-xs opacity-70">
                  Parent species (two or more{hybrid.genus ? `, genus ${hybrid.genus}` : ""})
                </span>
                <div class="flex flex-wrap gap-x-4 gap-y-1 max-h-40 overflow-auto text-sm">
                  <For each={parentChoices()}>
                    {(s: any) => (
                      <label class="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={hybrid.parents.includes(s._id)}
                          onChange={(e) =>
                            setHybrid("parents", (ps) =>
                              e.currentTarget.checked ? [...ps, s._id] : ps.filter((p) => p !== s._id),
                            )
                          }
                        />
                        {s.nameCommon} ({s.genus} {s.species})
                      </label>
                    )}
                  </For>
                </div>
              </div>
              <button class="rounded-sm px-2 py-1 btn-default" onClick={addHybrid}>
                Add hybrid group
              </button>
            </div>
          </Show>
        </section>

        {/* CULTIVARS */}
        <section>
          <h2 class="text-xl font-semibold mb-2">Cultivars</h2>
          <input
            class={`${input} mb-2`}
            placeholder="Filter by cultivar or species"
            value={cultivarFilter()}
            onInput={(e) => setCultivarFilter(e.currentTarget.value)}
          />
          <table class="w-full text-sm mb-3">
            <thead>
              <tr>
                <th class={th}>Cultivar</th>
                <th class={th}>Species / hybrid group</th>
                <th class={th}>Pedigree</th>
                <th class={th}>Pollination</th>
                <th class={th}>Ripening</th>
                <th class={th}>Vigour</th>
                <th class={th}>List</th>
                <th class={th} />
              </tr>
            </thead>
            <tbody>
              <For each={cultivarsShown()}>
                {(c) => (
                  <tr class="border-t border-zinc-200 dark:border-slate-700">
                    <td class={td}>{c.name}</td>
                    <td class={td}>{c.speciesLabel}</td>
                    <td class={td}>{c.pedigree}</td>
                    <td class={td}>{c.pollination}</td>
                    <td class={td}>{c.ripening}</td>
                    <td class={td}>{c.vigour}</td>
                    <td class={td}>{mine(c)}</td>
                    <td class={td}>
                      <Show when={canChange(c)}>
                        <button
                          class="text-xs underline"
                          onClick={() => {
                            setEditingCultivar(c._id);
                            setCultivar({ ...blankCultivar(), ...c });
                          }}
                        >
                          Edit
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <div class="flex flex-wrap gap-2 items-end p-2 rounded-sm border border-zinc-200 dark:border-slate-700">
            <Field label="Cultivar name">
              <input
                class={input}
                value={cultivar.name ?? ""}
                onInput={(e) => setCultivar("name", e.currentTarget.value)}
              />
            </Field>
            <Field label="Species / hybrid group">
              <SpeciesSelect value={cultivar.species} onChange={(v) => setCultivar("species", v)} />
            </Field>
            <Field label="Pedigree">
              <input
                class={input}
                placeholder="(sativa × crenata) × mollissima"
                value={cultivar.pedigree ?? ""}
                onInput={(e) => setCultivar("pedigree", e.currentTarget.value)}
              />
            </Field>
            <Field label="Pollination">
              <input
                class={input}
                value={cultivar.pollination ?? ""}
                onInput={(e) => setCultivar("pollination", e.currentTarget.value)}
              />
            </Field>
            <Field label="Ripening">
              <input
                class={input}
                value={cultivar.ripening ?? ""}
                onInput={(e) => setCultivar("ripening", e.currentTarget.value)}
              />
            </Field>
            <Field label="Vigour">
              <VigourSelect value={cultivar.vigour} onChange={(v) => setCultivar("vigour", v)} />
            </Field>
            <Show when={canEditSharedCatalogue()}>
              <label class="text-xs flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={!!cultivar.shared}
                  onChange={(e) => setCultivar("shared", e.currentTarget.checked)}
                />
                Shared list
              </label>
            </Show>
            <button class="rounded-sm px-2 py-1 btn-default" onClick={submitCultivar}>
              {editingCultivar() ? "Save cultivar" : "Add cultivar"}
            </button>
            <Show when={editingCultivar()}>
              <button
                class="text-xs underline"
                onClick={() => {
                  setEditingCultivar(null);
                  setCultivar(blankCultivar());
                }}
              >
                Cancel
              </button>
            </Show>
          </div>
        </section>

        {/* ROOTSTOCKS */}
        <section>
          <h2 class="text-xl font-semibold mb-2">Rootstocks</h2>
          <table class="w-full text-sm mb-3">
            <thead>
              <tr>
                <th class={th}>Rootstock</th>
                <th class={th}>Species</th>
                <th class={th}>Propagation</th>
                <th class={th}>Vigour</th>
                <th class={th}>Notes</th>
                <th class={th}>List</th>
                <th class={th} />
              </tr>
            </thead>
            <tbody>
              <For each={catalogue()?.rootstocks}>
                {(r) => (
                  <tr class="border-t border-zinc-200 dark:border-slate-700">
                    <td class={td}>{r.name}</td>
                    <td class={td}>{speciesName(r.species)}</td>
                    <td class={td}>{r.propagation}</td>
                    <td class={td}>{r.vigour}</td>
                    <td class={td}>{r.notes}</td>
                    <td class={td}>{mine(r)}</td>
                    <td class={td}>
                      <Show when={canChange(r)}>
                        <button
                          class="text-xs underline"
                          onClick={() => {
                            setEditingRootstock(r._id);
                            setRootstock({ ...blankRootstock(), ...r });
                          }}
                        >
                          Edit
                        </button>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <div class="flex flex-wrap gap-2 items-end p-2 rounded-sm border border-zinc-200 dark:border-slate-700">
            <Field label="Rootstock name">
              <input
                class={input}
                placeholder="Corylus colurna seedling"
                value={rootstock.name ?? ""}
                onInput={(e) => setRootstock("name", e.currentTarget.value)}
              />
            </Field>
            <Field label="Species">
              <SpeciesSelect optional value={rootstock.species} onChange={(v) => setRootstock("species", v)} />
            </Field>
            <Field label="Propagation">
              <select
                class={input}
                value={rootstock.propagation ?? ""}
                onChange={(e) =>
                  setRootstock("propagation", (e.currentTarget.value || undefined) as any)
                }
              >
                <option value="">(not set)</option>
                <option value="seedling">seedling</option>
                <option value="clonal">clonal</option>
              </select>
            </Field>
            <Field label="Vigour">
              <VigourSelect value={rootstock.vigour} onChange={(v) => setRootstock("vigour", v)} />
            </Field>
            <Field label="Notes">
              <input
                class={input}
                value={rootstock.notes ?? ""}
                onInput={(e) => setRootstock("notes", e.currentTarget.value)}
              />
            </Field>
            <Show when={canEditSharedCatalogue()}>
              <label class="text-xs flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={!!rootstock.shared}
                  onChange={(e) => setRootstock("shared", e.currentTarget.checked)}
                />
                Shared list
              </label>
            </Show>
            <button class="rounded-sm px-2 py-1 btn-default" onClick={submitRootstock}>
              {editingRootstock() ? "Save rootstock" : "Add rootstock"}
            </button>
            <Show when={editingRootstock()}>
              <button
                class="text-xs underline"
                onClick={() => {
                  setEditingRootstock(null);
                  setRootstock(blankRootstock());
                }}
              >
                Cancel
              </button>
            </Show>
          </div>
        </section>
      </Show>
    </div>
  );
}

export const Route = createFileRoute("/plants/")({ component: PlantCatalogue });
