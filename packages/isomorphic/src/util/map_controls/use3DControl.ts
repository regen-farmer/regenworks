import type { Accessor } from "solid-js";
import { createSignal, createEffect } from "solid-js";
import type { ISpeciesSchema, SpeciesDocument } from "~/models/species";
import type { helpers as turf } from "@turf/turf";
import type { Resource } from "solid-js";
// @ts-ignore
import { MapboxOverlay } from "@deck.gl/mapbox";
// @ts-ignore
import { ScenegraphLayer } from "@deck.gl/mesh-layers";
import _ from "lodash";
import type { IControl } from "maplibre-gl";
const deckOverlay = new MapboxOverlay({
	interleaved: true,
	layers: [],
});

class Show3DControl implements maplibregl.IControl {
	_map: maplibregl.Map | undefined;
	_container: HTMLElement | undefined;
	_3dModelsButton: HTMLButtonElement | undefined;
	_3dModelsButtonSpan: HTMLSpanElement | undefined;
	_show3D: () => boolean;
	_setShow3D: (show: boolean) => void;

	constructor(_show3D: () => boolean, _setShow3D: (show: boolean) => void) {
		this._show3D = _show3D;
		this._setShow3D = _setShow3D;
	}

	onAdd(map: maplibregl.Map) {
		this._container = document.createElement("div");
		this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

		this._3dModelsButton = document.createElement("button");
		this._3dModelsButton.id = "MapButton3D";
		this._3dModelsButton.innerHTML = "3D\n\rOFF";
		this._container.appendChild(this._3dModelsButton);

		this._3dModelsButton.type = "button";
		this._3dModelsButton.addEventListener("click", () => {
			this._setShow3D(!this._show3D());
			const button = document.getElementById("MapButton3D");
			if (button) {
				button.innerHTML = `3D\n\r${this._show3D() ? "ON" : "OFF"}`;
			}
		});

		return this._container;
	}

	onRemove() {
		// remove(this._container);
	}
}

export type layoutData = {
	treeRowLines: any;
	groundCoverAreas: any;
	headlandSides: any;
	marginPolygon: any;
	headlandPolygon: any;
	sidesCloseToBearing: any;
	intersectionPoints: any;
	treeMarkerArray: any;
	speciesCountArray: any;
};

export type speciesData = {
	species: any[];
	speciesById: Map<string, SpeciesDocument>;
};

export function use3DControl(
	map: maplibregl.Map,
	layoutData:
		| Resource<layoutData | undefined>
		| Accessor<layoutData | undefined>,
	species:
		| Resource<speciesData | undefined>
		| Accessor<speciesData | undefined>,
) {
	const [show3D, setShow3D] = createSignal(false);
	map.addControl(new Show3DControl(show3D, setShow3D));
	map.addControl(deckOverlay as unknown as IControl);

	createEffect(() => {
		deckOverlay.setProps({
			layers: [],
		});

		if (show3D()) {
			console.log("SHOW 3D", layoutData()?.treeMarkerArray);

			type TreeAsset = {
				species: string;
				point: turf.Feature<turf.Point, turf.Properties>;
				circle: turf.Feature<turf.Polygon, turf.Properties>;
			};

			//   console.log("treeAssetArray", layoutData()?.treeMarkerArray);

			const correctTreeAssetArray: TreeAsset[] =
				layoutData()?.treeMarkerArray!.filter((entry: TreeAsset) => {
					// console.log('entry.species', entry.species)

					if (entry.species) {

						// console.log('entry.species', entry.species)
						const cultivar = species()?.speciesById.get(entry.species._id ?? entry.species);

						// console.log("cultivar", cultivar)
						return cultivar.form !== undefined;
					}

					return false;
				});
			// const trees = [...correctTreeAssetArray, ...correctTreeAssetArray, ...correctTreeAssetArray, ...correctTreeAssetArray, ...correctTreeAssetArray];
			// console.log(trees.length)
			console.log("correctTreeAssetArray", correctTreeAssetArray);

			const assetFormArrays = _.groupBy(correctTreeAssetArray, (entry) => {
				const cultivar = species()?.speciesById.get(entry.species._id ??entry.species);

				if (cultivar?.family === "pinaceae") {
					return "conifer";
				}
				return cultivar?.form ?? "palm";
			});

			console.log("assetFormArrays", assetFormArrays);
			// console.log("assetFormArrays", assetFormArrays);

			const models: any = {
				giantherb: {
					path: "/3dmodels/giantherb/giantherb.glb",
					sizeScale: 1 * 1.4 * 0.5,
				},
				palm: {
					path: "/3dmodels/palm/palm2.glb",
					sizeScale: 0.5 * 1.4,
				},
				shrub: {
					path: "/3dmodels/shrub/bush_1_-_low_poly.glb",
					sizeScale: 0.003 * 1.4,
				},
				succulent: {
					path: "/3dmodels/succulent/succulent.glb",
					sizeScale: 1 * 1.4 * 1.3,
				},
				tree: {
					path: "/3dmodels/tree/smallsinglecentered.glb",
					sizeScale: 0.003 * 1.4,
				},
				conifer: {
					path: "/3dmodels/conifer/conifer.glb",
					sizeScale: 0.8 * 1.4 * 0.8,
				},
			};

			console.log("assetFormArrays", assetFormArrays);

			const Layers3D: any[] = [];

			_.forEach(assetFormArrays, (value, key) => {
				// console.log("At map render phase", show3D(), models[key]);

				let newKey = key;

				console.log("Key", newKey);
				if (!newKey || newKey === "grass") {
					newKey = "tree";
				}

				Layers3D.push(
					new ScenegraphLayer({
						id: `scenegraph-layer-${newKey}`,
						data: value,
						// @ts-ignore
						scenegraph: models[newKey].path,
						getPosition: (d: TreeAsset) => d.point.geometry.coordinates,
						getOrientation: [0, 0, 90],
						_animations: {
							"*": { speed: 5 },
						},

						sizeScale: models[newKey].sizeScale,
						// getScale: (d: TreeAsset) =>{
						// 	let scale = (Math.random()-0.5)*0.4;
						// 	return [1+scale, 1+scale, 1+scale]
						// },
						_lighting: "pbr",
					}),
				);
			});

			deckOverlay.setProps({
				layers: Layers3D,
			});
		}
	});
}
