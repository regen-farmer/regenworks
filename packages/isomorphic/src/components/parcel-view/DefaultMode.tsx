import { A, useNavigate } from "@solidjs/router";
// import { modes } from "~/routes/parcels/[parcelId]";
// import { useDrawControl } from "~/util/map_controls/useDrawControl";
// import { LayerDocument } from "@rw/db/schemas/layer";
import type { Map as MLMap } from "maplibre-gl";
import { For, onMount, type Resource } from "solid-js";

// @ts-ignore
import type * as turf from "@turf/turf";
import type { IParcelSchema } from "@rw/db/schemas/parcel";
import { modes } from "~/routes/parcels/[parcelId]";
import { removeLayers } from "~/util/removeLayers";

type DefaultModeProps = {
	data: Resource<
		| {
				parcel: IParcelSchema;
				collection: turf.helpers.FeatureCollection<any, any>;
				places: turf.helpers.FeatureCollection<
					turf.helpers.Point,
					{
						description: string;
					}
				>;
		  }
		| undefined
	>;
	params: any;
	setMode: any;
	getMap: () => MLMap;
};

function DefaultMode({ data, params, setMode, getMap }: DefaultModeProps) {
	//   function enterAddFieldMode(e: any) {
	//     e.preventDefault();
	//     setMode(modes.addField);

	//     draw = useDrawControl(map);
	//     // map.removeControl(draw);
	//   }

	function enterAddFieldMode() {
		removeLayers(["field-fills", "field-outlines", "field-labels"], getMap());

		getMap().off("click", "field-labels", moveMapToField);

		getMap().off("click", "field-fills", navigateToField);

		setMode(modes.addField);
	}
	const navigate = useNavigate();

	function drawFields() {
		getMap().addLayer({
			id: "field-fills",
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

		getMap().addLayer({
			id: "field-outlines",
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

		getMap().addLayer({
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

		getMap().on("click", "field-labels", moveMapToField);

		getMap().on("click", "field-fills", navigateToField);
	}
	function navigateToField(e: any) {
		navigate(
			`/parcels/${params.parcelId}/layers/${e.features[0].properties.id}`,
		);
	}
	function moveMapToField(e: any) {
		// navigate(`/parcels/${params.parcelId}/layers/${e.features[0].properties.id}`);
		e.clickOnLabel = true;
		getMap().flyTo({
			speed: 2,
			center: e.features[0].geometry.coordinates,
			zoom: 15,
		});
	}

	onMount(() => {
		drawFields();
	});

	return (
		<div
			style={{
				background: "rgba(0,0,0,0.4)",
				"border-radius": "10px",
				position: "fixed",
				"z-index": 10,
				color: "white",
				right: "10px",
				bottom: "10px",
				padding: "10px",
			}}
		>
			<strong>
				<span>Fields</span>
			</strong>
			<div
				class="list-group"
				style={{
					"max-height": "500px",
					"overflow-y": "auto",
				}}
			>
				<For each={data()?.parcel.layers}>
					{(layer) => (
						<div class="list-group-item list-group-item-action list-group-item-primary parcel-div">
							<A
								class="parcel-link"
								href={`/parcels/${params.parcelId}/layers/${layer._id}`}
							>
								{layer.name}
							</A>
							<div>
								{/* <button
  class={
    "btn btn-dark menu-btn list-group-button"
  }
  onClick={() => {
    // enterEditMode(parcel)}
  }}
>
  <i class="fa-solid fa-pen" />
</button> */}

								<button
									type="button"
									class={"btn btn-dark menu-btn list-group-button"}
									onClick={() => {
										console.log(
											"JSON.parse(layer.geometry)",
											JSON.parse(layer.geometry),
										);

										// Go to location of layer
										getMap().flyTo({
											speed: 2,
											center: JSON.parse(layer.geometry).geometry
												.coordinates[0][0],
											zoom: 15,
										});

										// setCoordinates([Number(parcel.lng), Number(parcel.lat)]);
									}}
								>
									<i class="fa-solid fa-crosshairs" />
								</button>
							</div>
						</div>
					)}
				</For>
			</div>

			<button
				type="button"
				class="btn btn-dark"
				onClick={(e) => enterAddFieldMode(e)}
			>
				Add new field to this farm
			</button>
		</div>
	);
}

export default DefaultMode;
