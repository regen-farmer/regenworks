import { createSignal } from "solid-js";
import { createEffect } from "solid-js";

const MTN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`;

class ShowHCControl implements maplibregl.IControl {
  _map: maplibregl.Map | undefined;
  _container: HTMLElement | undefined;
  _hcModelsButton: HTMLButtonElement | undefined;
  _showHC: () => boolean;
  _setShowHC: (show: boolean) => void;

  constructor(_showHC: () => boolean, _setShowHC: (show: boolean) => void) {
    this._showHC = _showHC;
    this._setShowHC = _setShowHC;
  }

  updateIcon() {
    if (this._hcModelsButton) {
      const svg = this._hcModelsButton.querySelector("svg");
      if (this._showHC()) {
        this._hcModelsButton.style.color = "#3b82f6"; // Tailwind blue-500
        this._hcModelsButton.title = "Height Curves - ON";
        if (svg) svg.setAttribute("fill", "currentcolor");
      } else {
        this._hcModelsButton.style.color = "#4b5563"; // Tailwind gray-600
        this._hcModelsButton.title = "Height Curves - OFF";
        if (svg) svg.setAttribute("fill", "none");
      }
    }
  }

  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    this._hcModelsButton = document.createElement("button");
    this._hcModelsButton.id = "MapButtonHC";
    this._hcModelsButton.type = "button";
    this._hcModelsButton.style.display = "flex";
    this._hcModelsButton.style.alignItems = "center";
    this._hcModelsButton.style.justifyContent = "center";
    this._hcModelsButton.innerHTML = MTN_SVG;
    this._container.appendChild(this._hcModelsButton);

    this.updateIcon();

    this._hcModelsButton.addEventListener("click", () => {
      this._setShowHC(!this._showHC());
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

export function useHCControl(map: maplibregl.Map) {
  const [showHC, setShowHC] = createSignal(false);
  map.addControl(new ShowHCControl(showHC, setShowHC));
  const [hcAdded, setHcAdded] = createSignal(false);
  createEffect(() => {
    if (showHC()) {
      if (!map.getSource("wms-hc_2_5m-source")) {
        map.addSource("wms-hc_2_5m-source", {
          type: "raster",
          tiles: [
            "https://api.dataforsyningen.dk/dhm_DAF?service=WMS&request=getMap&version=1.3.0&Width=256&Height=256&Layers=dhm_kurve_traditionel&Format=image/png&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&transparent=TRUE&token=99c2c31852720aef7a9305071e549691&styles=hvid", //, //dhm_kurve_0_5_m
          ],
          tileSize: 256,
        });
      }
      map.addLayer({
        id: "wms-hc_2_5m-layer",
        type: "raster",
        source: "wms-hc_2_5m-source",
        paint: {},
        minzoom: 10,
        maxzoom: 17,
      });

      if (!map.getSource("wms-hc_0_5m-source")) {
        map.addSource("wms-hc_0_5m-source", {
          type: "raster",
          tiles: [
            "https://api.dataforsyningen.dk/dhm_DAF?service=WMS&request=getMap&version=1.3.0&Width=256&Height=256&Layers=dhm_kurve_0_5_m&Format=image/png&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&transparent=TRUE&token=99c2c31852720aef7a9305071e549691&styles=hvid", //, //dhm_kurve_0_5_m
          ],
          tileSize: 256,
        });
      }
      map.addLayer({
        id: "wms-hc_0_5m-layer",
        type: "raster",
        source: "wms-hc_0_5m-source",
        paint: {},
        minzoom: 17,
        maxzoom: 18,
      });

      if (!map.getSource("wms-hc_0_25m-source")) {
        map.addSource("wms-hc_0_25m-source", {
          type: "raster",
          tiles: [
            "https://api.dataforsyningen.dk/dhm_DAF?service=WMS&request=getMap&version=1.3.0&Width=256&Height=256&Layers=dhm_kurve_0_25_m&Format=image/png&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&transparent=TRUE&token=99c2c31852720aef7a9305071e549691&styles=hvid", //, //dhm_kurve_0_5_m
          ],
          tileSize: 256,
        });
      }
      map.addLayer({
        id: "wms-hc_0_25m-layer",
        type: "raster",
        source: "wms-hc_0_25m-source",
        paint: {},
        minzoom: 18,
        maxzoom: 21,
      });

      setHcAdded(true);
    } else if (hcAdded()) {
      map.removeLayer("wms-hc_0_25m-layer");
      map.removeSource("wms-hc_0_25m-source");
      map.removeLayer("wms-hc_0_5m-layer");
      map.removeSource("wms-hc_0_5m-source");
      map.removeLayer("wms-hc_2_5m-layer");
      map.removeSource("wms-hc_2_5m-source");
    }
  });
}
