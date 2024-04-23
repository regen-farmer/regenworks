import type { AnimalDocument } from "@rw/db/schemas/animal";
import type { SpeciesDocument } from "@rw/db/schemas/species";

export function sortAnimalsByName(a: AnimalDocument, b: AnimalDocument) {
	if (a.name < b.name) {
		return -1;
	}
	if (a.name > b.name) {
		return 1;
	}
	return 0;
}

export function sortSpeciesByNameCommon(
	a: SpeciesDocument,
	b: SpeciesDocument,
) {
	if (a.nameCommon < b.nameCommon) {
		return -1;
	}
	if (a.nameCommon > b.nameCommon) {
		return 1;
	}
	return 0;
}

export function sortSpeciesByGenus(a: SpeciesDocument, b: SpeciesDocument) {
	if (a.genus < b.genus) {
		return -1;
	}
	if (a.genus > b.genus) {
		return 1;
	}
	return 0;
}

export function sortNumbersAscending(a: number, b: number) {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}
