import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
	helpers as turf,
} from "@turf/turf";

import {
	type Component,
	For,
	Show,
	createEffect,
	createSignal,
} from "solid-js";
import { useParams } from "@solidjs/router";
import { use3DControl } from "~/util/map_controls/use3DControl";
import { useBSControl } from "~/util/map_controls/useBSControl";
import { useHCControl } from "~/util/map_controls/useHCControl";
import { withinDKBBox } from "~/util/map_controls/within-dk-bbox";
import { systemBasedLayout } from "@rw/modelling/gis/system_based_layout";
import { MaptilerNavigationControl } from "@maptiler/sdk";
import { drawSystemDesign } from "~/components/systemDesigner/drawSystemDesign";
import { getSpecies } from "~/util/getSpecies";
import { getScenario } from "~/util/getScenario";
import { SystemInfoBox } from "~/components/systemDesigner/SystemInfoBox";
import { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout";

const RouteDesignPreview: Component = () => {
	const params = useParams();

	const species = getSpecies()

	const scenarioData = getScenario(params.scenarioId);

	const [systemLayout, setSystemLayout] = createSignal<ISystemBasedLayout>();

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
						<SystemInfoBox systemLayout={systemLayout()} species={species()} scenarioData={scenarioData()}/>
					</Show>
				</div>
			</div>
		</>
	);
};

export default RouteDesignPreview;
