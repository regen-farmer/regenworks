// Cultivar, rootstock and organic for one position in a row's tree sequence.
// Blank means "not decided yet". Shown to the Grove team only for now.
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  canEditSharedCatalogue,
  createCultivar,
  createRootstock,
  type CatalogueRootstock,
  type PlantCatalogue,
} from "~/util/plantCatalogue.ts";
import { showToast } from "~/components/ui/toast";

type Entry = {
  species?: unknown;
  variety?: unknown;
  rootstock?: unknown;
  ownRoots?: unknown;
  organic?: unknown;
};

export type PlantPatch = {
  variety?: string | undefined;
  rootstock?: string | undefined;
  ownRoots?: boolean | undefined;
  organic?: boolean | undefined;
};

const NEW = "__new__";
const OWN = "__own__";
const inputClass =
  "form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600 w-full text-sm bg-transparent";

const idOf = (v: unknown) =>
  v && typeof v === "object" && "_id" in v ? String((v as any)._id) : v ? String(v) : "";

export function PlantDetailsEditor(props: {
  entry: Entry;
  speciesById?: Map<string, { genus?: string; nameCommon?: string }>;
  catalogue?: PlantCatalogue;
  refetchCatalogue: () => void;
  disabled?: boolean;
  onChange: (patch: PlantPatch) => void;
}) {
  const speciesId = () => idOf(props.entry.species);
  const genus = () => props.speciesById?.get(speciesId())?.genus;

  // Cultivars of this species or hybrid group only.
  const cultivars = createMemo(() =>
    (props.catalogue?.cultivars ?? []).filter((c) => String(c.species) === speciesId()),
  );

  // Rootstocks of the same genus first; any other rootstock is still allowed.
  const rootstockGroups = createMemo(() => {
    const all = props.catalogue?.rootstocks ?? [];
    const sameGenus = (r: CatalogueRootstock) =>
      !!genus() && props.speciesById?.get(String(r.species ?? ""))?.genus === genus();
    return { suggested: all.filter(sameGenus), other: all.filter((r) => !sameGenus(r)) };
  });

  const [adding, setAdding] = createSignal<"cultivar" | "rootstock" | null>(null);
  const [newName, setNewName] = createSignal("");
  const [newShared, setNewShared] = createSignal(canEditSharedCatalogue());
  const [busy, setBusy] = createSignal(false);

  async function addNew() {
    const name = newName().trim();
    if (!name) return;
    setBusy(true);
    try {
      if (adding() === "cultivar") {
        const created = await createCultivar({
          name,
          species: speciesId(),
          shared: newShared() && canEditSharedCatalogue(),
        });
        props.onChange({ variety: created._id });
      } else {
        const created = await createRootstock({ name, shared: newShared() && canEditSharedCatalogue() });
        props.onChange({ rootstock: created._id, ownRoots: undefined });
      }
      props.refetchCatalogue();
      setAdding(null);
      setNewName("");
    } catch (err) {
      showToast({ title: (err as Error).message || "Could not add", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const label = (o: { name: string; shared?: boolean }) => (o.shared ? o.name : `${o.name} (mine)`);

  return (
    <div class="mt-2 ml-5 flex flex-col gap-1" data-testid="plant-details">
      <select
        class={inputClass}
        aria-label="Cultivar"
        disabled={props.disabled || !speciesId()}
        value={idOf(props.entry.variety)}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v === NEW) {
            setAdding("cultivar");
            e.currentTarget.value = idOf(props.entry.variety);
            return;
          }
          props.onChange({ variety: v || undefined });
        }}
      >
        <option value="">Cultivar: not decided</option>
        <For each={cultivars()}>{(c) => <option value={c._id}>{label(c)}</option>}</For>
        <option value={NEW}>+ New cultivar…</option>
      </select>

      <select
        class={inputClass}
        aria-label="Rootstock"
        disabled={props.disabled}
        value={props.entry.ownRoots === true ? OWN : idOf(props.entry.rootstock)}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v === NEW) {
            setAdding("rootstock");
            e.currentTarget.value = props.entry.ownRoots === true ? OWN : idOf(props.entry.rootstock);
            return;
          }
          if (v === OWN) props.onChange({ rootstock: undefined, ownRoots: true });
          else props.onChange({ rootstock: v || undefined, ownRoots: undefined });
        }}
      >
        <option value="">Rootstock: not decided</option>
        <option value={OWN}>Own roots / seedling</option>
        <Show when={rootstockGroups().suggested.length}>
          <optgroup label={`${genus() ?? "Same genus"}`}>
            <For each={rootstockGroups().suggested}>
              {(r) => <option value={r._id}>{label(r)}</option>}
            </For>
          </optgroup>
        </Show>
        <Show when={rootstockGroups().other.length}>
          <optgroup label={rootstockGroups().suggested.length ? "Other" : "Rootstocks"}>
            <For each={rootstockGroups().other}>{(r) => <option value={r._id}>{label(r)}</option>}</For>
          </optgroup>
        </Show>
        <option value={NEW}>+ New rootstock…</option>
      </select>

      <select
        class={inputClass}
        aria-label="Organic"
        disabled={props.disabled}
        value={props.entry.organic === true ? "yes" : props.entry.organic === false ? "no" : ""}
        onChange={(e) => {
          const v = e.currentTarget.value;
          props.onChange({ organic: v === "yes" ? true : v === "no" ? false : undefined });
        }}
      >
        <option value="">Organic: not decided</option>
        <option value="yes">Organic</option>
        <option value="no">Not organic</option>
      </select>

      <Show when={adding()}>
        <div class="flex flex-col gap-1 p-2 rounded-sm border border-zinc-300 dark:border-slate-600">
          <input
            class={inputClass}
            placeholder={adding() === "cultivar" ? "Cultivar name, e.g. Corabel" : "Rootstock, e.g. Corylus colurna seedling"}
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && addNew()}
          />
          <Show when={canEditSharedCatalogue()}>
            <label class="text-xs flex items-center gap-1">
              <input
                type="checkbox"
                checked={newShared()}
                onChange={(e) => setNewShared(e.currentTarget.checked)}
              />
              Add to the shared list
            </label>
          </Show>
          <Show when={adding() === "rootstock"}>
            <p class="text-xs opacity-70">Set its species and vigour on the Plant catalogue page.</p>
          </Show>
          <div class="flex gap-1">
            <button class="rounded-sm p-1 btn-default text-sm" disabled={busy()} onClick={addNew}>
              Add
            </button>
            <button
              class="rounded-sm p-1 text-sm"
              onClick={() => {
                setAdding(null);
                setNewName("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
