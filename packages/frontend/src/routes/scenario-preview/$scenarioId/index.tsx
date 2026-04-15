import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import { generateLayout } from "~/util/layoutService.ts";
import type { ISystemBasedLayout } from "@rw/modelling/gis-ts/types/system-based-layout.ts";
import { useParams, createFileRoute } from "@tanstack/solid-router";
import {
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Show,
  onCleanup,
} from "solid-js";
import { drawSystemDesign } from "~/components/systemDesigner/drawSystemDesign.ts";
import { SystemInfoBox } from "~/components/systemDesigner/SystemInfoBox.tsx";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { getSpecies } from "~/util/getSpecies.ts";
import { use3DControl } from "~/util/map_controls/use3DControl.ts";
import { useBSControl } from "~/util/map_controls/useBSControl.ts";
import { useHCControl } from "~/util/map_controls/useHCControl.ts";
import { withinDKBBox } from "~/util/map_controls/within-dk-bbox.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

const RouteDesignPreview: Component = () => {
  const params = useParams({ strict: false });

  const species = getSpecies();
  const [mapLoaded, setMapLoaded] = createSignal<boolean>(false);
  const [show3D, setShow3D] = createSignal(false);

  // Fetch scenario data with proper error handling
  const [scenarioData, { refetch }] = createResource(
    () => params().scenarioId,
    async (scenarioId) => {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/projects/${scenarioId}/layout`,
        apiFetchOptions(),
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result: { project: ProjectDocument } = await response.json();
      return result;
    },
  );

  const [systemLayout] = createResource(
    () => scenarioData(),
    async (data) => {
      if (data) {
        return generateLayout(
          data.project.systemdesign,
          data.project.layer.geometry,
        ) as Promise<ISystemBasedLayout>;
      }
      return undefined;
    },
  );

  // const [mapCameraState, setMapCameraState] = createSignal({})
  const mapCameraState = {};

  let map: maplibregl.Map;
  const [mapRef, setMapRef] = createSignal<HTMLElement>();

  createEffect(() => {
    if (scenarioData()?.project && mapRef() && !map) {
      const areaLat = scenarioData()?.project.layer.lat;
      const areaLng = scenarioData()?.project.layer.lng;

      map = new maplibregl.Map({
        container: mapRef()!,
        attributionControl: false,
        style: GoogleSatStyle,
        center: [areaLng!, areaLat!],
        zoom: 16,
        maxZoom: 20,
        pitch: 0,

        ...mapCameraState,
        // bearing: 40,
        // maxPitch: 85,
      });

      map.on("load", () => {
        const areaLat = scenarioData()?.project.layer.lat;
        const areaLng = scenarioData()?.project.layer.lng;

        // Use the 3D control and sync with our local signal
        const { show3D: controlShow3D } = use3DControl(map, systemLayout, species);

        // Sync the control's signal with our local one
        createEffect(() => {
          const is3D = controlShow3D();
          setShow3D(is3D);
          // Redraw the system design when 3D mode changes
          if (systemLayout()) {
            drawSystemDesign(map, systemLayout()!, is3D);
          }
        });

        if (withinDKBBox(areaLng!, areaLat!)) {
          useHCControl(map);
          useBSControl(map);
        }

        // Add navigation control (compass/north arrow + zoom buttons)
        const nav = new maplibregl.NavigationControl({
          showCompass: true,
          showZoom: true,
          visualizePitch: true,
        });
        map.addControl(nav, "top-right");

        // Add scale control
        const scale = new maplibregl.ScaleControl({
          maxWidth: 100,
          unit: "metric",
        });
        map.addControl(scale, "bottom-right");

        const unparsedFieldPolygon: any = scenarioData()?.project.layer.geometry;
        const fieldPolygon = JSON.parse(unparsedFieldPolygon!.replace(/&#34;/g, '"'));

        const fieldPolygonVisible = true;
        if (fieldPolygonVisible) {
          if (map.getSource("fieldPolygon")) {
            map.removeLayer("fieldPolygon");
            map.removeSource("fieldPolygon");
          }

          map.addLayer({
            id: "fieldPolygon",
            type: "fill",
            source: {
              type: "geojson",
              data: {
                type: "Feature",
                geometry: {
                  type: "Polygon",
                  coordinates: fieldPolygon.geometry.coordinates,
                },
                properties: {},
              },
            },
            layout: {},
            paint: {
              "fill-color": "#b4aab4",
              "fill-opacity": 0.5,
              "fill-outline-color": "#F0F8FF",
            },
          });
        }

        setMapLoaded(true);
      });
    }

    onCleanup(() => {
      if (map) {
        map.remove();
      }
    });
  });

  createEffect(() => {
    if (mapLoaded() && systemLayout()) {
      drawSystemDesign(map, systemLayout()!, show3D());

      try {
        const style = map.getStyle();
        if (style && style.layers) {
          const target = style.layers.find(
            (l: any) =>
              l.id.startsWith("strips-") ||
              l.id.startsWith("trees-") ||
              l.id === "treeRowLines" ||
              l.id === "row-labels",
          );
          if (target && map.getLayer("fieldPolygon")) {
            map.moveLayer("fieldPolygon", target.id);
          }
        }
      } catch {}
    }
  });

  return (
    <div style={{ height: "100vh", position: "relative", flex: "1 1 100%" }}>
      <Show
        when={!scenarioData.error}
        fallback={
          <div class="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-900">
            <div class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md text-center">
              <h2 class="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
                Unable to load scenario
              </h2>
              <p class="text-gray-600 dark:text-gray-300 mb-4">
                {scenarioData.error?.message === "Authentication required"
                  ? "This scenario is private. Please log in to view it."
                  : scenarioData.error?.message === "Unauthorized"
                    ? "You don't have permission to view this scenario."
                    : scenarioData.error?.message || "Failed to load scenario data."}
              </p>
              <button
                onClick={() => refetch()}
                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          </div>
        }
      >
        <div style={{ height: "100vh" }}>
          <div
            ref={(el) => {
              setMapRef(el);
            }}
            style={{ height: "100vh" }}
          />

          <Show
            when={scenarioData() && systemLayout() && species()}
            fallback={
              <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                <div class="bg-white dark:bg-gray-800 px-4 py-2 rounded shadow">Loading...</div>
              </div>
            }
          >
            <SystemInfoBox
              systemLayout={systemLayout()!}
              species={species()}
              scenarioData={scenarioData()}
            />
          </Show>
        </div>
      </Show>
    </div>
  );
};

export const Route = createFileRoute("/scenario-preview/$scenarioId/")({
  component: RouteDesignPreview,
});
