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
import { A, useParams } from "@solidjs/router";
import { getMongoDBUser } from "~/auth/useAuth";
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
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

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
  const [isOfferModalOpen, setOfferModalOpen] = createSignal(false);
  const [userEmail, setUserEmail] = createSignal("");
  const [userNotes, setUserNotes] = createSignal("");
  const [isSendingOfferRequest, setIsSendingOfferRequest] = createSignal(false);
  const [offerRequestError, setOfferRequestError] = createSignal<string | null>(null);
  const [offerRequestSuccess, setOfferRequestSuccess] = createSignal(false);
  const [editableQuantities, setEditableQuantities] = createSignal<Record<string, number>>({});
  const [enabledSpecies, setEnabledSpecies] = createSignal<Record<string, boolean>>({});

  // Signal to indicate the page is ready to fetch data
  const [authReady, setAuthReady] = createSignal(false);

  // Public previews don't require authentication - proceed immediately
  onMount(() => {
    setAuthReady(true);
  });
  
  // Fetch the farm planting plan configuration with preview data
  const [configData, { refetch }] = createResource(
    () => authReady() && params.configId,
    async (configId) => {
      if (!configId) return null;
      
      try {
        console.log("Fetching preview for config ID:", configId);
        const data = await getFarmScenarioConfigPreview(configId);
        console.log("Preview data received:", data);
        return data;
      } catch (error: any) {
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

  // Fetch current user
  const [currentUserData, setCurrentUserData] = createSignal<any>(null);

  onMount(async () => {
    // First try to get from the signal (if user is logged in via the main app)
    const signalUser = getMongoDBUser();
    if (signalUser) {
      setCurrentUserData(signalUser);
      return;
    }

    // Otherwise, try to fetch from API
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/myuser`,
        apiFetchOptions()
      );
      if (response.ok) {
        const data = await response.json();
        setCurrentUserData(data.user);
      }
    } catch (error) {
      // User not authenticated, that's fine for public previews
    }
  });

  // Check if the current user is the creator of this config
  const isCreator = createMemo(() => {
    const config = configData();
    const currentUser = currentUserData();

    if (!config || !currentUser) return false;

    const creatorUser = config.user as any;
    const creatorId = typeof creatorUser === 'string' ? creatorUser : creatorUser?._id;
    const currentUserId = currentUser._id;

    return creatorId && currentUserId && String(creatorId) === String(currentUserId);
  });

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

  const speciesBreakdown = createMemo(() => {
    const aggregated = aggregatedLayoutData();
    if (!aggregated?.speciesCountArray) return [] as { id: string; name: string; count: number }[];

    return aggregated.speciesCountArray.map((item: any, index: number) => {
      const speciesEntry = item.species;
      const speciesId =
        typeof speciesEntry === "object" && speciesEntry !== null
          ? speciesEntry._id ?? `${index}`
          : speciesEntry ?? `${index}`;
      const speciesData = species();
      const speciesDoc =
        (typeof speciesEntry === "object" && speciesEntry !== null
          ? speciesEntry
          : speciesData?.speciesById?.get(speciesId)) || undefined;

      const displayName =
        speciesDoc?.nameCommon ||
        speciesDoc?.species ||
        (typeof speciesEntry === "string" ? speciesEntry : undefined) ||
        "Unknown species";

      return {
        id: String(speciesId ?? index),
        name: displayName,
        count: Number(item.count ?? 0),
      };
    });
  });

  const totalTrees = createMemo(() => {
    return speciesBreakdown().reduce((sum, entry) => sum + (Number(entry.count) || 0), 0);
  });

  // Check if the farm scenario creator is from an allowed country for plant offers
  const ALLOWED_COUNTRIES = ['DK', 'SE', 'NL', 'DE', 'CZ', 'UK'];
  const canRequestPlantOffer = createMemo(() => {
    const config = configData();
    if (!config) return false;

    // Get the creator's country code from the populated user field
    // The user field should be populated with countryCode by the backend
    const user = config.user as any;
    const creatorCountryCode = user?.countryCode;

    if (!creatorCountryCode) return false;
    return ALLOWED_COUNTRIES.includes(creatorCountryCode.toUpperCase());
  });

  createEffect(() => {
    if (isOfferModalOpen()) {
      setOfferRequestError(null);
      setOfferRequestSuccess(false);

      // Leave email blank - user will fill it in
      setUserEmail("");
      setUserNotes(""); // Clear notes when modal opens

      // Initialize editable quantities with the current counts
      const quantities: Record<string, number> = {};
      const enabled: Record<string, boolean> = {};
      speciesBreakdown().forEach(entry => {
        quantities[entry.id] = entry.count;
        enabled[entry.id] = true; // All species enabled by default
      });
      setEditableQuantities(quantities);
      setEnabledSpecies(enabled);
    }
  });

  // Calculate total from editable quantities (only enabled species)
  const totalEditableTrees = createMemo(() => {
    const quantities = editableQuantities();
    const enabled = enabledSpecies();
    return Object.entries(quantities).reduce((sum, [id, count]) => {
      return sum + (enabled[id] ? count : 0);
    }, 0);
  });

  const handleSendOfferRequest = async () => {
    if (isSendingOfferRequest()) return;

    const email = userEmail().trim();
    if (!email) {
      setOfferRequestError("Please provide an email address so we can get back to you.");
      return;
    }

    if (totalEditableTrees() <= 0) {
      setOfferRequestError("We couldn't find any trees to include in the request.");
      return;
    }

    setOfferRequestError(null);
    setOfferRequestSuccess(false);
    setIsSendingOfferRequest(true);

    try {
      const baseOptions = apiFetchOptions();
      const quantities = editableQuantities();
      const enabled = enabledSpecies();
      const config = configData();

      // Get country from the creator's user data
      const creatorUser = config?.user as any;
      const country = creatorUser?.countryCode || undefined;

      const response = await fetch(`${BACKEND_URL}/plant-offer-requests`, {
        ...baseOptions,
        method: "POST",
        headers: {
          ...(baseOptions.headers ?? {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          configId: params.configId,
          totalTrees: totalEditableTrees(),
          species: speciesBreakdown()
            .filter((entry) => enabled[entry.id]) // Only include enabled species
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              count: quantities[entry.id] || 0,
            }))
            .filter((entry) => entry.count > 0), // Only include species with quantity > 0
          senderEmail: email,
          notes: userNotes(),
          country: country,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.message || "Failed to send offer request.");
      }

      setOfferRequestSuccess(true);
    } catch (error) {
      setOfferRequestError(
        error instanceof Error
          ? error.message
          : "Something went wrong while sending the request."
      );
    } finally {
      setIsSendingOfferRequest(false);
    }
  };

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

  // Get the currently selected field
  const selectedField = createMemo(() => {
    const fields = fieldsData();
    const fieldId = selectedFieldId();
    if (!fields || !fieldId) return null;
    return fields.find((f) => f.layerId === fieldId) ?? null;
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
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Farm Planting Plan</h2>
            <Show when={isCreator() && configData()?.parcel && params.configId}>
              <A
                href={`/parcels/${typeof configData()!.parcel === 'string' ? configData()!.parcel : configData()!.parcel._id}/farm-scenario/${params.configId}`}
                class="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Edit
              </A>
            </Show>
          </div>

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
                      This farm planting plan is not publicly available.
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
                <Show when={totalTrees() > 0}>
                  <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Total trees:</span>
                    <span class="font-medium">{totalTrees().toLocaleString()}</span>
                  </div>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={totalTrees() > 0 && canRequestPlantOffer()}>
            <div class="mt-4">
              <Button class="w-full" onClick={() => setOfferModalOpen(true)}>
                Request offer on trees
              </Button>
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
        <Show when={selectedField()?.systemLayout && species()}>
          <SystemInfoBox
            systemLayout={selectedField()!.systemLayout!}
            species={species()}
            scenarioData={{
              project: {
                name: selectedField()!.projectName || "Unnamed",
                layer: {
                  name: selectedField()!.layerName,
                  geometry: JSON.stringify(selectedField()!.geometry)
                },
              },
            }}
            showFieldScenarioName={true}
          />
        </Show>
      </div>
      
      <Dialog open={isOfferModalOpen()} onOpenChange={setOfferModalOpen}>
        <DialogContent onClose={() => setOfferModalOpen(false)}>
          <DialogHeader>
            <DialogTitle>Request offer on trees</DialogTitle>
            <DialogDescription>
              Review the amounts before sending your request to our nursery team.
            </DialogDescription>
          </DialogHeader>

          <div class="space-y-4">
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
              <div class="flex items-center justify-between text-base font-semibold mb-3">
                <span>Total trees</span>
                <span>{totalEditableTrees().toLocaleString()}</span>
              </div>
              <Show when={speciesBreakdown().length > 0}>
                <div class="mt-3">
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                    Species breakdown
                  </h4>
                  <div class="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
                    <table class="w-full text-sm">
                      <thead class="bg-gray-100 dark:bg-gray-800">
                        <tr>
                          <th class="text-center px-2 py-2 font-medium text-gray-700 dark:text-gray-300 w-12">Include</th>
                          <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Species</th>
                          <th class="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Design</th>
                          <th class="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">Request</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        <For each={speciesBreakdown()}>
                          {(entry) => {
                            const isEnabled = () => enabledSpecies()[entry.id];
                            return (
                              <tr classList={{ "opacity-50": !isEnabled() }}>
                                <td class="px-2 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    class="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer"
                                    checked={isEnabled()}
                                    onChange={(e) => {
                                      setEnabledSpecies({
                                        ...enabledSpecies(),
                                        [entry.id]: e.currentTarget.checked
                                      });
                                    }}
                                  />
                                </td>
                                <td class="px-3 py-2 text-gray-700 dark:text-gray-300">{entry.name}</td>
                                <td class="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{entry.count.toLocaleString()}</td>
                                <td class="px-3 py-2 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    disabled={!isEnabled()}
                                    class="w-24 px-2 py-1 text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={editableQuantities()[entry.id] || 0}
                                    onInput={(e) => {
                                      const value = parseInt(e.currentTarget.value) || 0;
                                      setEditableQuantities({
                                        ...editableQuantities(),
                                        [entry.id]: Math.max(0, value)
                                      });
                                    }}
                                  />
                                </td>
                              </tr>
                            );
                          }}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </div>
              </Show>
            </div>

            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-200" for="offer-request-email">
                Your email
              </label>
              <input
                id="offer-request-email"
                type="email"
                class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                placeholder="you@example.com"
                value={userEmail()}
                onInput={(event) => setUserEmail((event.currentTarget as HTMLInputElement).value)}
                required
              />
            </div>

            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-200" for="offer-request-notes">
                Additional notes (optional)
              </label>
              <textarea
                id="offer-request-notes"
                rows="4"
                class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 resize-y"
                placeholder="Any specific requirements or questions about your order..."
                value={userNotes()}
                onInput={(event) => setUserNotes((event.currentTarget as HTMLTextAreaElement).value)}
              />
            </div>

            <Show when={offerRequestError()}>
              <p class="text-sm text-red-600 dark:text-red-400">{offerRequestError()}</p>
            </Show>
            <Show when={offerRequestSuccess()}>
              <p class="text-sm text-green-600 dark:text-green-400">
                Request sent! We'll be in touch soon.
              </p>
            </Show>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOfferModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendOfferRequest}
              disabled={isSendingOfferRequest() || !userEmail().trim()}
            >
              <Show when={isSendingOfferRequest()} fallback={<span>Send request</span>}>
                Sending…
              </Show>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FarmScenarioPreview;
