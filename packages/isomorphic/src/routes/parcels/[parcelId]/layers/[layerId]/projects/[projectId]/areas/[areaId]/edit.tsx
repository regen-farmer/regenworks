import { Row } from "~/components/row/Row";
import { For, Show, createResource } from "solid-js";
import { action } from "@solidjs/router";
import { useParams, useNavigate } from "@solidjs/router";

import type { AreaDocument } from "@rw/db/schemas/area.ts";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import type { RotationDocument } from "@rw/db/schemas/rotation.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
	const params = useParams<{
		projectId: string;
		areaId: string;
		parcelId: string;
		layerId: string;
	}>();

	const [data, { refetch }] = createResource<{
		project: ProjectDocument;
		area: AreaDocument;
		rotations: RotationDocument[];
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/areas/${
				params.areaId
			}/edit`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	const navigate = useNavigate();
	const Form = action(async (formData: FormData) => {
		const payload = {
			area: {
				name: formData.get("area[name]")?.toString()!,
			},
			rotationid: formData.get("rotationid")?.toString()!,
		};
		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/areas/${
				params.areaId
			}`,
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
				<Show when={data()}>
					<div class="col-lg-6">
						<h2 class="h2">Edit sub-area</h2>
						<div>
							<form method="post" action={Form}>
								<div class="form-group">
									<label for="area[name]">sub-area name/ref</label>
									<input
										type="text"
										class="form-control"
										name="area[name]"
										value={data()?.area.name}
										required
									/>
								</div>
								<Show when={data()?.rotations && data()?.rotations.length! > 0}>
									<div class="form-group">
										<label for="rotationid">
											Select sub-area crop rotation:{" "}
										</label>
										<select name="rotationid" id="rotationid">
											<option value="none">None</option>
											<For each={data()?.rotations}>
												{(rotation) => (
													<>
														{data()?.area.rotation &&
														rotation.name === data()?.area.rotation.name ? (
															<option value={rotation._id.toString()} selected>
																{rotation.name}
															</option>
														) : (
															<option value={rotation._id.toString()}>
																{rotation.name}
															</option>
														)}
													</>
												)}
											</For>
										</select>
									</div>
								</Show>
								{/* <!--   <div class="form-group">
                       <label for="[rowCoordinates]">Row geometry</label>
                       <p>Please draw the outline of your new row. Press first point or "Finish" to close the shape.</p>
                   </div>
                   <div id="rowMapNew"></div>
                   <input type="hidden" id="geometry" name="geometry">
                   <input type="hidden" id="layersize" name="layersize">
                   <div id="coordinates"></div>
                   <hr>--> */}
								<div class="form-group">
									<button type="submit" class="rounded-sm p-1 m-1 btn-dark center-block">
										Update area
									</button>
								</div>
							</form>
						</div>
					</div>
				</Show>
			</Row>
		</>
	);
}
