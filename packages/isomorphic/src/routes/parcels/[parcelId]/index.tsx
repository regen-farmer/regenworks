import { useLocation } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	Show,
	onCleanup,
} from "solid-js";
import maplibregl from "maplibre-gl";
import type { IParcelSchema } from "@rw/db/schemas/parcel.ts";

import type * as turf from "@turf/turf";
import "maplibre-gl/dist/maplibre-gl.css";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { withinDKBBox } from "~/util/map_controls/within-dk-bbox.ts";
import { useHCControl } from "~/util/map_controls/useHCControl.ts";


import { useBSControl } from "~/util/map_controls/useBSControl.ts";
import { useMeasureControl } from "~/util/map_controls/useMeasureControl.ts";
import { Switch, Match } from "solid-js";
import DefaultMode from "~/components/parcel-view/DefaultMode.tsx";

import { createFarmMarkerIcon } from "~/components/Map.tsx";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";
import type { ILayerSchema } from "@rw/db/schemas/layer.ts";
import { EditFieldMode } from "~/components/parcel-view/EditFieldMode.tsx";

import type { FeatureCollection, Point } from "geojson";

export enum modes {
	default = 0,
	editField = 2,
}

	export default function view() {
	const params = useParams<{ parcelId: string }>();
	const [data, { refetch }] = createResource(
		() => params.parcelId,
		async (parcelId) => {
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/parcels/${parcelId}`,
				apiFetchOptions(),
			);
			return await response.json();
		}
	);

	const [mapref, setMapref] = createSignal<HTMLElement>();
	const [mode, setMode] = createSignal<modes>(modes.default);
	const [isMapReady, setIsMapReady] = createSignal<boolean>(false);

	let map: maplibregl.Map;
	let farmMarker: maplibregl.Marker | null = null;
	let mapInitialized = false;
	let currentParcelId: string | null = null;

	createEffect(() => {
		if (mapref() && !mapInitialized && data()?.parcel && (data()?.parcel as any)?._id === params.parcelId) {
			mapInitialized = true;
			currentParcelId = params.parcelId;
			const parcel = data()?.parcel!;

			map = new maplibregl.Map({
				container: mapref()!,
				attributionControl: false,
				style: GoogleSatStyle,
				center: [parcel.lng as number, parcel.lat as number],
				zoom: 12,
				maxZoom: 20,
			});

			setIsMapReady(true);

			const farmMarkerIcon = createFarmMarkerIcon();
			farmMarker = new maplibregl.Marker({ element: farmMarkerIcon })
				.setLngLat([parcel.lng as number, parcel.lat as number])
				.setPopup(
					new maplibregl.Popup({ closeOnClick: true, offset: [0, -40] })
						.setLngLat([parcel.lng as number, parcel.lat as number])
						.setHTML(`<strong><span style="color: black;">${parcel.name}</span></strong><br/><span style="color: black;">${parcel.location}</span><br />`),
				)
				.addTo(map);

			if (withinDKBBox(parcel.lng as number, parcel.lat as number)) {
				useHCControl(map);
				useBSControl(map);
			}

			const nav = new maplibregl.NavigationControl({
				showCompass: true,
				showZoom: true,
				visualizePitch: true
			});
			map.addControl(nav, "top-left");

			const scale = new maplibregl.ScaleControl({
				maxWidth: 100,
				unit: 'metric'
			});
			map.addControl(scale, 'bottom-left');
		}
	});

	createEffect(() => {
		const parcel = data()?.parcel;
		const _id = (parcel as any)?._id;
		if (isMapReady() && parcel && map && _id === params.parcelId) {
			if (currentParcelId && currentParcelId !== params.parcelId) {
				currentParcelId = params.parcelId;
				
				setTimeout(() => {
					map?.resize();
					map?.flyTo({
						center: [parcel.lng as number, parcel.lat as number],
						zoom: 12,
						duration: 500,
					});
				}, 50);

				if (farmMarker) {
					farmMarker.remove();
				}

				const farmMarkerIcon = createFarmMarkerIcon();
				farmMarker = new maplibregl.Marker({ element: farmMarkerIcon })
					.setLngLat([parcel.lng as number, parcel.lat as number])
					.setPopup(
						new maplibregl.Popup({ closeOnClick: true, offset: [0, -40] })
							.setLngLat([parcel.lng as number, parcel.lat as number])
							.setHTML(`<strong><span style="color: black;">${parcel.name}</span></strong><br/><span style="color: black;">${parcel.location}</span><br />`),
					)
					.addTo(map);
			}
		}
	});

	onCleanup(() => {
		if (map) {
			map.remove();
		}
	});

	function getMap() {
		return map;
	}

	const [editedField, setEditedField] = createSignal<ILayerSchema|null>(null);

	function editField(field: ILayerSchema){
		setEditedField(field);
		setMode(modes.editField)
	}

	function addField(){
		setEditedField(null);
		setMode(modes.editField)
	}

	return (
		<>
			<div
				id="map"
				ref={(r) => {
					setMapref(r);
				}}
				style="border:none; border-radius: unset; width: 100%; height: calc(100vh - 57px);"
			/>
			<Show when={data()?.parcel && isMapReady()}>
				<Switch>
					<Match when={mode() === modes.default}>
						<DefaultMode
							addField={addField}
							editField={editField}
							getMap={getMap}
							data={data}
							params={params}
							setMode={setMode}
							refetch={refetch}
						/>
					</Match>
					<Match when={mode() === modes.editField}>
						<EditFieldMode
							data={data}
							setMode={setMode}
							getMap={getMap}
							refetch={refetch}
							field={editedField()!}
						/>
					</Match>
				</Switch>
			</Show>
		</>
	);
}
