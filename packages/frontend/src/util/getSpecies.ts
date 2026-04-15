import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { createResource } from "solid-js";
import { apiFetchOptions } from "./apiFetchOptions.ts";

export function getSpecies() {
  const [data] = createResource<{
    species: SpeciesDocument[];
    speciesById: Map<string, SpeciesDocument>;
  }>(async () => {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/species`, apiFetchOptions());

    const result = await response.json();

    result.speciesById = new Map<string, any>(
      result.species.map((species: SpeciesDocument) => [species._id, species]),
    );

    return result;
  });
  return data;
}
