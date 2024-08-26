import { Row } from "~/components/row/Row";
import {
	For,
	createEffect,
	createMemo,
	createResource,
	createSignal,
} from "solid-js";
import { action } from "@solidjs/router";
import { useParams, useNavigate } from "@solidjs/router";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import type { SequenceDocument } from "@rw/db/schemas/sequence.ts";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
	const params = useParams<{
		projectId: string;
		sequenceId: string;
		parcelId: string;
		layerId: string;
	}>();

	const [data, { refetch }] = createResource<{
		project: ProjectDocument;
		sequence: SequenceDocument;
		species: SpeciesDocument[];
		length: number;
		distance: number;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/sequences/${params.sequenceId}/edit`,
			apiFetchOptions(),
		);
		const result = await response.json();
		console.log(result);
		return result;
	});

	const navigate = useNavigate();

	const [gridLength, setGridLength] = createSignal<number>(0);
	const [gridDistance, setGridDistance] = createSignal<number>(0);

	createEffect(() => {
		if (data()?.length) {
			setGridLength(data()?.length!);
		}

		if (data()?.distance) {
			setGridDistance(data()?.distance!);
		}
	});

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

	function calculatePosition(i: number) {
		return Math.round(gridLength() * 100 - i * gridDistance() * 100) / 100;
	}

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

		// console.log(payload)

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/sequences/${params.sequenceId}`,
			{
				body: JSON.stringify(payload),
				method: "put",
				...apiFetchOptions(),
			},
		);

		navigate(
			`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}/layout`,
		);
	});

	return (
		<>
			<Row>
				<div class="col-lg-12">
					<h1 class="h1">Update row sequence pattern</h1>
					<p>This page lets you update an existing row sequence pattern. </p>

					<form method="post" action={Form}>
						<div class="form-group">
							<label for="sequence[name]">Sequence name</label>
							<input
								type="text"
								class="form-control p-1 rounded-sm"
								name="sequence[name]"
								value={data()?.sequence.name}
								required
							/>
						</div>
						<div class="form-group">
							<label for="sequence[description]">Description</label>
							<input
								type="text"
								class="form-control p-1 rounded-sm"
								name="sequence[description]"
								value={data()?.sequence.description}
							/>
						</div>

						<h4 class="h4">Define grid</h4>

						<div class="form-group">
							<label for="sequence[length]">Length of row sequence [m]</label>
							<input
								type="number"
								step=".1"
								value={gridLength()}
								class="form-control p-1 rounded-sm"
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
								class="form-control p-1 rounded-sm"
								name="sequence[distance]"
								placeholder="Distance in m"
								oninput={(e) => {
									setGridDistance(Number.parseFloat(e.currentTarget.value));
								}}
								required
							/>
						</div>

						<p>
							Notice: Length must be divisible with distance between species in
							sequence.
						</p>

						<h3 class="h3">Sequence pattern</h3>
						<p>The species positions are absolute. </p>

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
													<option
														value={species._id}
														selected={
															species._id ===
															data()?.sequence.model[i]?.species._id
														}
													>
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
							<button type="submit" class="rounded-sm p-1 my-2 btn-default mt-3">
								Update row sequence
							</button>
						</div>
					</form>
				</div>
			</Row>
		</>
	);
}
