import { useNavigate } from "@solidjs/router";
import { Row } from "solid-bootstrap";
import { Show, createResource } from "solid-js";
import { action } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import type { LayerDocument } from "~/models/layer";
import { apiFetchOptions } from "~/util/apiFetchOptions";

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
							<h2>Edit field "{data()?.layer.name}"</h2>
							<div>
								<form method="post" action={routeAction}>
									<div class="form-group">
										<label for="layer[name]">Field name</label>
										<input
											type="text"
											class="form-control"
											name="layer[name]"
											value={data()?.layer.name}
											required
										/>
									</div>
									<div class="form-group">
										<label for="layer[description]">Description</label>
										<input
											type="text"
											class="form-control"
											name="layer[description]"
											value={data()?.layer.description}
										/>
									</div>
									<div class="btn-group">
										<button type="submit" class="btn btn-dark center-block">
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
