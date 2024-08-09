import { For, createResource } from "solid-js";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
	const [data, { refetch }] = createResource<{
		systems: SystemDocument[];
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/systems`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	return (
		<div class="container">
			<h1>Systems</h1>
			<p>Count: {data()?.systems.length}</p>
			<table class="table table-striped">
				<tbody>
					<tr>
						<td>System name</td>
						<td>Shared</td>
						<td>Grid</td>
						<td>Occurrences</td>
						<td>Owner</td>
						<td />
					</tr>
					<For each={data()?.systems}>
						{(system) => (
							<tr>
								<td>{system.name}</td>
								<td>{system.shared}</td>
								{system.model.length > 0 ? (
									<td>Grid exist</td>
								) : (
									<td>no grid</td>
								)}
								{system.occurrences.length > 0 ? (
									<td>{system.occurrences.length}</td>
								) : (
									<td>no occurrences</td>
								)}
								<td>{JSON.stringify(system.owner)}</td>
								<td>
									<a href={`/systems/${system._id}`} class="btn btn-dark">
										Show more
									</a>
								</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
		</div>
	);
}
