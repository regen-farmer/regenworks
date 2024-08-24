import { useNavigate } from "@solidjs/router";
import { Row } from "~/components/row/Row";
import { Show, createResource } from "solid-js";
import { action } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import type { LayerDocument } from "@rw/db/schemas/layer.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";

export default function view() {
	const params = useParams<{ layerId: string; parcelId: string }>();
	const [data] = createResource<{
		layer: LayerDocument;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}/edit`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	const navigate = useNavigate();

	const routeAction = action(async (formData: FormData) => {
		console.log(formData.get("parcel[name]"));
		const payload = {
			layer: {
				name: formData.get("layer[name]")?.toString()!,
				description: formData.get("layer[description]")?.toString()!,
			},
		};

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}`,
			{
				body: JSON.stringify(payload),
				method: "put",
				...apiFetchOptions(),
			},
		);

		navigate(`/parcels/${params.parcelId}/layers/${params.layerId}`);
	});

	return (
		<>
			<div style={{ padding: "20px" }}>
				<Show when={data()}>
					<Row>
						<div class="col-lg-3" />
						<div class="col-lg-6">
							<h2 class="h2">Edit field</h2>
							<div>
								<form method="post" action={routeAction}>
									
									<TextField>
										<TextFieldLabel for="layer[name]">Field name</TextFieldLabel>
										<TextFieldInput type="text"
										class="form-control"
										name="layer[name]"
										value={data()?.layer.name}
										required
										placeholder="Field name" />
									</TextField>

									<TextField>
										<TextFieldLabel for="layer[description]">Description</TextFieldLabel>
										<TextFieldInput type="text"
										class="form-control"
										name="layer[description]"
										value={data()?.layer.description}
										placeholder="Description" />
									</TextField>
									<div class="btn-group">
										<button type="submit" class="rounded-sm p-1 m-1 btn-dark center-block">
											Update field
										</button>
									</div>
								</form>
							</div>
						</div>
					</Row>
				</Show>
			</div>
		</>
	);
}
