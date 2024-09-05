import type { Component } from "solid-js";
import { action, useNavigate } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { Show, createEffect, createSignal, onMount } from "solid-js";

import * as togeojson from "@tmcw/togeojson";

// @ts-ignore
import * as turf from "@turf/turf";
// @ts-ignore
import type { Feature, Polygon, Properties } from "@turf/turf";

import {
	updateArea,
	useDrawControl,
} from "~/util/map_controls/useDrawControl.ts";
import type { IControl } from "maplibre-gl";
import { modes } from "~/routes/parcels/[parcelId]/index.tsx";
import { removeLayers } from "~/util/removeLayers.ts";
import type { ILayerSchema } from "@rw/db/schemas/layer.ts";
import { getMongoDBUser } from "~/auth/useAuth";

export const EditFieldMode: Component<{
	setMode: any;
	getMap: () => maplibregl.Map;
	data: any;
	refetch: any;
	field: ILayerSchema;
}> = ({ getMap, setMode, data, refetch, field }) => {
	let draw: MapboxDraw;

	const [modalOpen, setModalOpen] = createSignal<boolean>(false);
	const [fieldName, setFieldName] = createSignal<string>("");

	const [error, setError] = createSignal<string>("");
	// setInput and closeModal
	function continueFromModal() {
		setModalOpen(false);
		addDrawControl();

		loadDrawCoordinates();
	}

	const [kmlFile, setInternalKMLFile] = createSignal<File | null>(null);
	const [polygon, setPolygon] = createSignal<Feature<
		Polygon,
		Properties
	> | null>(null);

	function addDrawControl() {
		draw = useDrawControl(getMap());
	}

	function removeFields() {
		removeLayers(["field-fills", "field-outlines", "field-labels"], getMap());
		getMap().off("click", "field-labels", moveMapToField);
	}

	function removeDrawControl() {
		if (draw) {
			if (getMap().hasControl(draw as unknown as IControl)) {
				getMap().removeControl(draw as unknown as IControl);
			}
		}
	}

	const [submitDisabled, setSubmitDisabled] = createSignal<boolean>(false);
	const params = useParams<{ parcelId: string }>();

	const addFieldFormAction = action(async (formData: FormData) => {
		setSubmitDisabled(true);

		const payload = {
			layer: {
				name: fieldName(),
			},
			geometry: formData.get("geometry")?.toString(),
			layersize: formData.get("layersize")?.toString(),
		};

		if (payload.geometry && payload.layersize && payload.layer.name) {
			if (field?._id) {
				await fetch(`${import.meta.env.VITE_BACKEND_URL}/layers/${field._id}`, {
					body: JSON.stringify(payload),
					method: "put",
					...apiFetchOptions(),
				});
			} else {
				await fetch(
					`${import.meta.env.VITE_BACKEND_URL}/parcels/${params.parcelId}/layers`,
					{
						body: JSON.stringify(payload),
						method: "post",
						...apiFetchOptions(),
					},
				);
			}

			refetch();
			removeFields();
			removeDrawControl();
			setMode(modes.default);
		} else {
			setSubmitDisabled(false);
		}
	});

	function drawFields() {
		const collectionClone = {
			features: data()?.collection.features.filter((feature) => {
				return feature.properties.id != field?._id;
			}),
			type: "FeatureCollection",
		};

		const placesClone = {
			features: data()?.places.features.filter((feature) => {
				return feature.properties.id != field?._id;
			}),
			type: "FeatureCollection",
		};

		cleanupLayers();
		getMap().addLayer({
			id: "field-fills",
			type: "fill",
			//@ts-ignore
			source: {
				type: "geojson",
				data: collectionClone,
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
				data: collectionClone,
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
				data: placesClone,
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
		setFieldName(field?.name ? field.name : "");
		addDrawControl();
		loadDrawCoordinates();
	});

	function cancel() {
		cleanupLayers();
		setMode(modes.default);
	}

	function cleanupLayers() {
		removeDrawControl();
		removeFields();
	}

	function loadDrawCoordinates() {
		if (draw && field?.geometry) {
			console.log("fieldName:", fieldName());
			const geometry = JSON.parse(field.geometry);
			console.log("Geometry: ", geometry);

			const featureIds: string[] = draw.add(geometry);

			console.log(featureIds);
			if (featureIds.length === 0) return;

			if (geometry.type === "Polygon") {
				getMap().jumpTo({
					center: geometry.coordinates[0][0] as [number, number],
					zoom: 15,
				});
			}

			draw.changeMode("simple_select", { featureIds: featureIds });

			updateArea(draw.get(featureIds[0]));
		}
	}

	function drawKML() {
		if (draw && polygon()?.geometry) {
			draw.deleteAll();

			const geometry = polygon()!.geometry;

			console.log("Geometry: ", geometry);

			const featureIds: string[] = draw.add(geometry);

			console.log(featureIds);
			if (featureIds.length === 0) return;

			console.log("Add KML");
			if (geometry.type === "Polygon") {
				getMap().jumpTo({
					center: geometry.coordinates[0][0] as [number, number],
					zoom: 15,
				});
			}

			draw.changeMode("simple_select", { featureIds: featureIds });

			updateArea(draw.get(featureIds[0]));
		}
	}

	async function parseKMLFile(e: Event) {
		function invalidFile() {
			alert("Can't parse field coordinates.");
		}

		// @ts-ignore
		const file = e.target.files![0];

		// Parse KML file
		if (file) {
			const kmlContent = await file?.text();
			if (!kmlContent) {
				invalidFile();
				return;
			}
			const kml = new DOMParser().parseFromString(kmlContent, "text/xml");
			if (!kml) {
				invalidFile();
				return;
			}
			const converted = togeojson.kml(kml);
			if (!converted) {
				invalidFile();
				return;
			}

			if (!converted!.features[0]) {
				invalidFile();
				return;
			}

			let geometry = converted!.features[0]!.geometry!;
			if (!geometry) {
				invalidFile();
				return;
			}

			if (geometry.type === "LineString") {
				// Create a polygon from the linestring
				geometry = turf.polygon([geometry.coordinates]).geometry;
			}

			if (geometry.type === "Polygon") {
				geometry.coordinates[0] = geometry!.coordinates[0].map((coordinate) => [
					coordinate[0],
					coordinate[1],
				]);

				const turfPolygon = turf.polygon(
					(geometry as turf.Polygon).coordinates,
				);

				setPolygon((prev) => turfPolygon);
				setInternalKMLFile((prev) => file);
			} else {
				invalidFile();
				return;
			}

			drawKML();
		} else {
			invalidFile();
		}
	}

	const [showLPISFields, setShowLPISFields] = createSignal(false);

	return (
		<>
			<div>
				<form method="post" action={addFieldFormAction}>
					<div
						class="bg-customdark1 "
						style={{
							"border-radius": "10px",
							position: "fixed",
							"z-index": 10,

							right: "10px",
							bottom: "10px",
							padding: "10px",
						}}
					>
						{/* <div class="mb-2">
							<span class="w-full block  text-white">
								Select field from gov. data
							</span>

							{getMongoDBUser().countryCode === "DK" ? (
								<button
									type="button"
									class="rounded-sm p-1 mt-2 btn-default w-full"
									onClick={(e) => setShowLPISFields(!showLPISFields())}
								>
									{showLPISFields() ? "Hide LPIS fields" : "Show LPIS fields"}
								</button>
							) : (
								<></>
							)}
						</div> */}
						<div class="mb-2">
							<span class="w-full block  text-white">Upload geometry</span>

							<label
								for="kmlfile"
								class="rounded-sm p-1 my-2 btn-default  text-white"
							>
								{kmlFile()?.name
									? `${kmlFile()?.name} (${
											polygon()?.geometry?.coordinates[0].length
										} coordinates)`
									: "Use geometry from KML file"}
							</label>
							<input
								style="visibility:hidden;display:none;"
								type="file"
								onChange={parseKMLFile}
								name="kmlfile"
								id="kmlfile"
								title="KML File"
							/>
						</div>

						<div class="mb-4">
							<label for="fieldName" class="block  text-white ">
								Field Name
							</label>
							<input
								type="text"
								id="fieldName"
								name="fieldName"
								value={field?.name ? field.name : ""}
								onChange={(e) => setFieldName(e.target.value)}
								class="mt-1 block w-full rounded-md p-2 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
								placeholder="Enter field name"
							/>
						</div>

						<div>
							<button
								type="button"
								class="rounded-sm p-1 my-2 btn-default center-block"
								onClick={cancel}
							>
								Cancel
							</button>

							<button
								type="submit"
								disabled={submitDisabled()}
								class="rounded-sm p-1 my-2 ml-2 btn-default center-block"
							>
								Save
							</button>
						</div>
					</div>
					<div>
						<input type="hidden" id="name" name="layer[name]" />
						<input type="hidden" id="geometry" name="geometry" />
						<input type="hidden" id="layersize" name="layersize" />
					</div>
				</form>
			</div>

			{/* <Show when={fieldName() !== ""}> */}
			{/* <h1 class="h1 addFieldModeDescription"> */}
			<span
				class="bg-customdark1"
				style={{
					"border-radius": "10px",
					position: "fixed",
					"z-index": 10,
					color: "white",
					top: "90px",
					"font-size": "13px",
					// "text-align": "center",
					left: "50%",
					transform: "translateX(-50%)",
					padding: "10px",
				}}
			>
				Click on the map to start drawing a field
				<br />
				Click on a field once to select the whole unit
				<br />
				Click on the field/edges/corners again for detailed selection
				<br />
				Press backspace to delete the current selection
			</span>
			{/* </Show> */}
		</>
	);
};
