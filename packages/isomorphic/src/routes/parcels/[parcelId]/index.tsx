import { useLocation } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	Show,
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
import { AddFieldMode } from "~/components/parcel-view/AddFieldMode.tsx";
import type { ILayerSchema } from "@rw/db/schemas/layer.ts";
import { EditFieldMode } from "~/components/parcel-view/EditFieldMode.tsx";

export enum modes {
	default = 0,
	addField = 1,
	editField = 2,
}

export default function view() {
	const params = useParams<{ parcelId: string }>();
	const [data, { refetch }] = createResource<{
		parcel: IParcelSchema;
		collection: turf.helpers.FeatureCollection<any, any>;
		places: turf.helpers.FeatureCollection<
			turf.helpers.Point,
			{
				description: string;
			}
		>;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/parcels/${params.parcelId}`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	createMemo(() => {
		refetch();
		return useLocation().pathname;
	});

	const [mapref, setMapref] = createSignal<HTMLElement>();

	const [mode, setMode] = createSignal<modes>(modes.default);
	const [styleLoaded, setStyleLoaded] = createSignal<boolean>(false);

	let map: maplibregl.Map;
	

	createEffect(() => {
		if (mapref() && !map) {
			
			map = new maplibregl.Map({
				container: mapref()!,
				attributionControl: false,
				style: GoogleSatStyle,
				center: [data()?.parcel.lng as number, data()?.parcel.lat as number],
				zoom: 12,
				maxZoom: 20,
			});

			map.on("load", () => {
			
				setStyleLoaded(true);

				if (
					withinDKBBox(
						data()?.parcel.lng as number,
						data()?.parcel.lat as number,
					)
				) {
					useHCControl(map);
					useBSControl(map);
					
					
				}

				const farmMarker = createFarmMarkerIcon();

				new maplibregl.Marker({ element: farmMarker })
					.setLngLat([
						data()?.parcel.lng as number,
						data()?.parcel.lat as number,
					])
					.setPopup(
						new maplibregl.Popup({ closeOnClick: true, offset: [0, -40] })
							.setLngLat([
								data()?.parcel.lng as number,
								data()?.parcel.lat as number,
							])
							.setHTML(
								`
            <strong><span style="color: black;">${data()?.parcel.name}</span></strong><br/>
            <span style="color: black;">${
							data()?.parcel.location
						}</span><br />`,
							),
					)
					.addTo(map);
			});
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


	return (
		<>
			<div
				id="map"
				ref={(r) => {
					setMapref(r);
				}}
				style="border:none; border-radius: unset; width: 100%; height: calc(100vh - 57px);"
			/>
			<Show when={data()?.parcel && styleLoaded()}>
				<Switch>
					<Match when={mode() === modes.default}>
						<DefaultMode
							editField={editField}
							getMap={getMap}
							data={data}
							params={params}
							setMode={setMode}
							refetch={refetch}
						/>
					</Match>
					<Match when={mode() === modes.addField}>
						<AddFieldMode
							data={data}
							setMode={setMode}
							getMap={getMap}
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
