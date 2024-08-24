import { For, createResource } from "solid-js";
import { A } from "@solidjs/router";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
	const [data, { refetch }] = createResource<{
		species: SpeciesDocument[];
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/species`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	return (
		<div class="container">
			<h1 class="h1">Species</h1>
			<A href="/species/new" class="rounded-sm p-1 m-1 btn-default">
				Add new species
			</A>
			<p>Count: {data()?.species.length}</p>
			<table class="table table-striped">
				<tbody>
					<tr>
						<td>Common name</td>
						<td>Latin</td>
						<td>Precip</td>
						<td>Temp</td>
						<td>Lifespan</td>
						<td>Activities</td>
						<td>Price</td>
						<td />
					</tr>
					<For each={data()?.species}>
						{(species) => (
							<tr>
								<td>{species.nameCommon}</td>
								<td>
									{species.genus} {species.species}
								</td>
								{species.precipitation ? (
									<td>
										{species.precipitation.min} - {species.precipitation.max}
									</td>
								) : (
									<td>no precipitation data</td>
								)}
								{species.temperature ? (
									<td>
										{species.temperature.min} - {species.temperature.max}
									</td>
								) : (
									<td>no precipitation data</td>
								)}
								{species.lifespan ? (
									<td>{species.lifespan}</td>
								) : (
									<td>no age data</td>
								)}
								{species.activities.length > 0 ? (
									<td>{species.activities.length}</td>
								) : (
									<td>-</td>
								)}
								{species.price ? (
									<td>{species.price} $</td>
								) : (
									<td>no age data</td>
								)}
								<td>
									<A href={`/species/${species._id}`} class="rounded-sm p-1 m-1 btn-default">
										Show more
									</A>
								</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
		</div>
	);
}
