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
import type { IParcelSchema } from "@rw/db/schemas/parcel";

import type * as turf from "@turf/turf";
import "maplibre-gl/dist/maplibre-gl.css";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { withinDKBBox } from "~/util/map_controls/within-dk-bbox";
import { useHCControl } from "~/util/map_controls/useHCControl";
import { useBSControl } from "~/util/map_controls/useBSControl";
import { Switch, Match } from "solid-js";
import DefaultMode from "~/components/parcel-view/DefaultMode";

//import from public
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { createFarmMarkerIcon } from "~/components/Map";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style";
import { AddFieldMode } from "~/components/parcel-view/AddFieldMode";

export enum modes {
	default=0,
	addField=1,
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

	const [styleLoaded, setStyleLoaded] = createSignal<boolean>(false);

	const [mode, setMode] = createSignal<modes>(modes.default);

	
	let map: maplibregl.Map;
	let draw: MapboxDraw;

	
	

	function enterAddFieldMode(e: any) {
		setMode(modes.addField);
	}

	function enterDefaultMode(cancelled: boolean) {
		setMode(modes.default);

		
		

		console.log("Set mode Default");
		setMode(modes.default);
	}



	createEffect(() => {
		if (mapref()) {
			console.log("mapref() && data()");
			if (map) {
				map.remove();
			}
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
				

				// map.addControl(new maplibregl.FullscreenControl({}))
				// map.addControl(new AddFieldControl())

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
	

	return (
		<>
			

			<Show when={data()?.parcel}>
				{/* <h1>{data()?.parcel.name}</h1> */}
				{/* <p>{data()?.parcel.description}</p> */}

				{/* <p>
          <i class='fas fa-map-marker' /> {data()?.parcel.location}
        </p> */}
				{/* <p>
							<strong>Farm size:</strong> {data()?.parcel.size} hectare(s)
						</p>
						<p>
							<strong>Soil type:</strong> {data()?.parcel.soilType}
						</p> */}

				{/* {mongoDBDBUser() && data()?.parcel.owner.id === mongoDBDBUser()._id ? (
          <A
            class='btn btn-dark'
            href={`/parcels/${data()?.parcel._id}/edit`}
          >
            Edit farm details
          </A>
        ) : (
          
        )} */}

				{/* <br />
        <br /> */}
				{/* <div class='embed-responsive'> */}
				<Switch>
					<Match when={mode() === modes.default}>
						<DefaultMode
							getMap={getMap}
							data={data}
							params={params}
							enterAddFieldMode={enterAddFieldMode}
						/>
					</Match>
					<Match when={mode() === modes.addField}>
						<AddFieldMode
							data={data}
							setMode={setMode}
							getMap={getMap}
						/>
					</Match>
				</Switch>
				

				<div
					id="map"
					ref={(r) => {
						setMapref(r);
					}}
					style="border:none; border-radius: unset; width: 100%; height: calc(100vh - 57px);"
				/>
				{/* </div> */}
			</Show>
		</>
	);
}
