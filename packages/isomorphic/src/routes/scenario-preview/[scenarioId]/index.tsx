import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
	type Component,
	For,
	Show,
	createEffect,
	createSignal,
	createMemo,
} from "solid-js";
import { useParams } from "@solidjs/router";
import { use3DControl } from "~/util/map_controls/use3DControl.ts";
import { useBSControl } from "~/util/map_controls/useBSControl.ts";
import { useHCControl } from "~/util/map_controls/useHCControl.ts";
import { withinDKBBox } from "~/util/map_controls/within-dk-bbox.ts";
import { systemBasedLayout } from "@rw/modelling/gis/system_based_layout.ts";
import { MaptilerNavigationControl } from "@maptiler/sdk";
import { drawSystemDesign } from "~/components/systemDesigner/drawSystemDesign.ts";
import { getSpecies } from "~/util/getSpecies.ts";
import { getScenario } from "~/util/getScenario.ts";
import { SystemInfoBox } from "~/components/systemDesigner/SystemInfoBox.tsx";
import type { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

const RouteDesignPreview: Component = () => {
	const params = useParams();

	const species = getSpecies();
	const [mapLoaded, setMapLoaded] = createSignal<boolean>(false);
	const [show3D, setShow3D] = createSignal(false);

	const scenarioData = getScenario(params.scenarioId);

	const systemLayout = createMemo<ISystemBasedLayout | undefined>(() => {
		if (scenarioData()) {
			return systemBasedLayout(
				scenarioData()?.project.systemdesign,
				scenarioData()?.project.layer.geometry,
			);
		}
	});

	// const [mapCameraState, setMapCameraState] = createSignal({})
	const mapCameraState = {};

	let map: maplibregl.Map;
	const [mapRef, setMapRef] = createSignal<HTMLElement>();

	createEffect(() => {
		if (scenarioData()?.project && mapRef() && !map) {
			const areaLat = scenarioData()?.project.layer.lat;
			const areaLng = scenarioData()?.project.layer.lng;

			map = new maplibregl.Map({
				container: mapRef()!,
				attributionControl: false,
				style: GoogleSatStyle,
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

				// Use the 3D control and sync with our local signal
				const { show3D: controlShow3D } = use3DControl(map, systemLayout, species);
				
				// Sync the control's signal with our local one
				createEffect(() => {
					const is3D = controlShow3D();
					setShow3D(is3D);
					// Redraw the system design when 3D mode changes
					if (systemLayout()) {
						drawSystemDesign(map, systemLayout()!, is3D);
					}
				});

				if (withinDKBBox(areaLng!, areaLat!)) {
					useHCControl(map);
					useBSControl(map);
				}

				const nav = new MaptilerNavigationControl();
				map.addControl(nav, "top-right");


				const unparsedFieldPolygon: any = scenarioData()?.project.layer.geometry;
				const fieldPolygon = JSON.parse(
					unparsedFieldPolygon!.replace(/&#34;/g, '"')
				);

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
								properties: {}
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


				setMapLoaded(true);
			});
		}
	});

	createEffect(() => {
		if (mapLoaded() && systemLayout()) {
			drawSystemDesign(map, systemLayout()!, show3D());

			try {
				const style = map.getStyle();
				if (style && style.layers) {
					const target = style.layers.find((l: any) =>
						l.id.startsWith("strips-") ||
						l.id.startsWith("trees-") ||
						l.id === "treeRowLines" ||
						l.id === "row-labels"
					);
					if (target && map.getLayer("fieldPolygon")) {
						map.moveLayer("fieldPolygon", target.id);
					}
				}
			} catch {}
		}
	});

	return (
		<div style={{ height: "100vh", position: "relative", flex: "1 1 100%" }}>
			<div style={{ height: "100vh" }}>
				<div
					ref={(el) => {
						setMapRef(el);
					}}
					style={{ height: "100vh" }}
				/>

				<Show
					when={scenarioData() && systemLayout() && species()}
					fallback={"Loading..."}
				>
					<SystemInfoBox
						systemLayout={systemLayout()!}
						species={species()}
						scenarioData={scenarioData()}
					/>
				</Show>
			</div>
		</div>
	);
};

export default RouteDesignPreview;
