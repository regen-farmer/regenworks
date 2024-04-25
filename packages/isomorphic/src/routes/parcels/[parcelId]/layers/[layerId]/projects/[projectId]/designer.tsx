import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	For,
	Show,
} from "solid-js";
import { createStore } from "solid-js/store";
import { A, useLocation, useParams } from "@solidjs/router";

import {
	helpers as turf,
	difference as turfDifference,
	area as turfArea,
} from "@turf/turf";

import { AddRow } from "~/components/systems/add-row";
import type { ISpeciesSchema, SpeciesDocument } from "@rw/db/schemas/species";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { useHCControl } from "~/util/map_controls/useHCControl";
import { useBSControl } from "~/util/map_controls/useBSControl";
import maplibregl from "maplibre-gl";
import type { ProjectDocument } from "@rw/db/schemas/project";

import { withinDKBBox } from "~/util/map_controls/within-dk-bbox";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ISystemDesignSchema } from "@rw/db/schemas/systemdesign";
import { featureCollection } from "@turf/turf";
import SplitView from "~/util/splitview/SplitView";
import { use3DControl } from "~/util/map_controls/use3DControl";
import { systemBasedLayout } from "@rw/modelling/gis/system_based_layout";
import { MaptilerNavigationControl } from "@maptiler/sdk";

