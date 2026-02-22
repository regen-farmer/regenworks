import { createEffect, createSignal, onCleanup } from "solid-js";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Resource } from "solid-js";
import maplibregl, { type LngLatLike } from "maplibre-gl";
import { modes } from "~/routes/index.tsx";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

export function createFarmMarkerIcon() {
	const el = document.createElement("div");
	el.className = "marker";
	el.style.backgroundImage = "url(/markers/farm-icon-250.png)";
	el.style.backgroundSize = "cover";
	el.style.width = "40px";
	el.style.height = "40px";
	el.style.marginTop = "-20px";

	return el;
}

type MapProps = {
	mode: () => modes;
	setParcelPayload: (prop: string, payload: any) => void;
	enterDefaultMode: () => void;
	coordinates: () => [number, number] | undefined;
	geocodingFailed: () => boolean;
	data: Resource<
		| {
				parcels: any[];
		  }
		| undefined
	>;
};

function MapInstance({
	data,
	mode,
	setParcelPayload,
	coordinates,
	geocodingFailed,
	enterDefaultMode,
}: MapProps) {
	const [mapref, setMapref] = createSignal<HTMLElement>();
	const [styleLoaded, setStyleLoaded] = createSignal<boolean>(false);
	let map: maplibregl.Map;
	const markers: maplibregl.Marker[] = [];

	createEffect(() => {
		map = new maplibregl.Map({
			container: mapref() as HTMLElement,
			attributionControl: false,
			style: GoogleSatStyle,
			center: [10.5, 56],
			zoom: 2,
			maxZoom: 20,
		});

		
		map.on("load", () => {
			setStyleLoaded(true);
			addMarkers();
		});

		onCleanup(() => {
			if (map) {
				map.remove();
			}
		});
	});

	createEffect(() => {
		if (mode() === modes.dragMode) {
			if (coordinates()) {
				map.flyTo({
					center: coordinates()!,
					zoom: 15,
				});
				activateDragMode(coordinates()!);
			} else if (geocodingFailed()) {
				// Geocoding failed - use map's current center and activate drag mode
				const center = map.getCenter();
				activateDragMode([center.lng, center.lat]);
			}
		}
		if (mode() === modes.default) {
			exitDragMode();
			enterDefaultMode();
		}
	});

	function activateDragMode(markerCoordinates: [number, number]) {
		if (map) {
			markers.map((marker) => {
				marker.remove();
			});
		}

		const marker = new maplibregl.Marker({
			draggable: true,
			element: createFarmMarkerIcon(),
		})
			.setLngLat(markerCoordinates as LngLatLike)
			.addTo(map);
		markers.push(marker);

		// Set initial coordinates in payload
		setParcelPayload("lat", markerCoordinates[1]);
		setParcelPayload("lng", markerCoordinates[0]);

		function onDragEnd() {
			const lngLat = marker.getLngLat();
			setParcelPayload("lat", lngLat.lat);
			setParcelPayload("lng", lngLat.lng);
		}

		marker.on("dragend", onDragEnd);
	}

	function exitDragMode() {
		if (map) {
			markers.map((marker) => {
				marker.remove();
			});
		}
		addMarkers();
	}

	function addMarkers() {
		data()?.parcels.map((parcel) => {
			const farmMarker = createFarmMarkerIcon();

			markers.push(
				new maplibregl.Marker({ element: farmMarker })
					.setLngLat([parcel.lng, parcel.lat])
					.setPopup(
						new maplibregl.Popup({ closeOnClick: true, offset: [0, -40] })
							.setLngLat([parcel.lng as number, parcel.lat as number])
							.setHTML(
								`
            <a href="/parcels/${parcel._id}" class="no-outline"><strong><span style="color: black;">${parcel.name}</span></strong></a><br/>
            <span style="color: black;">${parcel.location}</span><br />`,
							),
					)
					.addTo(map),
			);
		});
	}

	return (
		<>
			<div
				style={{
					border: "none",
					"border-radius": "unset",
					width: "100%",
					height: "calc(100vh - 57px)",
				}}
				ref={setMapref}
			/>
		</>
	);
}

export default MapInstance;
