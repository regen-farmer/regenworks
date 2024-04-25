import { featureCollection } from "@turf/turf";
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
			console.log("DRAW");
			const debug = true;

			const stripsVisible = true;
			const fieldPolygonVisible = true;
			const headlandBuffersVisible = false;
			const headlandIntersectionPointsVisible = false;
			const bearingSidesVisible = false;
			const treesVisible = true;
			const showHeadlandPolygonPoints = false;
			const treeRowsVisible = true;

			const treeRowLines = featureCollection(
				systemLayout()?.treeRowLines?.map((tree: any) => tree.line),
			);
			const groundCoverAreas = systemLayout()?.groundCoverAreas;
			const headlandSides = systemLayout()?.headlandSides;
			const headlandPolygon = systemLayout()?.headlandPolygon;
			const marginPolygon = systemLayout()?.marginPolygon;
			const sidesCloseToBearing = systemLayout()?.sidesCloseToBearing;
			const intersectionPoints = systemLayout()?.intersectionPoints;

			const treeMarkerArray = systemLayout()?.treeMarkerArray;

			const treeCircles = featureCollection(
				treeMarkerArray?.map((tree: any) => tree.circle),
			);

			// console.log("speciesCountArray", systemLayout()?.speciesCountArray);

			// console.log("treeMarkerArray", treeMarkerArray);

			// var treeRowArray = systemLayout()?.treeRowArray

			const unparsedFieldPolygon: any = scenarioData()?.project.layer.geometry;
			const fieldPolygon = JSON.parse(
				unparsedFieldPolygon!.replace(/&#34;/g, '"'),
			);

			// var offset = systemLayout()?.offset

			if (fieldPolygonVisible) {
				if (map.getSource("fieldPolygon")) {
					map.removeLayer("fieldPolygon");
					map.removeSource("fieldPolygon");
				}

				map.addLayer({
					id: "fieldPolygon",
					type: "fill",
					//@ts-ignore
					source: {
						type: "geojson",
						data: {
							type: "Feature",
							geometry: {
								type: "Polygon",
								coordinates: fieldPolygon.geometry.coordinates,
							},
						},
					},
					layout: {},
					paint: {
						"fill-color": "#b4aab4",
						"fill-opacity": 0.8,
						"fill-outline-color": "#F0F8FF",
					},
				});
			}

			if (stripsVisible) {
				if (map.getSource("strips")) {
					map.removeLayer("strips");
					map.removeSource("strips");
				}

				map.addLayer({
					id: "strips",
					type: "fill",
					//@ts-ignore
					source: {
						type: "geojson",
						data: groundCoverAreas,
					},
					layout: {},
					paint: {
						"fill-color": "#002eff",
						"fill-opacity": 0.6,
					},
				});

				if (map.getSource("strips-border")) {
					map.removeLayer("strips-border");
					map.removeSource("strips-border");
				}

				map.addLayer({
					id: "strips-border",
					type: "line",
					//@ts-ignore
					source: {
						type: "geojson",
						data: groundCoverAreas,
					},
					layout: {},
					paint: {
						"line-color": "rgba(255,255,255,1)",
						"line-width": 1,
					},
				});

				if (showHeadlandPolygonPoints) {
					if (map.getSource("strips-points")) {
						map.removeLayer("strips-points");
						map.removeSource("strips-points");
					}

					map.addLayer({
						id: "strips-points",
						type: "circle",
						//@ts-ignore
						source: {
							type: "geojson",
							data: headlandPolygon,
						},
						layout: {},
						paint: {
							"circle-color": "rgba(255,255,255,1)",
							"circle-stroke-width": 1,
						},
					});
				}
			}

			if (headlandBuffersVisible) {
				if (map.getSource("headland-sides")) {
					map.removeLayer("headland-sides");
					map.removeSource("headland-sides");
				}
				map.addLayer({
					id: "headland-sides",
					type: "line",
					//@ts-ignore
					source: {
						type: "geojson",
						data: headlandSides,
					},
					layout: {},
					paint: {
						"line-color": "rgba(255,0,0,1)",
						"line-width": 2,
					},
				});
			}

			if (debug) {
				if (map.getSource("margin-polygon")) {
					map.removeLayer("margin-polygon");
					map.removeSource("margin-polygon");
				}
				map.addLayer({
					id: "margin-polygon",
					type: "line",
					//@ts-ignore
					source: {
						type: "geojson",
						data: marginPolygon,
					},
					layout: {},
					paint: {
						"line-color": "rgba(255,255,255,1)",
						"line-width": 2,
					},
				});
			}

			if (map.getSource("headland-polygon")) {
				map.removeLayer("headland-polygon");
				map.removeSource("headland-polygon");
			}
			map.addLayer({
				id: "headland-polygon",
				type: "line",
				//@ts-ignore
				source: {
					type: "geojson",
					data: headlandPolygon,
				},
				layout: {},
				paint: {
					"line-color": "rgba(255,255,0,1)",
					"line-width": 2,
				},
			});

			if (bearingSidesVisible) {
				if (map.getSource("bearing-sides")) {
					map.removeLayer("bearing-sides");
					map.removeSource("bearing-sides");
				}
				map.addLayer({
					id: "bearing-sides",
					type: "line",
					//@ts-ignore
					source: {
						type: "geojson",
						data: sidesCloseToBearing,
					},
					layout: {},
					paint: {
						"line-color": "rgba(255,0,255,1)",
						"line-width": 2,
					},
				});
			}

			if (headlandIntersectionPointsVisible) {
				if (map.getSource("headland-intersection-points")) {
					map.removeLayer("headland-intersection-points");
					map.removeSource("headland-intersection-points");
				}

				console.log(intersectionPoints);
				map.addLayer({
					id: "headland-intersection-points",
					type: "circle",
					//@ts-ignore
					source: {
						type: "geojson",
						data: intersectionPoints,
					},
					layout: {},
					paint: {
						"circle-color": "rgba(255,255,255,1)",
						"circle-radius": 3,
						"circle-stroke-width": 1,
						"circle-stroke-color": "rgba(0,0,0,1)",
					},
				});
			}

			if (treeRowsVisible) {
				if (map.getSource("treeRowLines")) {
					map.removeLayer("treeRowLines");
					map.removeSource("treeRowLines");
				}

				map.addLayer({
					id: "treeRowLines",
					type: "line",
					//@ts-ignore
					source: {
						type: "geojson",
						data: treeRowLines,
					},
					layout: {},
					paint: {
						"line-color": "rgba(255,255,255,0.6)",
						"line-dasharray": [2, 4],
						"line-width": 1,
					},
				});
			}
			if (treesVisible) {
				if (map.getSource("trees")) {
					map.removeLayer("trees");
					map.removeSource("trees");
				}

				map.addLayer({
					id: "trees",
					type: "fill",
					//@ts-ignore
					source: {
						type: "geojson",
						data: treeCircles,
					},
					layout: {},
					paint: {
						"fill-color": "#7eff36",
						"fill-opacity": 0.8,
						"fill-outline-color": "#F0F8FF",
					},
				});
			}
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

	function fieldArea(geometry: string): number{
		return turfArea(JSON.parse(geometry))
	}

	function groundCoverPercentage(groundCoverArea: string, fieldGeometry: string): string{
		return ((Number.parseFloat(groundCoverArea)/fieldArea(fieldGeometry))*100).toFixed(2)
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


							{Object.keys(systemLayout()?.groundCoverAreasM2).length > 0 ? <>
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
													{`${Number.parseFloat(
														systemLayout()?.groundCoverAreasM2[speciesEl],
													).toFixed(2)} m2 (${groundCoverPercentage(systemLayout()?.groundCoverAreasM2[speciesEl], scenarioData()?.project.layer.geometry)}%)`}
													
												</span>
												<br />
											</>
										);
									}}
								</For>
								</>:<></>}
								{(scenarioData()?.project.systemdesign.headland > 0 || scenarioData()?.project.systemdesign.margin > 0) && calculateMarginHeadlandArea() > 10 ? (
									<>
										<strong>
											<span>Margin & headland:</span>
										</strong>
										<br />
										{calculateMarginHeadlandArea().toFixed(2)} m2
										<br />
									</>
								) : (
									<></>
								)}
							
							<strong>
								<span>Field area:</span>
							</strong>
							<br />
							{fieldArea(scenarioData()?.project.layer.geometry).toFixed(2)} m2



						</div>
					</Show>
				</div>
			</div>
		</>
	);
};

export default RouteDesignPreview;
