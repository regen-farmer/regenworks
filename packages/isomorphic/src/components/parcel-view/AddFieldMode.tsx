import type { Component } from "solid-js";
import { action, useNavigate } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { Dialog } from "@kobalte/core";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { Show, createEffect, createSignal, onMount } from "solid-js";
import "~/styling/modal.css";
import * as togeojson from "@tmcw/togeojson";

// @ts-ignore
import * as turf from "@turf/turf";
// @ts-ignore
import type { Feature, Polygon, Properties } from "@turf/turf";
import "~/styling/modal.css";
import { updateArea, useDrawControl } from "~/util/map_controls/useDrawControl";
import type { IControl } from "maplibre-gl";
import { modes } from "~/routes/parcels/[parcelId]";
import { removeLayers } from "~/util/removeLayers";

export const AddFieldMode: Component<{
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
		addDrawControl();
	
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
		removeDrawControl();
		setMode(modes.default);
	});

	function drawFields() {
		cleanupLayers()
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

	function cleanupLayers(){
		removeDrawControl();
		removeFields();
	}

	createEffect(async () => {
		if (draw && fieldName() !== "") {

			const geometry = polygon()!.geometry;

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
	});

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
		} else {
			invalidFile();
		}
	}

	return (
		<>
			<div>
				<Dialog.Root open={modalOpen()}>
					<Dialog.Portal>
						<Dialog.Overlay class="dialog__overlay" />
						<div class="dialog__positioner">
							<Dialog.Content
								class="dialog__content"
								onPointerDownOutside={cancel}
							>
								<div class="dialog__header">
									<Dialog.Title class="dialog__title">Add field</Dialog.Title>
								</div>
								<Dialog.Description class="dialog__description">
									<div class="dialog__description__body">
										<input
											type="text"
											class="addFieldInput"
											name="layer[name]"
											placeholder="Name"
											onkeyup={(e)=>{
												setFieldName(e.target.value)
											}}
											required
											id="input"
										/>

										<label for="kmlfile" class="btn btn-dark">
											{kmlFile()?.name
												? `${kmlFile()?.name} (${
														polygon()?.geometry?.coordinates[0].length
													} coordinates)`
												: "Use geometry from KML file (Optional)"}
										</label>
										<input
											style="visibility:hidden;"
											type="file"
											onChange={parseKMLFile}
											name="kmlfile"
											id="kmlfile"
											title="KML File"
										/>

										<button
											type="button"
											// type="submit"
											// disabled={submitDisabled()}
											class="btn btn-dark center-block"
											onClick={continueFromModal}
											disabled={fieldName().length < 1}
										>
											Continue
										</button>
									</div>
									<Show when={error()}>
										<p>{error()}</p>
									</Show>
								</Dialog.Description>
							</Dialog.Content>
						</div>
					</Dialog.Portal>
				</Dialog.Root>
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
								class="btn btn-dark center-block"
								onClick={cancel}
							>
								Cancel
							</button>

							<button
								type="submit"
								disabled={submitDisabled()}
								class="btn btn-dark center-block"
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
				{/* <h1 class="addFieldModeDescription"> */}
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
					Click on the map to start drawing <br /> Click a point to select it,
					and press backspace to delete
				</h1>
			</Show>
		</>
	);
};
