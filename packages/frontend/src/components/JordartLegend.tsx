import { createMemo, createResource, For, Show } from "solid-js";

const JORDART_LEGEND_URL =
  "https://data.geus.dk/arcgis/rest/services/Denmark/Jordartskort_25000/MapServer/legend?f=pjson";
const JORDART_METADATA_URL =
  "https://metadata.geus.dk/geonetwork/srv/dan/catalog.search#/metadata/a039bc0f-1ac5-4d5f-a3b2-49859c8745f7?lang=da";

type ArcGisLegendItem = {
  label: string;
  imageData: string;
  contentType: string;
  height: number;
  width: number;
};

type ArcGisLegendLayer = {
  layerName: string;
  legend: ArcGisLegendItem[];
};

type ArcGisLegendResponse = {
  layers: ArcGisLegendLayer[];
};

type JordartLegendProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function JordartLegend(props: JordartLegendProps) {
  const [legend] = createResource<ArcGisLegendResponse>(async () => {
    const response = await fetch(JORDART_LEGEND_URL);

    if (!response.ok) {
      throw new Error(`Unable to load Jordart legend: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  });

  const soilLegend = createMemo(
    () => legend()?.layers.find((layer) => layer.layerName === "Jordartskort")?.legend ?? [],
  );

  return (
    <aside class="jordart-legend" classList={{ "jordart-legend--collapsed": props.collapsed }}>
      <div class="jordart-legend__header">
        <div>
          <strong>Jordart</strong>
          <span>GEUS 1:25 000</span>
        </div>
        <button
          type="button"
          title={props.collapsed ? "Show Jordart legend" : "Hide Jordart legend"}
          onClick={props.onToggleCollapsed}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            classList={{ "jordart-legend__chevron--collapsed": props.collapsed }}
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
      </div>

      <Show when={!props.collapsed}>
        <div class="jordart-legend__body">
          <div class="jordart-legend__subheader">
            <span>Signaturforklaring</span>
            <a href={JORDART_METADATA_URL} target="_blank" rel="noreferrer">
              Metadata
            </a>
          </div>

          <Show when={legend.loading}>
            <div class="jordart-legend__status">Loading legend...</div>
          </Show>

          <Show when={legend.error}>
            <div class="jordart-legend__status">Legend unavailable</div>
          </Show>

          <Show when={!legend.loading && !legend.error}>
            <div class="jordart-legend__items">
              <For each={soilLegend()}>
                {(item) => (
                  <div class="jordart-legend__item">
                    <img
                      width={item.width}
                      height={item.height}
                      src={`data:${item.contentType};base64,${item.imageData}`}
                      alt=""
                    />
                    <span>{item.label}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </aside>
  );
}
