import type { Component } from "solid-js";
import { action, useNavigate } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions";
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
import maplibregl from "maplibre-gl";
// @ts-ignore
import * as turf from "@turf/turf";
// @ts-ignore
import type { Feature, Polygon, Properties } from "@turf/turf";

import { updateArea, useDrawControl } from "~/util/map_controls/useDrawControl";
import type { IControl } from "maplibre-gl";
import { modes } from "~/routes/parcels/[parcelId]";
import { removeLayers } from "~/util/removeLayers";

export const AddLPISFieldMode: Component<{
	setMode: any;
	getMap: () => maplibregl.Map;
	data: any;
	refetch: any;
}> = ({ getMap, setMode, data, refetch }) => {
	let draw: MapboxDraw;

	const [modalOpen, setModalOpen] = createSignal<boolean>(true);
	const [fieldName, setFieldName] = createSignal<string>("");

	const [error, setError] = createSignal<string>("");
	// setInput and closeModal
	function continueFromModal() {
		setModalOpen(false);
	}

	const [polygon, setPolygon] = createSignal<Feature<
		Polygon,
		Properties
	> | null>(null);

	function removeFields() {
		removeLayers(["field-fills", "field-outlines", "field-labels"], getMap());
		getMap().off("click", "field-labels", moveMapToField);
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

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/parcels/${params.parcelId}/layers`,
			{
				body: JSON.stringify(payload),
				method: "post",
				...apiFetchOptions(),
			},
		);

		refetch();
		removeFields();
		setMode(modes.default);
	});

	function drawFields() {
		cleanupLayers();

		addLPISFields(getMap());

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
				"fill-color": "rgba(127,34,192,0.8)",
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
	}
	function removeLPISFields() {
		let tilesets = [
			"AT_INSPIRE_FELDSTUECKE_2019_POLYGON",
			"DK_Marker_2023",
			"FI_AgriculturalParcel_2023",
			"FR_PARCELLES_GRAPHIQUES_2022",
			"NL_brpgewaspercelen_definitief_2022",
		];

		for (const tileset of tilesets) {
			if (getMap().getSource(`${tileset}_source`)) {
				getMap().removeSource(`${tileset}_source`);
			}

			if (getMap().getLayer(`${tileset}_fieldfill`)) {
				getMap().removeLayer(`${tileset}_fieldfill`);
			}

			if (getMap().getLayer(`${tileset}_fieldline`)) {
				getMap().removeLayer(`${tileset}_fieldline`);
			}

			getMap().off("mousemove", `${tileset}_fieldfill`, LPISFIeldMouseMove);
			getMap().off("mouseleave", `${tileset}_fieldfill`, LPISFieldMouseLeave);
		}
	}

	// Create a popup, but don't add it to the map yet.
	// const popup = new maplibregl.Popup({
	// 	closeButton: false,
	// 	closeOnClick: false,
	// });

	function LPISFieldMouseLeave() {
		getMap().getCanvas().style.cursor = "";
		// popup.remove();
	}

	function LPISFIeldMouseMove(e) {
		// if (e.features && e.features.length > 0 && e.features[0].id !== undefined) {
		// 	console.log('id:', e.features[0].id);
		// } else {
		// 	console.log('Feature ID is undefined', e);
		// }

		// // Change the fill color of the polygon on hover
		// const tileset = e.features[0].layer.id.split('_').slice(0, -1).join('_');
		// getMap().setPaintProperty(`${tileset}_fieldfill`, 'fill-color', [
		// 	'case',
		// 	['==', ['id'], e.features[0].id],
		// 	'rgba(0, 255, 0, 0.7)', // Change to green on hover
		// 	'rgba(255, 248, 97, 0.7)' // Default color
		// ]);

		// Change the cursor style as a UI indicator.
		getMap().getCanvas().style.cursor = "pointer";

		var coordinates = e.lngLat;

		let tooltipHTML = "";
		for (const [key, value] of Object.entries(e.features[0].properties)) {
			tooltipHTML += `${key}: ${value}<br/>`;
		}

		// Ensure that if the map is zoomed out such that multiple
		// copies of the feature are visible, the popup appears
		// over the copy being pointed to.
		while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
			coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
		}

		// Populate the popup and set its coordinates
		// based on the feature found.
		// popup.setLngLat(coordinates).setHTML(tooltipHTML).addTo(getMap());
	}

	function addLPISFields(map: maplibregl.Map) {
		let tilesets = [
			"AT_INSPIRE_FELDSTUECKE_2019_POLYGON",
			"DK_Marker_2023",
			"FI_AgriculturalParcel_2023",
			"FR_PARCELLES_GRAPHIQUES_2022",
			"NL_brpgewaspercelen_definitief_2022",
		];

		let hoveredStateIds: string[] = [];

		for (const tileset of tilesets) {
			getMap().addSource(`${tileset}_source`, {
				type: "vector",
				url: `https://martin-lpis.onrender.com/${tileset}`,
				// url: `http://localhost:3000/${tileset}`,
				promoteId: { "fields": "AutoID" }
			});

			getMap().addLayer({
				id: `${tileset}_fieldfill`,
				type: "fill",
				source: `${tileset}_source`,
				"source-layer": "fields",
				paint: {
					"fill-color": [
						"case",
						["boolean", ["feature-state", "hover"], false],
						"rgba(0, 255, 0, 0.7)", // Change to green on hover
						"rgba(255, 248, 97, 0.7)", // Default color
					],
				},
			});

			getMap().addLayer({
				id: `${tileset}_fieldline`,
				type: "line",
				source: `${tileset}_source`,
				"source-layer": "fields",
				paint: {
					"line-color": "black",
					"line-width": 1,
				},
			});

			function clear(){

				for (const id of hoveredStateIds) {
					getMap().setFeatureState(
						{
							source: `${tileset}_source`,
							id: id,
							sourceLayer: "fields",
						},
						{ hover: false },
					);
				}
				hoveredStateIds = [];
			}
			getMap().on("mousemove", `${tileset}_fieldfill`, (e) => {
				clear()
				
				if (e.features && e.features.length > 0) {
					const featureId = e.features[0].properties.AutoID; // Use a different property as ID
					if (!hoveredStateIds.includes(featureId)) {
						hoveredStateIds.push(featureId);
					}

					if (featureId) {
						getMap().setFeatureState(
							{
								source: `${tileset}_source`,
								id: featureId,
								sourceLayer: "fields",
							},
							{ hover: true },
						);
					}
				} else {
					console.log("No features found");
				}
			});

			// When the mouse leaves the fieldfill layer, update the feature state of the
			// previously hovered features.
			getMap().on("mouseleave", `${tileset}_fieldfill`, () => {
				clear()

			});
		

			getMap().on("mousemove", `${tileset}_fieldfill`, LPISFIeldMouseMove);

			getMap().on("mouseleave", `${tileset}_fieldfill`, LPISFieldMouseLeave);
		}
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

	function cancel() {
		cleanupLayers();
		setMode(modes.default);
	}

	function cleanupLayers() {
		removeFields();
		removeLPISFields();
	}

	return (
		<>
			<div>
				<Dialog open={modalOpen()} onOpenChange={setModalOpen}>
					<DialogContent class="dialog__content" onPointerDownOutside={cancel}>
						<DialogHeader>
							<DialogTitle class="dialog__title">Add field</DialogTitle>
						</DialogHeader>
						<DialogDescription class="dialog__description">
							<div class="dialog__description__body">
								<input
									type="text"
									class="addFieldInput"
									name="layer[name]"
									placeholder="Name"
									onkeyup={(e) => {
										setFieldName(e.currentTarget.value);
									}}
									required
									id="input"
								/>

								<button
									type="button"
									class="rounded-sm p-1 m-1 btn-default center-block"
									onClick={continueFromModal}
									disabled={fieldName().length < 1}
								>
									Go to map to select field
								</button>
							</div>
							<Show when={error()}>
								<p>{error()}</p>
							</Show>
						</DialogDescription>
					</DialogContent>
				</Dialog>
			</div>

			<div>
				<form method="post" action={addFieldFormAction}>
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
						<div>
							<button
								type="button"
								class="rounded-sm p-1 m-1 btn-default center-block"
								onClick={cancel}
							>
								Cancel
							</button>

							<button
								type="submit"
								disabled={submitDisabled()}
								class="rounded-sm p-1 m-1 btn-default center-block"
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

			<Show when={fieldName() !== ""}>
				{/* <h1 class="h1 addFieldModeDescription"> */}
				<h1
					style={{
						background: "rgba(0,0,0,0.4)",
						"border-radius": "10px",
						position: "fixed",
						"z-index": 10,
						color: "white",
						top: "90px",
						"font-size": "20px",
						"text-align": "center",
						left: "50%",
						transform: "translateX(-50%)",
						padding: "10px",
					}}
				>
					Click on field to select it, and click save.
				</h1>
			</Show>
		</>
	);
};
