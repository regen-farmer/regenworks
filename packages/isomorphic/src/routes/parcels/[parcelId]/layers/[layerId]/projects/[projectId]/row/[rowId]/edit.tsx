import { Row } from "solid-bootstrap";
import { For, Show, createResource } from "solid-js";
import { action } from "@solidjs/router";
import { useParams, useNavigate } from "@solidjs/router";

import type { ProjectDocument } from "@rw/db/schemas/project";
import type { RowDocument } from "@rw/db/schemas/row";
import type { SequenceDocument } from "@rw/db/schemas/sequence";
import { apiFetchOptions } from "~/util/apiFetchOptions";

export default function view() {
	const params = useParams<{
		projectId: string;
		rowId: string;
		parcelId: string;
		layerId: string;
	}>();

	const [data, { refetch }] = createResource<{
		sequences: SequenceDocument[];
		project: ProjectDocument;
		row: RowDocument;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/row/${
				params.rowId
			}/edit`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	const navigate = useNavigate();
	const Form = action(async (formData: FormData) => {
		const payload = {
			row: {
				name: formData.get("row[name]")?.toString()!,
			},
			sequenceid: formData.get("sequenceid")?.toString()!,
		};
		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/row/${
				params.rowId
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
				<div class="col-lg-6">
					<h2>Edit row</h2>
					<div>
						<form method="post" action={Form}>
							<div class="form-group">
								<label for="row[name]">Row name/ref</label>
								<input
									type="text"
									class="form-control"
									name="row[name]"
									value={data()?.row.name}
									required
								/>
							</div>
							<Show when={data()?.sequences && data()?.sequences.length! > 0}>
								<div class="form-group">
									<label for="sequenceid">Select row sequence pattern: </label>
									<select name="sequenceid" id="sequenceid">
										<option value="none">None</option>
										<For each={data()?.sequences}>
											{(sequence: SequenceDocument) => (
												<>
													{data()?.row.sequence &&
													sequence.name === data()?.row.sequence.name ? (
														<option value={sequence._id.toString()} selected>
															{sequence.name}
														</option>
													) : (
														<option value={sequence._id.toString()}>
															{sequence.name}
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
                <input type="hidden" id="geometry" name="geometry" />
                <input type="hidden" id="layersize" name="layersize" />
                <div id="coordinates"></div>
                <hr>--> */}
							<div class="form-group">
								<button type="submit" class="btn btn-dark center-block">
									Update row
								</button>
							</div>
						</form>
					</div>
				</div>
			</Row>
		</>
	);
}
