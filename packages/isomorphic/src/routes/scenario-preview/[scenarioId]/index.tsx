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
	});

	createEffect(() => {
		if (mapLoaded() && systemLayout()) {
			drawSystemDesign(map, systemLayout()!);
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
