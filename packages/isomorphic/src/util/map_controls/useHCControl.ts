import { createSignal } from "solid-js";
import { createEffect } from "solid-js";

class ShowHCControl implements maplibregl.IControl {
  _map: maplibregl.Map | undefined;
  _container: HTMLElement | undefined;
  _hcModelsButton: HTMLButtonElement | undefined;
  _hcModelsButtonSpan: HTMLSpanElement | undefined;
  _showHC: () => boolean;
  _setShowHC: (show: boolean) => void;

  constructor(_showHC: () => boolean, _setShowHC: (show: boolean) => void) {
    this._showHC = _showHC;
    this._setShowHC = _setShowHC;
  }

  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    this._hcModelsButton = document.createElement("button");
    this._hcModelsButton.id = "MapButtonHC";
    this._hcModelsButton.innerHTML = "HC\n\rOFF";
    this._container.appendChild(this._hcModelsButton);

    this._hcModelsButton.type = "button";
    this._hcModelsButton.addEventListener("click", () => {
      this._setShowHC(!this._showHC());
      const button = document.getElementById("MapButtonHC");
      if (button) {
        button.innerHTML = `HC\n\r${this._showHC() ? "ON" : "OFF"}`;
      }
    });

    return this._container;
  }

  onRemove() {
    // remove(this._container);
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
