import { For, createResource } from "solid-js";
import { A } from "@solidjs/router";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
  const [data, { refetch }] = createResource<{
    species: SpeciesDocument[];
  }>(async () => {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/species`, apiFetchOptions());
    return await response.json();
  });

  return (
    <div class="container mx-auto p-4">
      <h1 class="text-3xl font-bold mb-4">Species</h1>
      <A
        href="/species/new"
        class="rounded-sm py-1 px-2 my-2 bg-blue-500 text-white hover:bg-blue-600"
      >
        Add new species
      </A>

      <p class="mb-4 mt-4">Count: {data()?.species?.length}</p>
      {/* Header Row */}
      <div class="flex font-bold bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600 py-2 text-gray-900 dark:text-gray-100">
        <div class="flex-1">Common name</div>
        <div class="flex-1">Latin</div>
        <div class="flex-1">Precip</div>
        <div class="flex-1">Temp</div>
        <div class="flex-1">Lifespan</div>
        <div class="flex-1">Activities</div>
        <div class="flex-1">Price</div>
        <div class="flex-1">Actions</div>
      </div>
      {/* Data Rows */}
      <For each={data()?.species}>
        {(species) => (
          <div class="flex items-center border-b border-gray-200 dark:border-gray-600 py-2">
            <div class="flex-1">{species.nameCommon}</div>
            <div class="flex-1">
              {species.genus} {species.species}
            </div>
            <div class="flex-1">
              {species.precipitation ? (
                <span>
                  {species.precipitation.min} - {species.precipitation.max}
                </span>
              ) : (
                <span>no precipitation data</span>
              )}
            </div>
            <div class="flex-1">
              {species.temperature ? (
                <span>
                  {species.temperature.min} - {species.temperature.max}
                </span>
              ) : (
                <span>no precipitation data</span>
              )}
            </div>
            <div class="flex-1">{species.lifespan ? species.lifespan : "no age data"}</div>
            <div class="flex-1">
              {species.activities?.length > 0 ? species.activities.length : "-"}
            </div>
            <div class="flex-1">{species.price ? `${species.price} $` : "no age data"}</div>
            <div class="flex-1">
              <A
                href={`/species/${species._id}`}
                class="rounded-sm py-1 px-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Show more
              </A>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
