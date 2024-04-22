import { useNavigate } from "@solidjs/router";
import { Row } from "solid-bootstrap";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { action } from "@solidjs/router";
import { A, useParams } from "@solidjs/router";
import type { ProjectDocument } from "@rw/db/schemas/project";
import type { SpeciesDocument } from "@rw/db/schemas/species";
import { apiFetchOptions } from "~/util/apiFetchOptions";

export default function view() {
	const params = useParams<{
		projectId: string;
		parcelId: string;
		layerId: string;
	}>();

	const [data, { refetch }] = createResource<{
		species: SpeciesDocument[];
		project: ProjectDocument;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/sequences/new`,
			apiFetchOptions(),
		);
		const result = await response.json();
		console.log(result);
		return result;
	});
	const navigate = useNavigate();

	const [gridLength, setGridLength] = createSignal<number>(0);
	const [gridDistance, setGridDistance] = createSignal<number>(0);

	const arrayLength = createMemo<number>(() => {
		const length = gridLength() * 100;
		const distance = gridDistance() * 100;

		if (length === 0 || distance === 0) {
			return 0;
		}
		if (length % distance === 0) {
			return length / distance;
		}
		return 0;
	});

	const Form = action(async (formData: FormData) => {
		const payload: any = {
			sequence: {
				name: formData.get("sequence[name]")?.toString()!,
				description: formData.get("sequence[description]")?.toString()!,
				sequencelength: Number(formData.get("sequence[length]")?.toString()!),
				model: [],
			},
		};

		for (let i = 0; i < arrayLength(); i++) {
			payload.sequence.model.push({
				species: formData.get(`model[${i}][species]`)?.toString()!,
				position: Number(formData.get(`model[${i}][position]`)?.toString()!),
			});
		}

		console.log(payload);

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/sequences`,
			{
				body: JSON.stringify(payload),
				method: "post",
				...apiFetchOptions(),
			},
		);

		navigate(
			`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}//layout`,
		);
	});

	function calculatePosition(i: number) {
		return Math.round(gridLength() * 100 - i * gridDistance() * 100) / 100;
	}

	return (
		<>
			<Show when={data()?.project}>
				<form method="post" action={Form}>
					<A
						href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}//layout`}
						class="btn mt-2 mb-2 btn-dark"
					>
						<i class="fas fa-arrow-left" /> Back to layout
					</A>

					<Row>
						<div class="col-lg-12">
							<h1>Create a new sequence</h1>

							<div class="form-group">
								<label for="sequence[name]">Sequence name</label>
								<input
									type="text"
									class="form-control"
									name="sequence[name]"
									required
								/>
							</div>
							<div class="form-group">
								<label for="sequence[description]">Description</label>
								<input
									type="text"
									class="form-control"
									name="sequence[description]"
								/>
							</div>

							<h4>Define grid</h4>

							<div class="form-group">
								<label for="sequence[length]">Length of row sequence [m]</label>
								<input
									type="number"
									step=".1"
									value={gridLength()}
									class="form-control"
									name="sequence[length]"
									placeholder="Length in m"
									oninput={(e) => {
										setGridLength(Number.parseFloat(e.currentTarget.value));
									}}
									required
								/>
							</div>

							<div class="form-group">
								<label for="sequence[distance]">
									Minimum distance between species in row sequence [m] (Lowest
									denominator)
								</label>
								<input
									type="number"
									step=".1"
									value={gridDistance()}
									class="form-control"
									name="sequence[distance]"
									placeholder="Distance in m"
									oninput={(e) => {
										setGridDistance(Number.parseFloat(e.currentTarget.value));
									}}
									required
								/>
							</div>

							<p>
								Notice: Length must be divisible with distance between species
								in sequence.
							</p>
						</div>
						<div class="col-lg-2" />
					</Row>

					<Show when={data()?.project && arrayLength() > 0}>
						<Row>
							<div class="col-lg-12">
								<h3>Sequence pattern ({arrayLength()} species)</h3>
								<p>
									The species positions are absolute. Please note that the first
									plants in the rows are located at the bottom.
								</p>
								<h5>Row sequence</h5>
								<For each={[...Array(arrayLength()).keys()]}>
									{(i) => (
										<div class="card">
											<div class="card-body">
												<select
													name={`model[${i}][species]`}
													style="width:100%;max-width:100%;"
												>
													<option value="">none</option>
													<For each={data()?.species}>
														{(species) => (
															<option value={species._id}>
																{species.genus} {species.species} (
																{species.nameCommon})
															</option>
														)}
													</For>
												</select>
												<input
													type="hidden"
													name={`model[${i}][position]`}
													value={calculatePosition(i)}
												/>
												<p>Row position: {calculatePosition(i)} m</p>
											</div>
										</div>
									)}
								</For>
								<div class="form-group">
									<button type="submit" class="btn btn-dark mt-3">
										Create new row sequence
									</button>
								</div>
							</div>
						</Row>
					</Show>
				</form>
			</Show>
		</>
	);
}
