import { useLocation, useNavigate } from "@solidjs/router";
import { useParams } from "@solidjs/router";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	Show,
} from "solid-js";
import maplibregl, { type IControl } from "maplibre-gl";
import type { IParcelSchema } from "@rw/db/schemas/parcel";

import type * as turf from "@turf/turf";
import "maplibre-gl/dist/maplibre-gl.css";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { withinDKBBox } from "~/util/map_controls/within-dk-bbox";
import { useHCControl } from "~/util/map_controls/useHCControl";
import { useBSControl } from "~/util/map_controls/useBSControl";
import { updateArea, useDrawControl } from "~/util/map_controls/useDrawControl";
import { Switch, Match } from "solid-js";
import AddFieldForm from "~/components/AddFieldForm";
import DefaultMode from "~/components/DefaultMode";

//import from public
import AddFieldModal from "~/components/AddFieldModal";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature, Polygon, Properties } from "@turf/turf";
import { createFarmMarkerIcon } from "~/components/Map";

export enum modes {
	default,
	addField,
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

	const [fieldName, setFieldName] = createSignal<string>("");
	const [kmlPolygon, setKMLPolygon] = createSignal<Feature<
		Polygon,
		Properties
	> | null>(null);

	let map: maplibregl.Map;
	let draw: MapboxDraw;

	const navigate = useNavigate();
	function addFieldLayer() {
		map.addLayer({
			id: "fields",
			type: "fill",
			//@ts-ignore
			source: {
				type: "geojson",
				data: data()?.collection,
			},
			layout: {},
			paint: {
				"fill-color": "rgba(127,34,192,0.6)",
			},
		});

		map.addLayer({
			id: "fields-outline",
			type: "line",
			//@ts-ignore
			source: {
				type: "geojson",
				data: data()?.collection,
			},
			layout: {},
			paint: {
				"line-color": "rgba(255,255,255,0.5)",
				"line-width": 1,
			},
		});

		map.addLayer({
			id: "field-labels",
			type: "symbol",
			//@ts-ignore
			source: {
				type: "geojson",
				data: data()?.places,
			},
			layout: {
				"text-field": ["get", "description"],
				"text-justify": "center",
				"icon-image": ["concat", ["get", "icon"], "-15"],
				"text-size": 12,
			},
			paint: {
				"text-color": "white",
				"text-halo-color": "black",
				"text-halo-width": 1,
			},
		});

		map.on("click", "field-labels", (e: any) => {
			// navigate(`/parcels/${params.parcelId}/layers/${e.features[0].properties.id}`);
			e.clickOnLabel = true;
			map.flyTo({
				speed: 2,
				center: e.features[0].geometry.coordinates,
				zoom: 15,
			});
		});

		map.on("click", "fields", (e: any) => {
			if (e.clickOnLabel) {
				return;
			}

			if (mode() === modes.default) {
				navigate(
					`/parcels/${params.parcelId}/layers/${e.features[0].properties.id}`,
				);
			}

			// var popup = new maplibregl.Popup({ closeOnClick: true })
			//   .setLngLat(e.features[0].geometry.coordinates)
			//   .setHTML(`<strong><span style="color: black;">${e.features[0].properties.description}</span></strong><br/><a href="/parcels/${params.parcelId}/layers/${e.features[0].properties.id}">Go to layer</a>`)
			//   .addTo(map)
		});
	}

	function enterAddFieldMode(e: any) {
		e.preventDefault();
		setMode(modes.addField);
		setKMLPolygon(null);
		setModalOpen(true);

		console.log("enter add field mode");
	}

	function enterDefaultMode(cancelled: boolean) {
		// if field name is empty user cancelled so we don't want to update the map
		if (fieldName() !== "" && !cancelled) {
			if (map.getLayer("fields")) map.removeLayer("fields");
			if (map.getLayer("fields-outline")) map.removeLayer("fields-outline");
			if (map.getLayer("field-labels")) map.removeLayer("field-labels");
			if (map.getSource("fields")) map.removeSource("fields");
			if (map.getSource("fields-outline")) map.removeSource("fields-outline");
			if (map.getSource("field-labels")) map.removeSource("field-labels");
			addFieldLayer();
			setFieldName("");
		}

		if (cancelled) {
			setFieldName("");
			// // document.getElementById("coordinates").innerHTML = "A layer geometry has successfully been created and you may click the button below to create the new layer";
			// @ts-ignore
			document.getElementById("geometry").value = "";

			// @ts-ignore
			document.getElementById("layersize").value = "";
		}

		console.log("Set mode Default");
		setMode(modes.default);
	}

	createEffect(() => {
		if (mapref() && data()) {
			console.log("mapref() && data()");
			if (map) {
				map.remove();
			}
			map = new maplibregl.Map({
				container: mapref()!,
				attributionControl: false,
				style: {
					glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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
				center: [data()?.parcel.lng as number, data()?.parcel.lat as number],
				zoom: 12,
				maxZoom: 20,
			});

			map.on("load", () => {
				setStyleLoaded(true);
				addFieldLayer();

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

	const [modalOpen, setModalOpen] = createSignal<boolean>(false);

	createEffect(async () => {
		console.log("Add KML effect");
		if (mode() === modes.addField && draw && fieldName() !== "") {
			console.log("Add KML");
			const geometry = kmlPolygon()!.geometry;

			const featureIds: string[] = draw.add(geometry);

			console.log(featureIds);
			if (featureIds.length === 0) return;

			if (geometry.type === "Polygon") {
				map.jumpTo({
					center: geometry.coordinates[0][0] as [number, number],
					zoom: 15,
				});
			}

			draw.changeMode("simple_select", { featureIds: featureIds });

			updateArea(draw.get(featureIds[0]));
		}
	});

	function getMap() {
		return map;
	}
	function addDrawControl() {
		draw = useDrawControl(map);
	}

	function removeDrawControl() {
		if (draw) {
			if (map.hasControl(draw as unknown as IControl)) {
				map.removeControl(draw as unknown as IControl);
			}
		}
	}

	return (
		<>
			<AddFieldModal
				modalOpen={modalOpen}
				setModalOpen={setModalOpen}
				setInput={setFieldName}
				setKMLPolygon={setKMLPolygon}
				addDrawControl={addDrawControl}
				enterDefaultMode={enterDefaultMode}
				removeDrawControl={removeDrawControl}
			/>

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
						<AddFieldForm
							refetch={refetch}
							enterDefaultMode={enterDefaultMode}
							name={fieldName}
							removeDrawControl={removeDrawControl}
						/>
					</Match>
				</Switch>
				<Show when={mode() === modes.addField && fieldName() !== ""}>
					{/* <h1 class="addFieldModeDescription"> */}
					<h1
						style={{
							background: "rgba(0,0,0,0.4)",
							"border-radius": "10px",
							position: "fixed",
							"z-index": 10,
							color: "white",
							top: "90px",
							"font-size": "20px",
							"text-align": "center",
							left: "50%",
							transform: "translateX(-50%)",
							padding: "10px",
						}}
					>
						Click on the map to start drawing <br /> Click a point to select it,
						and press backspace to delete
					</h1>
				</Show>

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
