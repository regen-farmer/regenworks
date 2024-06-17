import { A, action, useNavigate, useParams } from "@solidjs/router";
// import { modes } from "~/routes/parcels/[parcelId]";
// import { useDrawControl } from "~/util/map_controls/useDrawControl";
// import { LayerDocument } from "@rw/db/schemas/layer";
import type { Map as MLMap } from "maplibre-gl";
import { createSignal, For, onMount, type Resource } from "solid-js";

// @ts-ignore
import type * as turf from "@turf/turf";
import type { IParcelSchema } from "@rw/db/schemas/parcel";
import { modes } from "~/routes/parcels/[parcelId]";
import { removeLayers } from "~/util/removeLayers";
import { apiFetchOptions } from "~/util/apiFetchOptions";

type DefaultModeProps = {
	data: Resource<
		| {
				parcel: IParcelSchema;
				collection: turf.helpers.FeatureCollection<any, any>;
				places: turf.helpers.FeatureCollection<
					turf.helpers.Point,
					{
						description: string;
					}
				>;
		  }
		| undefined
	>;
	params: any;
	setMode: any;
	editField: any;
	getMap: () => MLMap;
	refetch: any;
};

function DefaultMode({
	editField,
	data,
	params,
	setMode,
	getMap,
	refetch
}: DefaultModeProps) {
	//   function enterAddFieldMode(e: any) {
	//     e.preventDefault();
	//     setMode(modes.addField);

	//     draw = useDrawControl(map);
	//     // map.removeControl(draw);
	//   }

	function cleanupLayers() {
		removeLayers(["field-fills", "field-outlines", "field-labels"], getMap());
		getMap().off("click", "field-labels", moveMapToField);
		getMap().off("click", "field-fills", navigateToField);
	}

	const [activeField, setActiveField] = createSignal<string | undefined>(undefined)

	function enterAddFieldMode() {
		setMode(modes.addField);
	}
	const navigate = useNavigate();

	function drawFields() {
		cleanupLayers();
		getMap().addLayer({
			id: "field-fills",
			type: "fill",
			//@ts-ignore
			source: {
				type: "geojson",
				data: data()?.collection,
			},
			layout: {},
			paint: {
				"fill-color": "rgba(127,34,192,0.6)",
			},
		});

		getMap().addLayer({
			id: "field-outlines",
			type: "line",
			//@ts-ignore
			source: {
				type: "geojson",
				data: data()?.collection,
			},
			layout: {},
			paint: {
				"line-color": "rgba(255,255,255,0.5)",
				"line-width": 1,
			},
		});

		getMap().addLayer({
			id: "field-labels",
			type: "symbol",
			//@ts-ignore
			source: {
				type: "geojson",
				data: data()?.places,
			},
			layout: {
				"text-field": ["get", "description"],
				"text-justify": "center",
				"icon-image": ["concat", ["get", "icon"], "-15"],
				"text-size": 12,
			},
			paint: {
				"text-color": "white",
				"text-halo-color": "black",
				"text-halo-width": 1,
			},
		});

		getMap().on("click", "field-labels", moveMapToField);

		getMap().on("click", "field-fills", navigateToField);
	}
	function navigateToField(e: any) {
		navigate(
			`/parcels/${params.parcelId}/layers/${e.features[0].properties.id}`,
		);
	}
	function moveMapToField(e: any) {
		// navigate(`/parcels/${params.parcelId}/layers/${e.features[0].properties.id}`);
		e.clickOnLabel = true;
		getMap().flyTo({
			speed: 2,
			center: e.features[0].geometry.coordinates,
			zoom: 15,
		});
	}

	onMount(() => {
		drawFields();
	});


	const deleteForm = action(async (formData: FormData) => {

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/layers/${activeField()}`,
			{
				body: "",
				method: "delete",
				...apiFetchOptions(),
			},
		);

		setActiveField(undefined)
		await refetch()
		drawFields()
	});

	return (
		<>
			<div
				class="modal fade"
				id="deleteFieldModal"
				tabindex="-1"
				aria-labelledby="deleteFieldModalLabel"
				aria-hidden="true"
			>
				<div class="modal-dialog">
					<div class="modal-content">
						<div class="modal-header">
							<h1 class="modal-title" id="deleteFieldModalLabel">
								Confirm deletion of field
							</h1>
						</div>
						<div class="modal-body">
							<p>
								When you delete your field, all information connected to it like
								saved systems, projects and budgets will be permanently deleted
								and it will not be able to be restored.
							</p>
						</div>
						<div class="modal-footer">
							<form action={deleteForm} method="post" class="delete-form">
								<button class="btn btn-danger" data-bs-dismiss="modal">
									Delete field
								</button>
							</form>
							<button class="btn btn-dark" data-bs-dismiss="modal">
								Cancel
							</button>
						</div>
					</div>
				</div>
			</div>

			<div
				style={{
					background: "rgba(0,0,0,0.4)",
					"border-radius": "10px",
					position: "fixed",
					"z-index": 10,
					color: "white",
					right: "10px",
					bottom: "10px",
					padding: "10px",
				}}
			>
				<strong>
					<span>Fields</span>
				</strong>
				<div
					class="list-group"
					style={{
						"max-height": "500px",
						"overflow-y": "auto",
					}}
				>
					<For each={data()?.parcel.layers}>
						{(layer) => (
							<div class="list-group-item list-group-item-action list-group-item-primary overlay-list-div">
								<A
									class="overlay-list-link"
									href={`/parcels/${params.parcelId}/layers/${layer._id}`}
								>
									{layer.name}
								</A>
								<div>
									<button
										title="Edit field"
										class={"btn btn-dark menu-btn list-group-button"}
										onClick={() => {
											cleanupLayers();

											getMap().flyTo({
												speed: 2,
												center: JSON.parse(layer.geometry).geometry
													.coordinates[0][0],
												zoom: 15,
											});

											editField(layer);
										}}
									>
										<i class="fa-solid fa-pen" />
									</button>

									<button
										title="Show field on map"
										type="button"
										class={"btn btn-dark menu-btn list-group-button"}
										onClick={() => {
											console.log(
												"JSON.parse(layer.geometry)",
												JSON.parse(layer.geometry),
											);

											// Go to location of layer
											getMap().flyTo({
												speed: 2,
												center: JSON.parse(layer.geometry).geometry
													.coordinates[0][0],
												zoom: 15,
											});

											// setCoordinates([Number(parcel.lng), Number(parcel.lat)]);
										}}
									>
										<i class="fa-solid fa-crosshairs" />
									</button>
									<button
										title="Delete field"
										type="button"
										class={"btn btn-danger menu-btn list-group-button"}
										data-bs-toggle="modal"
										data-bs-target="#deleteFieldModal"
										onclick={()=>{
											setActiveField(layer._id.toString())
										}}

									>
										<i class="fa-solid fa-trash" />
									</button>
								</div>
							</div>
						)}
					</For>
				</div>

				<button
					type="button"
					class="btn btn-dark"
					onClick={(e) => enterAddFieldMode(e)}
				>
					Add new field to this farm
				</button>
			</div>
		</>
	);
}

export default DefaultMode;
