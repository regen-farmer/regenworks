// Plant catalogue (hybrid groups, cultivars, rootstocks) for the design editor.
//
// Visible to the Grove team only for now; to open it to every user, change
// canUsePlantCatalogue() — the backend already handles shared and private
// entries for all logged-in users.
import { hasRole } from "@rw/db/access.ts";
import { createResource } from "solid-js";
import { getMongoDBUser } from "~/auth/useAuth";
import { apiFetch } from "~/util/apiFetch.ts";

export type CatalogueCultivar = {
  _id: string;
  name: string;
  species: string;
  pedigree?: string;
  pollination?: string;
  ripening?: string;
  vigour?: string;
  description?: string;
  shared?: boolean;
  owner?: { id?: string };
};

export type CatalogueRootstock = {
  _id: string;
  name: string;
  species?: string;
  propagation?: "seedling" | "clonal";
  vigour?: string;
  notes?: string;
  shared?: boolean;
  owner?: { id?: string };
};

export type CatalogueHybridGroup = {
  _id: string;
  nameCommon: string;
  genus: string;
  hybrid: { parents: string[]; parentageCertainty: string; growsLike?: string | null };
};

export type PlantCatalogue = {
  cultivars: CatalogueCultivar[];
  rootstocks: CatalogueRootstock[];
  hybridGroups: CatalogueHybridGroup[];
  cultivarById: Map<string, CatalogueCultivar>;
  rootstockById: Map<string, CatalogueRootstock>;
};

export const VIGOUR_OPTIONS = [
  "very-dwarfing",
  "dwarfing",
  "semi-dwarfing",
  "semi-vigorous",
  "vigorous",
  "very-vigorous",
] as const;

export function canUsePlantCatalogue(): boolean {
  return hasRole(getMongoDBUser(), "grove-field");
}

export function canEditSharedCatalogue(): boolean {
  return hasRole(getMongoDBUser(), "grove-team");
}

/** Loads the catalogue once the user is known to have access; refetch after adding. */
export function getPlantCatalogue() {
  return createResource(
    () => canUsePlantCatalogue() || undefined,
    async (): Promise<PlantCatalogue> => {
      const data = await apiFetch<Omit<PlantCatalogue, "cultivarById" | "rootstockById">>(
        "/catalogue",
      );
      return {
        ...data,
        cultivarById: new Map(data.cultivars.map((c) => [c._id, c])),
        rootstockById: new Map(data.rootstocks.map((r) => [r._id, r])),
      };
    },
  );
}

export async function createCultivar(body: Partial<CatalogueCultivar>) {
  return apiFetch<CatalogueCultivar>("/catalogue/cultivars", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createRootstock(body: Partial<CatalogueRootstock>) {
  return apiFetch<CatalogueRootstock>("/catalogue/rootstocks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function saveCultivar(id: string, body: Partial<CatalogueCultivar>) {
  return apiFetch<CatalogueCultivar>(`/catalogue/cultivars/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function saveRootstock(id: string, body: Partial<CatalogueRootstock>) {
  return apiFetch<CatalogueRootstock>(`/catalogue/rootstocks/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function createHybridGroup(body: {
  nameCommon: string;
  genus: string;
  parents: string[];
  parentageCertainty: string;
  growsLike?: string;
}) {
  return apiFetch<CatalogueHybridGroup>("/catalogue/hybrid-groups", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Short human text for a plant: "Corabel on Corylus colurna seedling, organic". */
export function describePlant(
  entry: { variety?: unknown; rootstock?: unknown; ownRoots?: unknown; organic?: unknown },
  catalogue: PlantCatalogue | undefined,
): string {
  const parts: string[] = [];
  const v = entry.variety ? catalogue?.cultivarById.get(String(entry.variety)) : undefined;
  const r = entry.rootstock ? catalogue?.rootstockById.get(String(entry.rootstock)) : undefined;
  if (v) parts.push(v.name);
  if (r) parts.push(`on ${r.name}`);
  else if (entry.ownRoots === true) parts.push("own roots / seedling");
  if (entry.organic === true) parts.push("organic");
  else if (entry.organic === false) parts.push("not organic");
  return parts.join(", ");
}
