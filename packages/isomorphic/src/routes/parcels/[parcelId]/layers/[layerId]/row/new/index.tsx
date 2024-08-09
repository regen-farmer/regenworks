import { For, createEffect, createResource, createSignal } from "solid-js";
import { action } from "@solidjs/router";
import { useParams, useNavigate, A } from "@solidjs/router";
// import { SideBar } from "~/components/SideBar";
import type { LayerDocument } from "@rw/db/schemas/layer.ts";
import type { SequenceDocument } from "@rw/db/schemas/sequence.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// @ts-ignore
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

// @ts-ignore
import geojsonArea from "@mapbox/geojson-area";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

export default function view() {
	const params = useParams<{ parcelId: string; layerId: string }>();

	const [data, { refetch }] = createResource<{
		sequences: SequenceDocument[];
		layer: LayerDocument;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}/row/new`,
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
			geometry: formData.get("geometry")?.toString()!,
			layersize: formData.get("layersize")?.toString()!,
		};

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}/row`,
			{
				body: JSON.stringify(payload),
				method: "post",
				...apiFetchOptions(),
			},
		);

		navigate(`/parcels/${params.parcelId}/layers/${params.layerId}/layout`);
	});

	const [mapref, setMapref] = createSignal<HTMLElement>();
	let map: any;

	createEffect(() => {
		if (mapref() && data()) {
			map = new maplibregl.Map({
				attributionControl: false,
				container: mapref()!,
				style: GoogleSatStyle,
				center: [data()?.layer.lng as number, data()?.layer.lat as number],
				zoom: 15,
				maxZoom: 20,
			});
			map.addControl(new maplibregl.FullscreenControl({}));

			map.addControl(new maplibregl.NavigationControl({}), "top-left");

			const Draw = new MapboxDraw({
				controls: {
					point: false,
					line_string: true,
					polygon: false,
					trash: true,
					combine_features: false,
					uncombine_features: false,
				},
				displayControlsDefault: false,
			});
			map.addControl(Draw, "top-right");

			map.on("draw.create", (e: any) => {
				alert(
					'An area geometry has successfully been created and you may click the "Create New Area" button below to create the new area',
				);

				const shape = e.features[0];
				const shape_for_db = JSON.stringify(shape);
				console.log("ML shape", shape);

				const shapeArea = geojsonArea.geometry(shape.geometry);
				console.log("ML area", shapeArea);

				// // document.getElementById("coordinates").innerHTML = "A layer geometry has successfully been created and you may click the button below to create the new layer";
				// @ts-ignore
				document.getElementById("geometry").value = shape_for_db;

				// // Send area to document input
				// @ts-ignore
				document.getElementById("layersize").value = shapeArea;
			});
		}
	});

	return (
		<>
			<div style={{ padding: "20px" }}>
				<h2>Add new row</h2>
				<A
					href={`/parcels/${params.parcelId}/layers/${params.layerId}/layout`}
					class="btn mt-2 mb-2 btn-dark"
				>
					<i class="fas fa-arrow-left" /> Back to map
				</A>
				<p>You can use this form to add new tree rows to your field.</p>

				<form method="post" action={Form}>
					<div class="form-group">
						<label for="row[name]">Row name/ref</label>
						<input
							type="text"
							class="form-control"
							name="row[name]"
							placeholder="Give the row a name - Descriptive is often best"
							required
						/>
					</div>
					{data()?.sequences && data()?.sequences.length! > 0 ? (
						<div class="form-group">
							<label for="sequenceid">Select row sequence: </label>
							<select name="sequenceid" id="sequenceid">
								<option value="none">None</option>
								<For each={data()?.sequences}>
									{(sequence) => (
										<option value={sequence._id.toString()}>
											{sequence.name}
										</option>
									)}
								</For>
							</select>
						</div>
					) : (
						<p>
							No row sequences defined. Define one here:{" "}
							<A
								href={`/parcels/${params.parcelId}/layers/${params.layerId}/sequences/new`}
								class="btn mt-2 btn-sm btn-dark"
							>
								Define new row sequence
							</A>
						</p>
					)}
					<div class="form-group">
						<label for="[rowCoordinates]">Row geometry</label>
						<p>Please draw the new row. Press "Finish" to finish line.</p>
					</div>

					<div
						ref={(r) => {
							setMapref(r);
						}}
						style="width: 100%; height: 400px;"
					/>
					<input type="hidden" id="geometry" name="geometry" />
					<input type="hidden" id="layersize" name="layersize" />
					<div id="coordinates" />
					<hr />
					<div class="form-group">
						<button type="submit" class="btn btn-dark center-block">
							Create new row
						</button>
					</div>
				</form>
			</div>
		</>
	);
}
