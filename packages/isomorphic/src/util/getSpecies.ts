import type { SpeciesDocument } from "@rw/db/schemas/species";
import { createAsync } from "@solidjs/router";
import { apiFetchOptions } from "./apiFetchOptions";

export function getSpecies() {
	return createAsync<{
		species: SpeciesDocument[];
		speciesById: Map<string, SpeciesDocument>;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/species`,
			apiFetchOptions(),
		);

		const result = await response.json();

		result.speciesById = new Map<string, any>(
			result.species.map((species) => [species._id, species]),
		);

		return result;
	});
}
