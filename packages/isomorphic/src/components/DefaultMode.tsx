import { A } from "@solidjs/router";
// import { modes } from "~/routes/parcels/[parcelId]";
// import { useDrawControl } from "~/util/map_controls/useDrawControl";
// import { LayerDocument } from "@rw/db/schemas/layer";
import type { Map as MLMap } from "maplibre-gl";
import { For, type Resource } from "solid-js";
import type * as turf from "@turf/turf";
import type { IParcelSchema } from "@rw/db/schemas/parcel";

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
	enterAddFieldMode: (e: any) => void;
	getMap: () => MLMap;
};

function DefaultMode({
	data,
	params,
	enterAddFieldMode,
	getMap,
}: DefaultModeProps) {
	//   function enterAddFieldMode(e: any) {
	//     e.preventDefault();
	//     setMode(modes.addField);

	//     draw = useDrawControl(map);
	//     // map.removeControl(draw);
	//   }

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
