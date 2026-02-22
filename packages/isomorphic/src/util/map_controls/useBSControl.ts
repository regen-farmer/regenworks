import { createSignal } from "solid-js";
import { createEffect } from "solid-js";

class ShowBSControl implements maplibregl.IControl {
  _map: maplibregl.Map | undefined;
  _container: HTMLElement | undefined;
  _bsModelsButton: HTMLButtonElement | undefined;
  _bsModelsButtonSpan: HTMLSpanElement | undefined;
  _showBS: () => boolean;
  _setShowBS: (show: boolean) => void;

  constructor(_showBS: () => boolean, _setShowBS: (show: boolean) => void) {
    this._showBS = _showBS;
    this._setShowBS = _setShowBS;
  }

  onAdd(map: maplibregl.Map) {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    this._bsModelsButton = document.createElement("button");
    this._bsModelsButton.id = "MapButtonBS";
    this._bsModelsButton.innerHTML = "BS\n\rOFF";
    // this._3dModelsButton.className = "maplibregl-ctrl-terrain";
    this._container.appendChild(this._bsModelsButton);

    this._bsModelsButton.type = "button";
    this._bsModelsButton.addEventListener("click", () => {
      this._setShowBS(!this._showBS());
      const button = document.getElementById("MapButtonBS");
      if (button) {
        button.innerHTML = `BS\n\r${this._showBS() ? "ON" : "OFF"}`;
      }
    });

    return this._container;
  }

  onRemove() {
    // remove(this._container);
  }
}

export function useBSControl(map: maplibregl.Map) {
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
            // 'https://api.dataforsyningen.dk/elevation_inspire?service=WMS&request=getmap&version=1.3.0&Width=256&Height=256&Layers=EL.ContourLine&Format=image/png&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&transparent=TRUE'
            `${import.meta.env.VITE_BACKEND_URL}/api/tiles/bluespot?bbox={bbox-epsg-3857}`,
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
