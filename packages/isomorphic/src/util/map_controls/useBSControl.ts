import { createEffect, createSignal } from "solid-js";
import maplibregl from "maplibre-gl";
import { bluespotProtocol } from "./bluespot-protocol";

const DROPS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;

class ShowBSControl implements maplibregl.IControl {
  _map: maplibregl.Map | undefined;
  _container: HTMLElement | undefined;
  _bsModelsButton: HTMLButtonElement | undefined;
  _showBS: () => boolean;
  _setShowBS: (show: boolean) => void;

  constructor(_showBS: () => boolean, _setShowBS: (show: boolean) => void) {
    this._showBS = _showBS;
    this._setShowBS = _setShowBS;
  }

  updateIcon() {
    if (this._bsModelsButton) {
      const svg = this._bsModelsButton.querySelector("svg");
      if (this._showBS()) {
        this._bsModelsButton.style.color = "#3b82f6"; // Tailwind blue-500
        this._bsModelsButton.title = "Blue Spot (Flooding) - ON";
        if (svg) svg.setAttribute("fill", "currentcolor");
      } else {
        this._bsModelsButton.style.color = "#4b5563"; // Tailwind gray-600
        this._bsModelsButton.title = "Blue Spot (Flooding) - OFF";
        if (svg) svg.setAttribute("fill", "none");
      }
    }
  }

  onAdd(map: maplibregl.Map) {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    this._bsModelsButton = document.createElement("button");
    this._bsModelsButton.id = "MapButtonBS";
    this._bsModelsButton.type = "button";
    this._bsModelsButton.style.display = "flex";
    this._bsModelsButton.style.alignItems = "center";
    this._bsModelsButton.style.justifyContent = "center";
    this._bsModelsButton.innerHTML = DROPS_SVG;
    this._container.appendChild(this._bsModelsButton);

    this.updateIcon();

    this._bsModelsButton.addEventListener("click", () => {
      this._setShowBS(!this._showBS());
      this.updateIcon();
    });

    return this._container;
  }

  onRemove() {
    if (this._container?.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
  }
}

export function useBSControl(map: maplibregl.Map) {
  try {
    maplibregl.addProtocol("bluespot", bluespotProtocol as any);
  } catch (e) {
    // Protocol is likely already added
  }

  const [showBS, setShowBS] = createSignal(false);
  map.addControl(new ShowBSControl(showBS, setShowBS));

  const [bsAdded, setBsAdded] = createSignal(false);
  createEffect(() => {
    if (showBS()) {
      if (!map.getSource("bluespot-wmts-source")) {
        map.addSource("bluespot-wmts-source", {
          type: "raster",
          // use the tiles option to specify a WMS tile source URL
          // https://maplibre.org/maplibre-gl-js-docs/style-spec/sources/
          tiles: [
            "bluespot://{bbox-epsg-3857}",
          ],
          tileSize: 256,
        });
      }

      map.addLayer({
        id: "bluespot-wmts-layer",
        type: "raster",
        source: "bluespot-wmts-source",
        paint: {},
        minzoom: 6,
        maxzoom: 21,
      });

      setBsAdded(true);
    } else if (bsAdded()) {
      map.removeLayer("bluespot-wmts-layer");
      map.removeSource("bluespot-wmts-source");
    }
  });
}
