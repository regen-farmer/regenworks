import { A, action, useNavigate, useParams } from "@solidjs/router";
// import { modes } from "~/routes/parcels/[parcelId]";
// import { useDrawControl } from "~/util/map_controls/useDrawControl";
// import { LayerDocument } from "@rw/db/schemas/layer";
import type { Map as MLMap } from "maplibre-gl";
import { createSignal, For, onMount, type Resource } from "solid-js";

// @ts-ignore
import type * as turf from "@turf/turf";
import type { IParcelSchema } from "@rw/db/schemas/parcel.ts";
import { modes } from "~/routes/parcels/[parcelId]/index.tsx";
import { removeLayers } from "~/util/removeLayers.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { getMongoDBUser } from "~/auth/useAuth";

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
	refetch,
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

	const [activeField, setActiveField] = createSignal<string | undefined>(
		undefined,
	);

	function enterAddFieldMode() {
		cleanupLayers();
		setMode(modes.addField);
	}

	function enterAddLPISFieldMode() {
		cleanupLayers();
		setMode(modes.addLPISField);
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
		if (getMap().isStyleLoaded()) {
			drawFields();
		} else {
			getMap().on("load", () => {
				drawFields();
			});
		}
	});

	const deleteForm = action(async (formData: FormData) => {
		await fetch(`${import.meta.env.VITE_BACKEND_URL}/layers/${activeField()}`, {
			body: "",
			method: "delete",
			...apiFetchOptions(),
		});

		setActiveField(undefined);
		await refetch();
		drawFields();
	});

	const [deleteFieldModalOpen, setDeleteFieldModalOpen] = createSignal(false);

	return (
		<>
			<Dialog
				open={deleteFieldModalOpen()}
				onOpenChange={setDeleteFieldModalOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle id="deleteFieldModalLabel">
							Confirm deletion of field
						</DialogTitle>
					</DialogHeader>
					<DialogDescription>
						<p>
							When you delete your field, all information connected to it like
							saved systems, projects and budgets will be permanently deleted
							and it will not be able to be restored.
						</p>
					</DialogDescription>
					<DialogFooter>
						<form action={deleteForm} method="post" class="delete-form">
							<button class="rounded-sm p-1 my-1 btn-danger" onClick={() => setDeleteFieldModalOpen(false)}>
								Delete field
							</button>
						</form>
						<button class="rounded-sm p-1 my-2 ml-2 btn-default" onClick={() => setDeleteFieldModalOpen(false)}>
							Cancel
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<div
				style={{
					background: "rgba(0,0,0,0.5)",
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
					class="list-group rounded-md"
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
										class={"rounded-sm p-1 my-2 btn-default menu-btn list-group-button rounded-sm"}
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
										class={"rounded-sm p-1 my-2 btn-default menu-btn list-group-button rounded-sm"}
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
										class={"rounded-sm p-1 my-1 btn-danger menu-btn list-group-button rounded-sm"}
										

										onclick={()=>{
											setDeleteFieldModalOpen(true)
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
					class="rounded-sm p-1 mt-2 btn-default w-full"
					onClick={(e) => enterAddFieldMode(e)}
				>
					Add new field to this farm by drawing
				</button>
				<br />
				{getMongoDBUser().countryCode === 'DK' ?
				<button
					type="button"
					class="rounded-sm p-1 m-1 btn btn-default"
					onClick={(e) => enterAddLPISFieldMode(e)}
				>
					Add new field to this farm by selection
				</button>:<></>}
			</div>
		</>
	);
}

export default DefaultMode;
