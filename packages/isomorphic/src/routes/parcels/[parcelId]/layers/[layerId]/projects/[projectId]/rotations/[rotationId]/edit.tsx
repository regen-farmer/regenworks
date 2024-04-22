import { createResource } from "solid-js";
import { action } from "@solidjs/router";
import { useParams, useNavigate } from "@solidjs/router";

import type { ProjectDocument } from "@rw/db/schemas/project";
import type { RotationDocument } from "@rw/db/schemas/rotation";
import { apiFetchOptions } from "~/util/apiFetchOptions";

export default function view() {
	const params = useParams<{
		projectId: string;
		rotationId: string;
		layerId: string;
		parcelId: string;
	}>();

	const [data, { refetch }] = createResource<{
		project: ProjectDocument;
		rotation: RotationDocument;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/rotations/${params.rotationId}/edit`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	const navigate = useNavigate();
	const Form = action(async (formData: FormData) => {
		const payload = {
			rotation: {
				name: formData.get("rotation[name]")?.toString()!,
			},
		};
		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/rotations/${params.rotationId}`,
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
			<div class="row">
				<div class="col-lg-12">
					<h1>Update crop rotation</h1>
					<p>This page lets you update an existing crop rotation. </p>
					<form method="post" action={Form}>
						<div class="form-group">
							<label for="rotation[name]">Rotation name</label>
							<input
								type="text"
								class="form-control"
								name="rotation[name]"
								value={data()?.rotation.name}
								required
							/>
						</div>
						<div class="form-group">
							<button type="submit" class="btn btn-dark mt-3">
								Update Crop Rotation
							</button>
						</div>
					</form>
				</div>
			</div>
		</>
	);
}
