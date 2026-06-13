import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { createResource } from "solid-js";
import { apiFetch } from "~/util/apiFetch.ts";

export function getSpecies() {
  const [data] = createResource<{
    species: SpeciesDocument[];
    speciesById: Map<string, SpeciesDocument>;
  }>(async () => {
    const response = await apiFetch<{ species: SpeciesDocument[] }>("/species");

    const speciesById = new Map<string, SpeciesDocument>(
      response.species.map((species) => [species._id, species]),
    );

    return { ...response, speciesById };
  });
  return data;
}
