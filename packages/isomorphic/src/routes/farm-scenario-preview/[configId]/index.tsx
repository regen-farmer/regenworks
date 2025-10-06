import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  type Component,
  For,
  Show,
  createEffect,
  createSignal,
  createMemo,
  createResource,
  onMount,
} from "solid-js";
import { useParams } from "@solidjs/router";
import { use3DControl } from "~/util/map_controls/use3DControl.ts";
import { useBSControl } from "~/util/map_controls/useBSControl.ts";
import { useHCControl } from "~/util/map_controls/useHCControl.ts";
import { withinDKBBox } from "~/util/map_controls/within-dk-bbox.ts";
import { systemBasedLayout } from "@rw/modelling/gis/system_based_layout.ts";
import { MaptilerNavigationControl } from "@maptiler/sdk";
import { drawSystemDesignWithPrefix } from "~/components/systemDesigner/drawSystemDesignWithPrefix.ts";
import { getSpecies } from "~/util/getSpecies.ts";
import { SystemInfoBox } from "~/components/systemDesigner/SystemInfoBox.tsx";
import type { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";
import { getFarmScenarioConfigPreview } from "~/util/api/farmScenarioConfig";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { bbox, helpers as turf } from "@turf/turf";
import { getAuth0User } from "~/auth/useAuth";

interface FieldScenarioData {
  layerId: string;
  layerName: string;
  projectId?: string;
  projectName?: string;
  geometry: any;
  systemDesign?: any;
  systemLayout?: ISystemBasedLayout;
  lat: number;
  lng: number;
}

const FarmScenarioPreview: Component = () => {
  const params = useParams();
  const species = getSpecies();
  const [mapLoaded, setMapLoaded] = createSignal<boolean>(false);
  const [selectedFieldId, setSelectedFieldId] = createSignal<string | null>(null);
  const [show3D, setShow3D] = createSignal(false);
  
  // Wait for auth to be ready before fetching
  const [authReady, setAuthReady] = createSignal(false);
  
  // Check if auth is ready or if we should proceed without it (for public configs)
  onMount(() => {
    // For public previews, we don't need to wait for auth
    // The backend will handle public access appropriately
    const checkAuth = async () => {
      // First check if auth is already available
      if (getAuth0User()) {
        console.log("Auth available, proceeding with authenticated request");
        setAuthReady(true);
        return;
      }
      
      // If not, wait a brief moment for auth to initialize
      // But don't wait too long - public previews don't need auth
      let attempts = 0;
      const maxAttempts = 5; // 0.5 seconds max wait for public previews
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (getAuth0User()) {
          console.log("Auth became available, proceeding with authenticated request");
          setAuthReady(true);
          return;
        }
        attempts++;
      }
      
      // No auth available - proceed anyway (might be a public preview)
      console.log("No auth available, proceeding (might be public preview)");
      setAuthReady(true);
    };
    
    checkAuth();
  });
  
  // Fetch the farm scenario configuration with preview data
  const [configData, { refetch }] = createResource(
    () => authReady() && params.configId,
    async (configId) => {
      if (!configId) return null;
      
      try {
        console.log("Fetching preview for config ID:", configId);
        const data = await getFarmScenarioConfigPreview(configId);
        console.log("Preview data received:", data);
        return data;
      } catch (error) {
        console.error("Error fetching preview data:", error);
        // If it's an auth error, we might want to retry once
        if (error.message.includes("Empty response") || error.message.includes("Unexpected end")) {
          // Wait a bit and retry once
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log("Retrying after brief wait...");
          try {
            const retryData = await getFarmScenarioConfigPreview(configId);
            return retryData;
          } catch (retryError) {
            console.error("Retry also failed:", retryError);
            throw retryError;
          }
        }
        throw error;
      }
    }
  );

  const isConfigPublic = createMemo(() => Boolean(configData()?.isPublic));

  // Fetch all field and scenario data
  const [fieldsData] = createResource(
    () => configData(),
    async (config) => {
      if (!config || !config.isPublic) return [];
      
      const fields: FieldScenarioData[] = [];
      
      // Process each field scenario from the populated data
      for (const fieldScenario of config.fieldScenarios) {
        if (!fieldScenario.enabled) continue;
        
        const layerData = fieldScenario.layer;
        const projectData = fieldScenario.project;
        
        let systemDesign = null;
        let systemLayout = null;
        
        // Get system design if available
        if (projectData?.systemdesign) {
          systemDesign = projectData.systemdesign;
          
          // Calculate system layout - pass the geometry as a string
          try {
            const geometryString = layerData.geometry.replace(/&#34;/g, '"');
            systemLayout = systemBasedLayout(systemDesign, geometryString);
          } catch (error) {
            console.error(`Failed to calculate system layout for layer ${layerData._id}:`, error);
            // Continue without system layout for this field
            systemLayout = null;
          }
        }
        
        fields.push({
          layerId: layerData._id,
          layerName: layerData.name || "Unnamed Field",
          projectId: projectData?._id,
          projectName: projectData?.name,
          geometry: JSON.parse(layerData.geometry.replace(/&#34;/g, '"')),
          systemDesign,
          systemLayout,
          lat: layerData.lat,
          lng: layerData.lng,
        });
      }
      
      return fields;
    }
  );

  // Aggregate tree data from all fields for 3D display
  const aggregatedLayoutData = createMemo(() => {
    const fields = fieldsData();
    if (!fields || fields.length === 0) return undefined;
    
    // Collect all tree markers from all fields
    const allTreeMarkers: any[] = [];
    const speciesCount: any = {};
    
    fields.forEach(field => {
      if (field.systemLayout) {
        // Add tree markers
        if (field.systemLayout.treeMarkerArray) {
          allTreeMarkers.push(...field.systemLayout.treeMarkerArray);
        }
        
        // Aggregate species counts
        if (field.systemLayout.speciesCountArray) {
          field.systemLayout.speciesCountArray.forEach((item: any) => {
            const speciesId = item.species?._id || item.species;
            if (speciesId) {
              speciesCount[speciesId] = (speciesCount[speciesId] || 0) + item.count;
            }
          });
        }
      }
    });
    
    // Return layout data in the expected format
    if (allTreeMarkers.length > 0) {
      return {
        treeMarkerArray: allTreeMarkers,
        speciesCountArray: Object.entries(speciesCount).map(([species, count]) => ({
          species,
          count
        }))
      };
    }
    
    return undefined;
  });

  // Calculate map bounds for all fields
  const mapBounds = createMemo(() => {
    const fields = fieldsData();
    if (!fields || fields.length === 0) return null;
    
    const features = fields.map((field) => field.geometry);
    const fc = turf.featureCollection(features);
    const bounds = bbox(fc);
    
    return [
      [bounds[0], bounds[1]], // Southwest
      [bounds[2], bounds[3]], // Northeast
    ];
  });

  // Calculate center point for initial map view
  const mapCenter = createMemo(() => {
    const fields = fieldsData();
    if (!fields || fields.length === 0) return [0, 0];
    
    const avgLng = fields.reduce((sum, f) => sum + f.lng, 0) / fields.length;
    const avgLat = fields.reduce((sum, f) => sum + f.lat, 0) / fields.length;
    
    return [avgLng, avgLat];
  });

  let map: maplibregl.Map;
  const [mapRef, setMapRef] = createSignal<HTMLElement>();

  createEffect(() => {
    if (fieldsData() && fieldsData()!.length > 0 && mapRef() && !map) {
      const center = mapCenter();
      
      map = new maplibregl.Map({
        container: mapRef()!,
        attributionControl: false,
        style: GoogleSatStyle,
        center: center as [number, number],
        zoom: 13,
        maxZoom: 20,
        pitch: configData()?.displaySettings?.initialPitch || 0,
        bearing: configData()?.displaySettings?.initialBearing || 0,
      });

      map.on("load", () => {
        // Fit to bounds if we have multiple fields
        const bounds = mapBounds();
        if (bounds) {
          map.fitBounds(bounds as any, { padding: 50 });
        }

        // Setup 3D control with aggregated tree data from all fields
        const { show3D: controlShow3D, setShow3D: setControlShow3D } = use3DControl(map, aggregatedLayoutData, species);
        
        // Sync the control's signal with our local one
        createEffect(() => {
          const is3D = controlShow3D();
          setShow3D(is3D);
        });

        // Add navigation control
        const nav = new MaptilerNavigationControl();
        map.addControl(nav, "top-right");

        setMapLoaded(true);
      });
    }
  });

  // Draw all fields and their system designs
  createEffect(() => {
    if (mapLoaded() && fieldsData()) {
      const fields = fieldsData()!;
      
      fields.forEach((field, index) => {
        const layerId = `field-${field.layerId}`;
        
        // Remove existing layers if they exist
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getLayer(`${layerId}-border`)) {
          map.removeLayer(`${layerId}-border`);
        }
        if (map.getSource(layerId)) {
          map.removeSource(layerId);
        }
        
        // Add field polygon
        map.addSource(layerId, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: field.geometry.geometry,
            properties: {
              fieldId: field.layerId,
              fieldName: field.layerName,
              projectName: field.projectName,
            },
          },
        });
        
        // Add field fill layer
        map.addLayer({
          id: layerId,
          type: "fill",
          source: layerId,
          layout: {},
          paint: {
            "fill-color": selectedFieldId() === field.layerId ? "#4ade80" : "#b4aab4",
            "fill-opacity": selectedFieldId() === field.layerId ? 0.3 : 0.2,
          },
        });
        
        // Add field border layer
        map.addLayer({
          id: `${layerId}-border`,
          type: "line",
          source: layerId,
          layout: {},
          paint: {
            "line-color": selectedFieldId() === field.layerId ? "#22c55e" : "#F0F8FF",
            "line-width": selectedFieldId() === field.layerId ? 3 : 2,
          },
        });
        
        // Add click handler for field selection
        map.on("click", layerId, (e) => {
          e.preventDefault();
          setSelectedFieldId(field.layerId);
          
          // Ease to the field
          map.easeTo({
            center: [field.lng, field.lat],
            zoom: 15,
            duration: 1000
          });
        });
        
        // Change cursor on hover
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
        
        // Draw system design if available
        if (field.systemLayout && field.systemDesign) {
          // Create a unique prefix for this field's layers
          const fieldPrefix = `field-${field.layerId}-`;
          
          // Draw the system design with a unique prefix
          drawSystemDesignWithPrefix(map, field.systemLayout, show3D(), fieldPrefix);
        }
      });
    }
  });

  // Redraw when 3D mode changes
  createEffect(() => {
    const is3D = show3D();
    if (mapLoaded() && fieldsData()) {
      // In 3D mode, hide all 2D layers
      if (is3D) {
        // Hide all field system design layers
        fieldsData()!.forEach((field) => {
          if (field.systemLayout && field.systemDesign) {
            const fieldPrefix = `field-${field.layerId}-`;
            // This will hide all 2D layers for this field
            drawSystemDesignWithPrefix(map, field.systemLayout, true, fieldPrefix);
          }
        });
        
        // Also hide field polygons in 3D mode (optional - you may want to keep them)
        fieldsData()!.forEach((field) => {
          const layerId = `field-${field.layerId}`;
          const borderLayerId = `${layerId}-border`;
          
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', 'none');
          }
          if (map.getLayer(borderLayerId)) {
            map.setLayoutProperty(borderLayerId, 'visibility', 'none');
          }
        });
      } else {
        // In 2D mode, show field polygons and system designs
        fieldsData()!.forEach((field) => {
          const layerId = `field-${field.layerId}`;
          const borderLayerId = `${layerId}-border`;
          
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', 'visible');
          }
          if (map.getLayer(borderLayerId)) {
            map.setLayoutProperty(borderLayerId, 'visibility', 'visible');
          }
          
          // Redraw system designs in 2D mode
          if (field.systemLayout && field.systemDesign) {
            const fieldPrefix = `field-${field.layerId}-`;
            drawSystemDesignWithPrefix(map, field.systemLayout, false, fieldPrefix);
          }
        });
      }
    }
  });

  return (
    <div class="flex h-screen">
      {/* Sidebar with field list */}
      <div class="w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div class="p-4">
          <h2 class="text-xl font-bold mb-4">Farm Scenario Preview</h2>
          
          <Show 
            when={!configData.error && configData() && isConfigPublic()} 
            fallback={
              <div>
                {configData.error ? (
                  <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <p class="text-red-600 dark:text-red-400 font-semibold">Error loading configuration</p>
                    <p class="text-sm text-red-500 dark:text-red-300 mt-1">
                      {configData.error.message.includes("Authentication required") 
                        ? "This configuration is private. Please log in to view it."
                        : configData.error.message || "Failed to load preview data"}
                    </p>
                    <button
                      onClick={() => refetch()}
                      class="mt-2 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Retry
                    </button>
                  </div>
                ) : (configData() && !isConfigPublic()) ? (
                  <div class="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <p class="text-yellow-700 dark:text-yellow-300 font-semibold">Private scenario</p>
                    <p class="text-sm text-yellow-600 dark:text-yellow-200 mt-1">
                      This farm scenario preview is not publicly available.
                    </p>
                  </div>
                ) : !authReady() ? (
                  <div>Initializing authentication...</div>
                ) : (
                  <div>Loading configuration...</div>
                )}
              </div>
            }
          >
            <div class="mb-4">
              <h3 class="font-semibold text-gray-700 dark:text-gray-300">
                {configData()?.name || "Unnamed Configuration"}
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {configData()?.description || "No description"}
              </p>
            </div>
          </Show>
          
          <div class="space-y-2">
            <h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-2">Fields</h3>
            
            <Show when={fieldsData()} fallback={<div>Loading fields...</div>}>
              <For each={fieldsData()}>
                {(field) => (
                  <div
                    class={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedFieldId() === field.layerId
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => {
                      setSelectedFieldId(field.layerId);
                      // Ease to the field if map is loaded
                      if (map && mapLoaded()) {
                        map.easeTo({
                          center: [field.lng, field.lat],
                          zoom: 15,
                          duration: 1000
                        });
                      }
                    }}
                  >
                    <div class="font-medium">{field.layerName}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                      {field.projectName ? (
                        <>Scenario: {field.projectName}</>
                      ) : (
                        <>No scenario selected</>
                      )}
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
          
          {/* Summary stats */}
          <Show when={fieldsData() && fieldsData()!.length > 0}>
            <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3">Summary</h3>
              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">Total Fields:</span>
                  <span class="font-medium">{fieldsData()!.length}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">With Scenarios:</span>
                  <span class="font-medium">
                    {fieldsData()!.filter(f => f.projectId).length}
                  </span>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
      
      {/* Map container */}
      <div class="flex-1 relative">
        <div
          ref={(el) => setMapRef(el)}
          class="w-full h-full"
        />
        
        {/* Info box for selected field */}
        <Show when={selectedFieldId() && fieldsData()}>
          {() => {
            const field = fieldsData()!.find((f) => f.layerId === selectedFieldId());
            return (
              <Show when={field?.systemLayout && species()}>
                <SystemInfoBox
                  systemLayout={field!.systemLayout!}
                  species={species()}
                  scenarioData={{
                    project: {
                      name: field!.projectName || "Unnamed",
                      layer: { 
                        name: field!.layerName,
                        geometry: JSON.stringify(field!.geometry)
                      },
                    },
                  }}
                />
              </Show>
            );
          }}
        </Show>
      </div>
    </div>
  );
};

export default FarmScenarioPreview;