export default function view() {
	const params = useParams<{
		projectId: string;
		parcelId: string;
		layerId: string;
	}>();

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

	const [system, setSystem] = createStore<ISystemDesignSchema>({
		rows: [],
		bearing: 0,
		margin: 0,
		headland: 0,
	});

	async function getSystemDesign() {
		const start = Date.now();

		setPreviewing(true);

		// On client
		const layout = systemBasedLayout(
			system,
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

		// On server
		// const response = await fetch(
		// 	`${import.meta.env.VITE_BACKEND_URL}/projects/${
		// 		params.projectId
		// 	}/preview`,
		// 	{
		// 		...apiFetchOptions(),
		// 		method: "POST",
		// 		body: JSON.stringify({
		// 			systemdesign: system,
		// 			geometry: scenarioData()?.project.layer.geometry,
		// 		}),
		// 	},
		// );

		// const result: {
		// 	// This is normally used
		// 	treeRowLines: any;
		// 	groundCoverAreas: any;
		// 	headlandSides: any;
		// 	marginPolygon: any;
		// 	headlandPolygon: any;
		// 	sidesCloseToBearing: any;
		// 	intersectionPoints: any;
		// 	treeMarkerArray: any;
		// 	speciesCountArray: any;
		// } = await response.json();

		// setSystemLayout(result);

		// Don't touch

		window.dispatchEvent(new Event("resize"));

		setPreviewing(false);

		const timeTaken = Date.now() - start;
		console.log(`Rendering in: ${timeTaken} milliseconds`);
	}

	const [scenarioData, { refetch: scenarioDataRefresh }] = createResource(
		async () => {
			console.log("Request to layoutData");
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/projects/${
					params.projectId
				}/layout`,
				apiFetchOptions(),
			);

			console.log("Response from layoutData");

			const result: {
				project: ProjectDocument;
			} = await response.json();

			if (result) {
				if (result?.project.systemdesign) {
					console.log("Update SYSTEM STORE", result?.project.systemdesign.rows);
					setSystem(result?.project.systemdesign!);
					// if (unwrap(result?.project.systemdesign) !== unwrap(system)) {
					// 	getSystemDesign();
					// }
				}
			}

			return result;
		},
	);

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

	createMemo(() => {
		scenarioDataRefresh();
		return useLocation().pathname;
	});

	const [mapLoaded, setMapLoaded] = createSignal<boolean>(false);

	// const [mapCameraState, setMapCameraState] = createSignal({})
	const mapCameraState = {};

	let map: maplibregl.Map;

	createEffect(() => {
		// console.log('Updateing map', rebuildMap())

		if (scenarioData()) {
			console.log("New layout data");

			if (!map) {
				const areaLat = scenarioData()?.project.layer.lat;
				const areaLng = scenarioData()?.project.layer.lng;

				map = new maplibregl.Map({
					container: "layerMapShow",
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
					window.dispatchEvent(new Event("resize"));

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

					const unparsedFieldPolygon: any =
						scenarioData()?.project.layer.geometry;
					const fieldPolygon = JSON.parse(
						unparsedFieldPolygon!.replace(/&#34;/g, '"'),
					);

					// var offset = layoutData()?.offset

					const fieldPolygonVisible = true;
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
								"fill-opacity": 0.5,
								"fill-outline-color": "#F0F8FF",
							},
						});
					}
				});

				// map.transformCameraUpdate = ({ center, zoom }) => {
				//   mapCameraState = {
				//     center,
				//     zoom,
				//     pitch: map.getPitch(),
				//     bearing: map.getBearing(),
				//   }

				//   return {}
				// }
			}
		}
	});

	function drawLayers() {
		if (mapLoaded() && systemLayout()) {
			console.log("Draw layers!");

			// const layerNames = ['correctgeometry', 'alleys', 'strips', 'col', 'trees']
			// layerNames.forEach((layerName) => {
			//   map.removeLayer(layerName)
			// })

			// var trees = layoutData()?.trees

			// var alleys = layoutData()?.alleys

			// var strips = layoutData()?.strips

			const debug = true;

			const stripsVisible = true;
			// const fieldPolygonVisible = true;

			const headlandBuffersVisible = false;
			const headlandIntersectionPointsVisible = false;
			const bearingSidesVisible = false;
			const treesVisible = true;
			const showHeadlandPolygonPoints = false;
			const treeRowsVisible = true;

			const treeRowLines = featureCollection(
				systemLayout()?.treeRowLines?.map((tree) => tree.line),
			);
			const groundCoverAreas = systemLayout()?.groundCoverAreas;
			const headlandSides = systemLayout()?.headlandSides;
			const headlandPolygon = systemLayout()?.headlandPolygon;
			const marginPolygon = systemLayout()?.marginPolygon;
			const sidesCloseToBearing = systemLayout()?.sidesCloseToBearing;
			const intersectionPoints = systemLayout()?.intersectionPoints;

			const treeMarkerArray = systemLayout()?.treeMarkerArray;

			const treeCircles = featureCollection(
				treeMarkerArray?.map((tree) => tree.circle),
			);

			console.log("speciesCountArray", systemLayout()?.speciesCountArray);

			// console.log("treeMarkerArray", treeMarkerArray);

			// var treeRowArray = layoutData()?.treeRowArray

			// if (map.getSource('alleys')) {
			//   map.removeLayer('alleys')
			//   map.removeSource('alleys')
			// }

			// map.addLayer({
			//   id: 'alleys',
			//   type: 'fill',
			//   //@ts-ignore
			//   source: {
			//     type: 'geojson',
			//     data: alleys,
			//   },
			//   layout: {},
			//   paint: {
			//     'fill-color': '#1EBEC8',
			//     'fill-opacity': 0.6,
			//     'fill-outline-color': '#F0F8FF',
			//   },
			// })

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
						"fill-opacity": 0.5,
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
	}

	createEffect(() => {
		if (mapLoaded() && scenarioData() && species()) {
			drawLayers();
		}
	});

	function logSystem() {
		// console.log(JSON.stringify(system))
	}

	const [saving, setSaving] = createSignal(false);
	const [previewing, setPreviewing] = createSignal(false);

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
		).toFixed(2);
	}

	async function saveSystem() {
		setSaving(true);

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/set-systemdesign`,
			{
				body: JSON.stringify(system),
				method: "put",
				...apiFetchOptions(),
			},
		);

		setSaving(false);

		scenarioDataRefresh();
	}

	return (
		<SplitView startPercent={50}>
			<div
				style={{
					display: "flex",

					"justify-content": "space-between",
					height: "calc(100vh - 57px)",
					flex: "1 0 auto",
				}}
			>
				<div
					style={{
						display: "flex",
						flex: "1 1 0%",
						"overflow-x": "hidden",
						"min-width": "500px",
						"flex-direction": "column",
					}}
				>
					<Show when={species() && scenarioData()}>
						{/* <form method="post" action={Form}> */}

						<>
							<div
								style={{
									display: "flex",
									"flex-direction": "column",
									"justify-content": "space-between",
									height: "100%",
								}}
							>
								<div style={{ overflow: "overlay", flex: "1 1 auto" }}>
									<div
										style={{
											display: "flex",
											"flex-direction": "row",
											"min-height": "100%",

											"padding-bottom": "20px",

											flex: 1,
										}}
									>
										<For each={system.rows}>
											{(row, rowIdx) => (
												<>
													<AddRow
														index={rowIdx()}
														setSystem={setSystem}
														logSystem={logSystem}
													/>

													<div
														style={{
															"min-width": "180px",
															flex: "0 0 0",
															display: "flex",
															"flex-direction": "column",
															"justify-content": "flex-end",
														}}
													>
														{row.sequence.length ? (
															<>
																<div
																	style={{
																		display: "flex",
																		"flex-direction": "column-reverse",
																	}}
																>
																	<div
																		class="form-group"
																		style={{
																			display: "flex",
																			"align-items": "center",
																			"justify-content": "space-between",
																		}}
																	>
																		<label>Offset</label>
																		<div
																			style={{
																				display: "flex",
																				"align-items": "center",
																			}}
																		>
																			<input
																				style={{ width: "75px" }}
																				type="number"
																				min={0}
																				class="form-control"
																				value={row.offset?.before}
																				onChange={(e) => {
																					setSystem(
																						"rows",
																						rowIdx(),
																						"offset",
																						(o) => {
																							o = { ...o };
																							o.before = Number.parseFloat(
																								e.target.value,
																							);
																							return o;
																						},
																					);

																					logSystem();
																				}}
																				required
																			/>
																			<span>m</span>
																		</div>
																	</div>

																	<button
																		class="btn btn-dark"
																		onclick={() => {
																			// console.log('test')
																			setSystem(
																				"rows",
																				rowIdx(),
																				"sequence",
																				(sequence) => {
																					const newSequence = [
																						{
																							species: undefined,
																							spacingAfter: 5,
																						},
																						...sequence,
																					];

																					// console.log(newRows)
																					return newSequence;
																				},
																			);
																			logSystem();
																		}}
																	>
																		<i class="fa-solid fa-plus" /> Add tree
																	</button>

																	<For each={row.sequence}>
																		{(sequence, sequenceIdx) => (
																			// <div class='card'>
																			//   <div class='card-body'>

																			<div
																				style={{
																					display: "flex",
																					"align-items": "center",
																					"margin-top": "10px",
																				}}
																			>
																				{/* <button
                                    class='btn btn-dark'
                                    onClick={() => {
                                      // setSystem('rows', (prev) => {
                                      //   const newRows = [...prev]
                                      //   newRows.splice(j(), 1)
                                      //   return newRows
                                      // })
                                    }}
                                  > */}
																				<i
																					onClick={() => {
																						setSystem(
																							"rows",
																							rowIdx(),
																							"sequence",
																							(sequence) => {
																								const newSequence = [
																									...sequence,
																								];
																								newSequence.splice(
																									sequenceIdx(),
																									1,
																								);
																								return newSequence;
																							},
																						);
																						logSystem();
																					}}
																					class="fa-solid fa-trash"
																				/>
																				{/* </button> */}

																				<div>
																					<div
																						style={{
																							display: "flex",
																							"align-items": "center",
																						}}
																					>
																						<i
																							class="fa-solid fa-arrows-up-down"
																							style={{
																								width: "20px",
																								"text-align": "center",
																							}}
																						/>
																						<input
																							style={{ width: "100%" }}
																							type="number"
																							min={0}
																							placeholder="Spacing (m)"
																							value={sequence.spacingAfter}
																							onChange={(e) => {
																								setSystem(
																									"rows",
																									rowIdx(),
																									"sequence",
																									sequenceIdx(),
																									(sequence) => {
																										sequence = { ...sequence };
																										sequence.spacingAfter =
																											Number.parseFloat(
																												e.target.value,
																											);
																										return sequence;
																									},
																								);
																								logSystem();
																							}}
																						/>
																					</div>
																					<div
																						style={{
																							display: "flex",
																							"margin-top": "10px",
																							"align-items": "center",
																						}}
																					>
																						<i
																							class="fa-solid fa-tree"
																							style={{
																								width: "20px",
																								"text-align": "center",
																							}}
																						/>
																						<select
																							style="width:100%;max-width:100%;"
																							value={sequence.species ?? ""}
																							onchange={(e) => {
																								setSystem(
																									"rows",
																									rowIdx(),
																									"sequence",
																									sequenceIdx(),
																									"species",
																									(species) => {
																										species = e.target.value;
																										return species;
																									},
																								);

																								logSystem();
																							}}
																						>
																							<option value="">none</option>
																							<For
																								each={species()?.species.filter(
																									(species: ISpeciesSchema) =>
																										!["herb", "grass"].includes(
																											species.form,
																										),
																								)}
																							>
																								{(species) => (
																									<option value={species._id}>
																										{species.nameCommon}
																									</option>
																								)}
																							</For>
																						</select>
																					</div>
																				</div>
																			</div>
																		)}
																	</For>

																	<button
																		class="btn btn-dark"
																		onclick={() => {
																			// console.log('test')
																			setSystem(
																				"rows",
																				rowIdx(),
																				"sequence",
																				(sequence) => {
																					const newSequence = [
																						...sequence,
																						{
																							species: undefined,
																							spacingAfter: 5,
																						},
																					];

																					// console.log(newRows)
																					return newSequence;
																				},
																			);
																			logSystem();
																		}}
																	>
																		<i class="fa-solid fa-plus" /> Add tree
																	</button>

																	<div
																		class="form-group"
																		style={{
																			display: "flex",
																			"align-items": "center",
																			"justify-content": "space-between",
																		}}
																	>
																		<label>Offset</label>
																		<div
																			style={{
																				display: "flex",
																				"align-items": "center",
																			}}
																		>
																			<input
																				style={{ width: "75px" }}
																				type="number"
																				min={0}
																				class="form-control"
																				value={row.offset?.after}
																				onChange={(e) => {
																					setSystem(
																						"rows",
																						rowIdx(),
																						"offset",
																						(o) => {
																							o = { ...o };
																							o.after = Number.parseFloat(
																								e.target.value,
																							);
																							return o;
																						},
																					);

																					logSystem();
																				}}
																				required
																			/>
																			<span>m</span>
																		</div>
																	</div>
																</div>
															</>
														) : (
															<button
																class="btn btn-dark"
																onclick={() => {
																	// console.log('test')
																	setSystem(
																		"rows",
																		rowIdx(),
																		"sequence",
																		(sequence) => {
																			const newSequence = [
																				...sequence,
																				{
																					species: undefined,
																					spacingAfter: 5,
																				},
																			];
																			return newSequence;
																		},
																	);
																	logSystem();
																}}
															>
																Define tree sequence
															</button>
														)}

														<hr />

														<span>Ground cover</span>

														<select
															style="width:100%;max-width:100%;"
															value={row.groundcover ?? ""}
															onchange={(e) => {
																setSystem(
																	"rows",
																	rowIdx(),
																	"groundcover",
																	(gc) => {
																		gc = e.target.value;
																		return gc;
																	},
																);

																logSystem();
															}}
														>
															<option value="">none</option>
															<For
																each={species()?.species.filter(
																	(species: ISpeciesSchema) =>
																		["herb", "grass"].includes(species.form),
																)}
															>
																{(species) => (
																	<option value={species._id}>
																		{species.nameCommon}
																	</option>
																)}
															</For>
														</select>

														<br />

														<div
															class="form-group"
															style={{
																display: "flex",
																"align-items": "center",
																"justify-content": "space-between",
															}}
														>
															<label>Row width</label>
															<div
																style={{
																	display: "flex",
																	"align-items": "center",
																}}
															>
																<input
																	style={{ width: "75px" }}
																	type="number"
																	min={0}
																	class="form-control"
																	placeholder="Width"
																	value={row.width}
																	onChange={(e) => {
																		setSystem(
																			"rows",
																			rowIdx(),
																			"width",
																			(width) => {
																				width = Number.parseFloat(
																					e.target.value,
																				);
																				return width;
																			},
																		);

																		logSystem();
																	}}
																	required
																/>
																<span>m</span>
															</div>
														</div>

														<br />

														<div
															style={{
																display: "flex",
																"flex-direction": "column",
																"align-items": "center",
															}}
														>
															<p>{rowIdx() + 1}. Row</p>

															<button
																class="btn btn-dark"
																onClick={() => {
																	setSystem("rows", (prev) => {
																		const newRows = [...prev];
																		newRows.splice(rowIdx(), 1);
																		return newRows;
																	});
																	logSystem();
																}}
															>
																<i class="fa-solid fa-trash" />
															</button>
														</div>
													</div>
												</>
											)}
										</For>
										<AddRow
											index={system.rows.length}
											setSystem={setSystem}
											logSystem={logSystem}
										/>
									</div>
								</div>

								<div>
									<div
										style={{
											display: "flex",
											"justify-content": "space-between",
											padding: "0 0 0 10px",
											"border-top": "1px solid #555",
										}}
									>
										<A
											end={true}
											href={`/parcels/${params.parcelId}/layers/${
												params.layerId
											}/projects/${scenarioData()?.project._id}`}
											class="btn btn-dark"
										>
											<i class="fas fa-arrow-left" /> Back to scenario dashboard
										</A>

										<div class="form-group">
											<button
												// disabled={submitDisabled()}
												type="submit"
												class="btn btn-dark"
												onclick={saveSystem}
												disabled={saving()}
											>
												Save system design
											</button>
											<button
												// disabled={submitDisabled()}
												type="submit"
												class="btn btn-dark"
												onclick={getSystemDesign}
												disabled={previewing()}
											>
												Generate preview
											</button>
										</div>

										{/* <div class='form-group'>
                    <button
                      // disabled={submitDisabled()}
                      type='submit'
                      class='btn btn-dark'
                    >
                      Preview
                    </button>
                  </div> */}
									</div>
								</div>
							</div>
						</>
						{/* </form> */}
					</Show>
				</div>
			</div>
			<Show when={scenarioData()}>
				<div style={{ height: "100%", position: "relative", flex: "1 1 100%" }}>
					<div style={{ height: "100%" }}>
						<div id="layerMapShow" style={{ height: "100%", width: "100%" }} />

						<div
							style={{
								background: "#151515dd",
								"border-radius": "10px",
								position: "absolute",
								"z-index": 10,
								color: "white",
								right: "10px",
								bottom: "10px",
								padding: "10px",
							}}
						>
							<strong>
								<span>Change parameters:</span>
							</strong>
							{/* 
              <div class='form-group'>
                <label>Layout type</label>
                <select
                  class='form-control'
                  value={systemData()?.systemdesign?.layout}
                  onchange={(e) => {
                    setSystem('layout', e.target.value)
                    logSystem()
                  }}
                >
                  <option value='straight'>Straight rows</option>
                </select>
              </div>
              <div class='form-group'>
                <label>Alignment</label>
                <select
                  class='form-control'
                  value={systemData()?.systemdesign?.alignment}
                  onchange={(e) => {
                    setSystem('alignment', e.target.value)
                    logSystem()
                  }}
                >
                 
                  <option value='north'>North/south</option>
                  <option value='west'>West/East</option>
                </select>
              </div> */}

							<div class="form-group">
								<label>Bearing</label>
								<input
									type="number"
									min={0}
									class="form-control"
									onchange={(e) => {
										setSystem("bearing", Number.parseFloat(e.target.value));
										logSystem();
									}}
									value={scenarioData()?.project.systemdesign?.bearing ?? 0}
								/>
							</div>

							<div class="form-group">
								<label>Margin</label>
								<input
									type="number"
									min={0}
									class="form-control"
									onchange={(e) => {
										setSystem("margin", Number.parseFloat(e.target.value));
										logSystem();
									}}
									value={scenarioData()?.project.systemdesign?.margin ?? 0}
								/>
							</div>

							<div class="form-group">
								<label>Headland</label>
								<input
									type="number"
									min={0}
									class="form-control"
									onchange={(e) => {
										setSystem("headland", Number.parseFloat(e.target.value));
										logSystem();
									}}
									value={scenarioData()?.project?.systemdesign?.headland ?? 0}
								/>
							</div>
						</div>

						{systemLayout() ? (
							<div
								style={{
									color: "white",
									position: "absolute",
									padding: "10px",
									background: "#151515dd",
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
															{species()?.speciesById.get(speciesEl).nameCommon}
															:{" "}
															{`${(
																Number.parseFloat(
																	systemLayout()?.groundCoverAreasM2[speciesEl],
																) / 10000
															).toFixed(2)} ha (${groundCoverPercentage(
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
								{(system.headland > 0 || system.margin > 0) &&
								calculateMarginHeadlandArea() > 10 ? (
									<>
										<strong>
											<span>Margin & headland:</span>
										</strong>
										<br />
										{`${(calculateMarginHeadlandArea() / 10000).toFixed(2)} ha`}
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
								).toFixed(2)} ha`}
							</div>
						) : (
							<></>
						)}
					</div>
				</div>
			</Show>
		</SplitView>
	);
}
