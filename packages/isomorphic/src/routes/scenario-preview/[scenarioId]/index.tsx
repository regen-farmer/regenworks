import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
	helpers as turf,
	difference as turfDifference,
	area as turfArea,
} from "@turf/turf";

import {
	type Component,
	For,
	Show,
	createEffect,
	createSignal,
	createResource,
} from "solid-js";
import { useParams } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { use3DControl } from "~/util/map_controls/use3DControl";
import { useBSControl } from "~/util/map_controls/useBSControl";
import { useHCControl } from "~/util/map_controls/useHCControl";
import { withinDKBBox } from "~/util/map_controls/within-dk-bbox";
import type { SpeciesDocument } from "@rw/db/schemas/species";
import { systemBasedLayout } from "@rw/modelling/gis/system_based_layout";
import type { ProjectDocument } from "@rw/db/schemas/project";
import { MaptilerNavigationControl } from "@maptiler/sdk";
import { drawSystemDesign } from "~/components/systemDesigner/drawSystemDesign";

const RouteDesignPreview: Component = () => {
	const params = useParams();

	const [species, { refetch: speciesRefresh }] = createResource<{
		species: SpeciesDocument[];
		speciesById: Map<string, SpeciesDocument>;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/species`,
			apiFetchOptions(),
		);

		const result = await response.json();

		result.speciesById = new Map<string, any>(
			result.species.map((species) => [species._id, species]),
		);

		return result;
	});

	const [scenarioData, { refetch: scenarioDataRefresh }] = createResource(
		async () => {
			console.log("Request to layoutData");
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/projects/${
					params.scenarioId
				}/layout`,
				apiFetchOptions(),
			);

			const result: {
				project: ProjectDocument;
			} = await response.json();
			return result;
		},
	);

	const [systemLayout, setSystemLayout] = createSignal<{
		treeRowLines: any;
		groundCoverAreas: any;
		headlandSides: any;
		marginPolygon: any;
		headlandPolygon: any;
		sidesCloseToBearing: any;
		intersectionPoints: any;
		treeMarkerArray: any;
		speciesCountArray: any;
		groundCoverAreasM2: any;
	}>();

	async function getSystemDesign() {
		const layout = systemBasedLayout(
			scenarioData()?.project.systemdesign,
			scenarioData()?.project.layer.geometry,
		);

		setSystemLayout({
			treeRowLines: layout.treeRowLines,
			groundCoverAreas: turf.featureCollection(layout.groundCoverAreas),
			headlandPolygon: layout.headlandPolygon,
			marginPolygon: layout.marginPolygon,
			speciesCountArray: layout.speciesCountArray,

			sidesCloseToBearing: turf.featureCollection(layout.sidesCloseToBearing),
			intersectionPoints: turf.featureCollection(layout.intersectionPoints),
			headlandSides: turf.featureCollection(layout.headlandSides),
			treeMarkerArray: layout.treeMarkerArray,
			groundCoverAreasM2: layout.groundCoverAreasM2,
		});
	}

	const [mapLoaded, setMapLoaded] = createSignal<boolean>(false);

	// const [mapCameraState, setMapCameraState] = createSignal({})
	const mapCameraState = {};

	let map: maplibregl.Map;
	const [mapRef, setMapRef] = createSignal<HTMLElement>();

	createEffect(() => {
		console.log("Checking for new data");
		// console.log('Updateing map', rebuildMap())

		console.log("checking");
		if (scenarioData()?.project) {
			console.log("New layout data");

			if (!map) {
				const areaLat = scenarioData()?.project.layer.lat;
				const areaLng = scenarioData()?.project.layer.lng;

				if (mapRef()) {
					map = new maplibregl.Map({
						container: mapRef()!,
						attributionControl: false,
						antialias: true,
						style: {
							version: 8,
							sources: {
								"raster-tiles": {
									type: "raster",
									tiles: [
										"https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
										"https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
										"https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
										"https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
									],
									tileSize: 256,
								},
							},
							layers: [
								{
									id: "simple-tiles",
									type: "raster",
									source: "raster-tiles",
									minzoom: 0,
									maxzoom: 21,
								},
							],
						},
						center: [areaLng!, areaLat!],
						zoom: 16,
						maxZoom: 20,
						pitch: 0,

						...mapCameraState,
						// bearing: 40,
						// maxPitch: 85,
					});

					map.on("load", () => {
						const areaLat = scenarioData()?.project.layer.lat;
						const areaLng = scenarioData()?.project.layer.lng;

						use3DControl(map, systemLayout, species);

						if (withinDKBBox(areaLng!, areaLat!)) {
							useHCControl(map);
							useBSControl(map);
						}

						const nav = new MaptilerNavigationControl();
						map.addControl(nav, "top-right");

						setMapLoaded(true);
					});
				}
			}
		}
	});

	createEffect(() => {
		if (mapLoaded() && scenarioData()) {
			getSystemDesign();
		}
	});

	createEffect(() => {
		if (mapLoaded() && systemLayout()) {
			drawSystemDesign(map, systemLayout())
		}
	});

	function calculateMarginHeadlandArea(): number {
		const geometry = turfDifference(
			JSON.parse(scenarioData()?.project.layer.geometry),
			systemLayout()?.headlandPolygon,
		);

		const area = parseFloat(turfArea(geometry));

		return area;
	}

	function fieldArea(geometry: string): number {
		return turfArea(JSON.parse(geometry));
	}

	function groundCoverPercentage(
		groundCoverArea: string,
		fieldGeometry: string,
	): string {
		return (
			(Number.parseFloat(groundCoverArea) / fieldArea(fieldGeometry)) *
			100
		).toFixed(2).replace(".", ",");
	}

	return (
		<>
			<div style={{ height: "100vh", position: "relative", flex: "1 1 100%" }}>
				<div style={{ height: "100vh" }}>
					<div
						ref={(el) => {
							setMapRef(el);
						}}
						style={{ height: "100vh" }}
					/>

					<Show when={systemLayout()} fallback={"Loading..."}>
						<div
							style={{
								color: "white",
								position: "absolute",
								padding: "10px",
								background: "rgba(0,0,0,0.4)",
								"border-radius": "10px",
								"z-index": 10,
								left: "10px",
								bottom: "10px",
							}}
						>
							<strong>
								<span>Tree and shrub counts:</span>
							</strong>
							<br />

							<For each={systemLayout()?.speciesCountArray}>
								{(speciesEl) => {
									// console.log("species", systemDesignData()?.species);
									return (
										<>
											<span>
												{
													species()?.speciesById.get(speciesEl.species)
														.nameCommon
												}
												: {speciesEl.count}
											</span>
											<br />
										</>
									);
								}}
							</For>

							{Object.keys(systemLayout()?.groundCoverAreasM2).length > 0 ? (
								<>
									<strong>
										<span>Ground cover:</span>
									</strong>
									<br />
									<For each={Object.keys(systemLayout()?.groundCoverAreasM2)}>
										{(speciesEl) => {
											console.log("groundcover", speciesEl);
											return (
												<>
													<span>
														{species()?.speciesById.get(speciesEl).nameCommon}:{" "}
														{`${(
															Number.parseFloat(
																systemLayout()?.groundCoverAreasM2[speciesEl],
															) / 10000
														).toFixed(2).replace(".", ",")} ha (${groundCoverPercentage(
															systemLayout()?.groundCoverAreasM2[speciesEl],
															scenarioData()?.project.layer.geometry,
														)}%)`}
													</span>
													<br />
												</>
											);
										}}
									</For>
								</>
							) : (
								<></>
							)}
							{(scenarioData()?.project.systemdesign.headland > 0 ||
								scenarioData()?.project.systemdesign.margin > 0) &&
							calculateMarginHeadlandArea() > 10 ? (
								<>
									<strong>
										<span>Margin & headland:</span>
									</strong>
									<br />
									{`${(calculateMarginHeadlandArea() / 10000).toFixed(2).replace(".", ",")} ha`}
									<br />
								</>
							) : (
								<></>
							)}

							<strong>
								<span>Field area:</span>
							</strong>
							<br />
							{`${(
								fieldArea(scenarioData()?.project.layer.geometry) / 10000
							).toFixed(2).replace(".", ",")} ha`}
						</div>
					</Show>
				</div>
			</div>
		</>
	);
};

export default RouteDesignPreview;
