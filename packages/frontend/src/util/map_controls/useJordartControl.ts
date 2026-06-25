import { createEffect, createSignal } from "solid-js";
import maplibregl from "maplibre-gl";
import { jordartProtocol } from "./jordart-protocol";
import { identifyJordartAtPoint, type JordartIdentifyResult } from "./jordart-identify";

const JORDART_LAYER_ID = "jordart-layer";
const JORDART_SOURCE_ID = "jordart-source";

// SVG Repo shovel, CC0: https://www.svgrepo.com/svg/456645/shovel
const SHOVEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="1.91" aria-hidden="true"><path d="M4.24 22.5A2.74 2.74 0 0 1 1.5 19.76a7.22 7.22 0 0 1 2.11-5.1l3.62-3.61L13 16.77l-3.66 3.62a7.22 7.22 0 0 1-5.1 2.11Z"/><line x1="6.27" y1="17.73" x2="19.64" y2="4.36"/><line x1="16.77" y1="1.5" x2="22.5" y2="7.23"/></svg>`;

class ShowJordartControl implements maplibregl.IControl {
  _container: HTMLElement | undefined;
  _jordartButton: HTMLButtonElement | undefined;
  _showJordart: () => boolean;
  _setShowJordart: (show: boolean) => void;

  constructor(_showJordart: () => boolean, _setShowJordart: (show: boolean) => void) {
    this._showJordart = _showJordart;
    this._setShowJordart = _setShowJordart;
  }

  updateIcon() {
    if (!this._jordartButton) {
      return;
    }

    if (this._showJordart()) {
      this._jordartButton.style.color = "#3b82f6";
      this._jordartButton.title = "Jordart (GEUS) - ON";
      this._jordartButton.setAttribute("aria-label", "Jordart (GEUS) - ON");
    } else {
      this._jordartButton.style.color = "#4b5563";
      this._jordartButton.title = "Jordart (GEUS) - OFF";
      this._jordartButton.setAttribute("aria-label", "Jordart (GEUS) - OFF");
    }
  }

  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    this._jordartButton = document.createElement("button");
    this._jordartButton.id = "MapButtonJordart";
    this._jordartButton.type = "button";
    this._jordartButton.style.display = "flex";
    this._jordartButton.style.alignItems = "center";
    this._jordartButton.style.justifyContent = "center";
    this._jordartButton.innerHTML = SHOVEL_SVG;
    this._container.appendChild(this._jordartButton);

    this.updateIcon();

    this._jordartButton.addEventListener("click", () => {
      this._setShowJordart(!this._showJordart());
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

function getPopupContent(result?: JordartIdentifyResult, loading = false) {
  const container = document.createElement("div");
  container.className = "jordart-popup";

  const title = document.createElement("strong");
  title.textContent = "Jordart";
  container.appendChild(title);

  if (loading) {
    const loadingText = document.createElement("span");
    loadingText.textContent = "Henter jordart...";
    container.appendChild(loadingText);
    return container;
  }

  if (!result) {
    const emptyText = document.createElement("span");
    emptyText.textContent = "Ingen jordart fundet for punktet.";
    container.appendChild(emptyText);
    return container;
  }

  const label = document.createElement("span");
  label.className = "jordart-popup__label";
  label.textContent = result.label;
  container.appendChild(label);

  if (result.details?.tidsalder) {
    const tidsalder = document.createElement("span");
    tidsalder.textContent = `Tidsalder: ${result.details.tidsalder}`;
    container.appendChild(tidsalder);
  }

  if (result.details?.sedimentType) {
    const sedimentType = document.createElement("span");
    sedimentType.textContent = `Sedimenttype: ${result.details.sedimentType}`;
    container.appendChild(sedimentType);
  }

  const source = document.createElement("small");
  source.textContent =
    result.source === "identify" ? "Kilde: GEUS identify" : "Kilde: GEUS tilefarve";
  container.appendChild(source);

  return container;
}

export function useJordartControl(
  map: maplibregl.Map,
  onVisibilityChange?: (show: boolean) => void,
) {
  try {
    maplibregl.addProtocol("jordart", jordartProtocol as any);
  } catch {
    // Protocol is likely already added
  }

  const [showJordart, setShowJordart] = createSignal(false);
  map.addControl(new ShowJordartControl(showJordart, setShowJordart));

  const [jordartAdded, setJordartAdded] = createSignal(false);
  let popup: maplibregl.Popup | undefined;
  let latestLookupId = 0;
  const identifyClickHandler = async (event: maplibregl.MapMouseEvent) => {
    if (!showJordart()) {
      return;
    }

    const lookupId = latestLookupId + 1;
    latestLookupId = lookupId;

    popup?.remove();
    popup = new maplibregl.Popup({ closeOnClick: true, maxWidth: "280px" })
      .setLngLat(event.lngLat)
      .setDOMContent(getPopupContent(undefined, true))
      .addTo(map);

    try {
      const result = await identifyJordartAtPoint(event.lngLat.lng, event.lngLat.lat, map);
      if (lookupId === latestLookupId) {
        popup.setDOMContent(getPopupContent(result));
      }
    } catch {
      if (lookupId === latestLookupId) {
        popup.setDOMContent(getPopupContent(undefined));
      }
    }
  };

  createEffect(() => {
    onVisibilityChange?.(showJordart());

    if (showJordart()) {
      if (!map.getSource(JORDART_SOURCE_ID)) {
        map.addSource(JORDART_SOURCE_ID, {
          type: "raster",
          tiles: ["jordart://{bbox-epsg-3857}"],
          tileSize: 256,
        });
      }

      if (!map.getLayer(JORDART_LAYER_ID)) {
        map.addLayer(
          {
            id: JORDART_LAYER_ID,
            type: "raster",
            source: JORDART_SOURCE_ID,
            paint: {
              "raster-opacity": 0.82,
            },
            minzoom: 6,
            maxzoom: 21,
          },
          map.getLayer("map") ? "map" : undefined,
        );
      }

      setJordartAdded(true);
      map.on("click", identifyClickHandler);
    } else if (jordartAdded()) {
      map.off("click", identifyClickHandler);
      popup?.remove();
      popup = undefined;

      if (map.getLayer(JORDART_LAYER_ID)) {
        map.removeLayer(JORDART_LAYER_ID);
      }
      if (map.getSource(JORDART_SOURCE_ID)) {
        map.removeSource(JORDART_SOURCE_ID);
      }
      setJordartAdded(false);
    }
  });
}
