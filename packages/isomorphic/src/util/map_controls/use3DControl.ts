import type { Accessor } from "solid-js";
import { createSignal, createEffect } from "solid-js";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import type { helpers as turf } from "@turf/turf";
import type { Feature, Point, Polygon, GeoJsonProperties } from "geojson";
import type { Resource } from "solid-js";
// @ts-ignore
import { MapboxOverlay } from "@deck.gl/mapbox";
// @ts-ignore
import { ScenegraphLayer } from "@deck.gl/mesh-layers";

import type { IControl } from "maplibre-gl";
const deckOverlay = new MapboxOverlay({
  interleaved: true,
  layers: [],
});

const TREE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tree-pine"><path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.8 1.7H17Z"/><path d="M12 22v-3"/></svg>`;

class Show3DControl implements maplibregl.IControl {
  _map: maplibregl.Map | undefined;
  _container: HTMLElement | undefined;
  _3dModelsButton: HTMLButtonElement | undefined;
  _show3D: () => boolean;
  _setShow3D: (show: boolean) => void;
  _onToggle?: () => void;

  constructor(_show3D: () => boolean, _setShow3D: (show: boolean) => void, _onToggle?: () => void) {
    this._show3D = _show3D;
    this._setShow3D = _setShow3D;
    this._onToggle = _onToggle;
  }

  updateIcon() {
    if (this._3dModelsButton) {
      const svg = this._3dModelsButton.querySelector("svg");
      if (this._show3D()) {
        this._3dModelsButton.style.color = "#3b82f6"; // Tailwind blue-500
        this._3dModelsButton.title = "3D Visualization";
        if (svg) svg.setAttribute("fill", "currentcolor");
      } else {
        this._3dModelsButton.style.color = "#4b5563"; // Tailwind gray-600
        this._3dModelsButton.title = "Planting Plan";
        if (svg) svg.setAttribute("fill", "none");
      }
    }
  }

  onAdd(map: maplibregl.Map) {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    this._3dModelsButton = document.createElement("button");
    this._3dModelsButton.id = "MapButton3D";
    this._3dModelsButton.type = "button";
    this._3dModelsButton.style.display = "flex";
    this._3dModelsButton.style.alignItems = "center";
    this._3dModelsButton.style.justifyContent = "center";
    this._3dModelsButton.innerHTML = TREE_SVG;

    this.updateIcon();
    this._container.appendChild(this._3dModelsButton);

    this._3dModelsButton.addEventListener("click", () => {
      this._setShow3D(!this._show3D());
      this.updateIcon();
      
      // Call the callback if provided
      if (this._onToggle) {
        this._onToggle();
      }
    });

    return this._container;
  }

  onRemove() {
    if (this._container?.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
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
  layoutData: Resource<layoutData | undefined> | Accessor<layoutData | undefined>,
  species: Resource<speciesData | undefined> | Accessor<speciesData | undefined>,
) {
  const [show3D, setShow3D] = createSignal(false);

  // Create a control with a callback that triggers when toggled
  const control = new Show3DControl(show3D, setShow3D, () => {
    // This callback will be triggered when the 3D toggle changes
    // The parent component can listen to the show3D signal changes
  });

  map.addControl(control);
  map.addControl(deckOverlay as unknown as IControl);

  createEffect(() => {
    deckOverlay.setProps({
      layers: [],
    });

    // Animate camera pitch based on 2D/3D state
    try {
      if (show3D()) {
        // Go to a slightly tilted view for 3D
        map.flyTo({ pitch: 50, duration: 700 });
      } else {
        // Return to top-down view for 2D
        map.flyTo({ pitch: 0, duration: 700 });
      }
    } catch {}

    if (show3D()) {

      type TreeAsset = {
        species: any;
        point: Feature<Point, GeoJsonProperties>;
        circle: Feature<Polygon, GeoJsonProperties>;
      };

      //   console.log("treeAssetArray", layoutData()?.treeMarkerArray);

      const correctTreeAssetArray: TreeAsset[] = layoutData()?.treeMarkerArray!.filter(
        (entry: TreeAsset) => {

          if (entry.species) {
            const speciesKey =
              typeof entry.species === "object" ? (entry.species as any)._id : entry.species;
            const cultivar = species()?.speciesById.get(speciesKey);
            return cultivar.form !== undefined;
          }

          return false;
        },
      );

      const assetFormArrays = correctTreeAssetArray.reduce((acc: Record<string, TreeAsset[]>, entry) => {
        const speciesKey2 =
          typeof entry.species === "object" ? (entry.species as any)._id : entry.species;
        const cultivar = species()?.speciesById.get(speciesKey2);

        let groupKey = cultivar?.form ?? "palm";
        if (cultivar?.family === "pinaceae") {
          groupKey = "conifer";
        }
        
        if (!acc[groupKey]) acc[groupKey] = [];
        acc[groupKey].push(entry);
        return acc;
      }, {});

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

      const Layers3D: any[] = [];

      Object.entries(assetFormArrays).forEach(([key, value]) => {
        let newKey = key;

        if (!newKey || newKey === "grass") {
          newKey = "tree";
        }

        Layers3D.push(
          new ScenegraphLayer({
            id: `scenegraph-layer-${newKey}`,
            data: value,
            // @ts-ignore
            scenegraph: models[newKey].path,
            getPosition: (d: TreeAsset) => d.point.geometry.coordinates as unknown as any,
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
            loadOptions: {
              imagebitmap: {
                premultiplyAlpha: "none",
              },
              image: {
                decode: true,
              },
            },
          }),
        );
      });

      deckOverlay.setProps({
        layers: Layers3D,
      });
    }
  });

  return { show3D, setShow3D };
}
