import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { MaptilerNavigationControl } from "@maptiler/sdk";
import { generateLayout } from "~/util/layoutService.ts";
import type { ISystemBasedLayout } from "@rw/modelling/gis-ts/types/system-based-layout.ts";
import { useParams, createFileRoute } from "@tanstack/solid-router";
import { bbox, helpers as turf } from "@turf/turf";
import {
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onMount,
  Show,
} from "solid-js";
import { getAuth0User } from "~/auth/useAuth";
import { OfferRequestModal } from "~/components/OfferRequestModal";
import { drawSystemDesignWithPrefix } from "~/components/systemDesigner/drawSystemDesignWithPrefix.ts";
import { SystemInfoBox } from "~/components/systemDesigner/SystemInfoBox.tsx";
import { Button } from "~/components/ui/button";
import { Resizable, ResizableHandle, ResizablePanel } from "~/components/ui/resizable";
import { showToast } from "~/components/ui/toast";
import { getFarmScenarioConfig, updateFarmScenarioConfig } from "~/util/api/farmScenarioConfig";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { getSpecies } from "~/util/getSpecies.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

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

export const Route = createFileRoute("/parcels/$parcelId/farm-scenario/$farmScenarioId/")({
  component: FarmScenarioPreview,
});

const FarmScenarioPreview: Component = () => {
  const params = useParams({ strict: false });
  const species = getSpecies();
  const [mapLoaded, setMapLoaded] = createSignal<boolean>(false);
  const [selectedFieldId, setSelectedFieldId] = createSignal<string | null>(null);
  const [show3D, setShow3D] = createSignal(false);
  const [scenarioName, setScenarioName] = createSignal("");
  const [scenarioDescription, setScenarioDescription] = createSignal("");
  const [isPublic, setIsPublic] = createSignal(false);
  const [showOfferButton, setShowOfferButton] = createSignal(true);
  const [fieldScenarioSelections, setFieldScenarioSelections] = createSignal<
    Map<string, string | null>
  >(new Map());
  const [savedFieldScenarioSelections, setSavedFieldScenarioSelections] = createSignal<
    Map<string, string | null>
  >(new Map());
  const [updatingFieldId, setUpdatingFieldId] = createSignal<string | null>(null);
  const [isMapFieldLoading, setIsMapFieldLoading] = createSignal(false);
  const [isOfferModalOpen, setOfferModalOpen] = createSignal(false);

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
        await new Promise((resolve) => setTimeout(resolve, 100));
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

  // Fetch the farm planting plan configuration with preview data
  const [configData, { refetch, mutate: mutateConfig }] = createResource(
    () => authReady() && params().farmScenarioId,
    async (farmScenarioId) => {
      if (!farmScenarioId) return null;

      try {
        const data = await getFarmScenarioConfig(farmScenarioId);
        return data;
      } catch (error) {
        console.error("Error fetching farm scenario config:", error);
        throw error;
      }
    },
  );

  // Signal to track when fields need to be re-evaluated for reactivity
  const [fieldsUpdateTrigger, setFieldsUpdateTrigger] = createSignal(0);

  // Fetch all field and scenario data
  const [fieldsData] = createResource(
    () => configData(),
    async (config) => {
      if (!config) return [];

      const fields: FieldScenarioData[] = [];

      // Process each field scenario from the populated data
      for (const fieldScenario of config.fieldScenarios) {
        if (!fieldScenario.enabled) continue;

        const layerData = fieldScenario.layer;

        // Skip if layer has been deleted or is not populated
        if (!layerData || typeof layerData === "string" || !layerData._id || !layerData.geometry) {
          console.warn("Skipping field scenario with missing or deleted layer:", fieldScenario);
          continue;
        }

        const projectData = fieldScenario.project;

        let systemDesign = null;
        let systemLayout = null;

        // Get system design if available
        if (projectData?.systemdesign) {
          systemDesign = projectData.systemdesign;

          // Calculate system layout - pass the geometry as a string
          try {
            const geometryString = layerData.geometry.replace(/&#34;/g, '"');

            // Validate that systemDesign has required data before calculating layout
            if (
              systemDesign.rows &&
              Array.isArray(systemDesign.rows) &&
              systemDesign.rows.length > 0
            ) {
              systemLayout = await generateLayout(systemDesign, geometryString);
            } else {
              console.warn(
                `System design for layer ${layerData._id} is missing rows data, skipping layout calculation`,
              );
            }
          } catch (error) {
            console.error(`Failed to calculate system layout for layer ${layerData._id}:`, error);
            // Continue without system layout for this field
            systemLayout = null;
          }
        }

        fields.push({
          layerId: String(layerData._id),
          layerName: layerData.name || "Unnamed Field",
          projectId: projectData?._id ? String(projectData._id) : undefined,
          projectName: projectData?.name,
          geometry: JSON.parse(layerData.geometry.replace(/&#34;/g, '"')),
          systemDesign,
          systemLayout,
          lat: layerData.lat,
          lng: layerData.lng,
        });
      }

      return fields;
    },
  );

  const [parcelLayersData] = createResource(
    () => (authReady() ? params().parcelId : undefined),
    async (parcelId) => {
      if (!parcelId) return [];

      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/parcels/${parcelId}/layers`,
          apiFetchOptions(),
        );
        if (!response.ok) {
          throw new Error("Failed to fetch parcel layers");
        }
        const layers = await response.json();
        return layers;
      } catch (error) {
        console.error("Failed to fetch parcel layers:", error);
        return [];
      }
    },
  );

  const selectedField = createMemo(() => {
    const id = selectedFieldId();
    if (!id) {
      return undefined;
    }
    const fields = fieldsData();
    if (!fields) {
      return undefined;
    }
    return fields.find((field) => field.layerId === id);
  });

  // Aggregate tree data from all fields for the offer modal
  const aggregatedLayoutData = createMemo(() => {
    // Depend on the trigger to ensure reactivity when fields are mutated
    fieldsUpdateTrigger();

    const fields = fieldsData();
    if (!fields || fields.length === 0) {
      return undefined;
    }

    const allTreeMarkers: any[] = [];
    const speciesCount: Record<string, any> = {};

    fields.forEach((field) => {
      if (field.systemLayout?.treeMarkerArray) {
        allTreeMarkers.push(...field.systemLayout.treeMarkerArray);
      }

      if (field.systemLayout?.speciesCountArray) {
        field.systemLayout.speciesCountArray.forEach((item: any) => {
          const speciesEntry = item.species;
          const speciesId = speciesEntry?._id || speciesEntry;
          if (speciesId) {
            if (!speciesCount[speciesId]) {
              speciesCount[speciesId] = {
                species: speciesEntry,
                count: 0,
              };
            }
            speciesCount[speciesId].count += item.count;
          }
        });
      }
    });

    return {
      treeMarkerArray: allTreeMarkers,
      speciesCountArray: Object.values(speciesCount),
    };
  });

  const speciesBreakdown = createMemo(() => {
    const aggregated = aggregatedLayoutData();
    if (!aggregated?.speciesCountArray) return [];

    return aggregated.speciesCountArray.map((item: any, index: number) => {
      const speciesEntry = item.species;
      const speciesId =
        typeof speciesEntry === "object" && speciesEntry !== null
          ? (speciesEntry._id ?? `${index}`)
          : (speciesEntry ?? `${index}`);
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

      // Construct latin name from genus and species
      const latinName =
        speciesDoc?.genus && speciesDoc?.species
          ? `${speciesDoc.genus} ${speciesDoc.species}`
          : speciesDoc?.species || undefined;

      return {
        id: String(speciesId ?? index),
        name: displayName,
        latinName: latinName,
        count: Number(item.count ?? 0),
      };
    });
  });

  const totalTrees = createMemo(() => {
    return speciesBreakdown().reduce((sum, entry) => sum + (Number(entry.count) || 0), 0);
  });

  const userEmail = createMemo(() => {
    const authUser = getAuth0User();
    return authUser?.email || "";
  });

  // Track whether we've initialized field scenarios from the server
  const [fieldScenariosInitialized, setFieldScenariosInitialized] = createSignal(false);

  createEffect(() => {
    const config = configData();
    if (config) {
      setScenarioName(config.name ?? "");
      setScenarioDescription(config.description ?? "");
      setShowOfferButton(config.showOfferButton ?? true);

      // Only initialize field scenarios once on initial load
      // Don't overwrite user's unsaved changes when config updates from metadata saves
      if (!fieldScenariosInitialized()) {
        const selections = new Map<string, string | null>();
        config.fieldScenarios.forEach((fieldScenario: any) => {
          const layerIdRaw =
            typeof fieldScenario.layer === "string"
              ? fieldScenario.layer
              : fieldScenario.layer?._id;
          const layerIdValue = layerIdRaw ? String(layerIdRaw) : undefined;
          if (!layerIdValue) {
            return;
          }
          const projectIdRaw = fieldScenario.project
            ? typeof fieldScenario.project === "string"
              ? fieldScenario.project
              : fieldScenario.project?._id
            : null;
          const projectIdValue = projectIdRaw ? String(projectIdRaw) : null;
          selections.set(layerIdValue, projectIdValue);
        });
        setFieldScenarioSelections(selections);
        setSavedFieldScenarioSelections(new Map(selections)); // Save original state
        setFieldScenariosInitialized(true);
      }

      setIsPublic(Boolean(config.isPublic));
    }
  });

  // Check if anything has changed (metadata or field scenarios)
  const hasUnsavedChanges = createMemo(() => {
    const config = configData();
    if (!config) {
      return false;
    }

    // Check metadata changes
    const originalPublic = Boolean(config.isPublic);
    const originalShowOfferButton = config.showOfferButton ?? true;
    const metadataDirty =
      scenarioName().trim() !== (config.name ?? "") ||
      scenarioDescription().trim() !== (config.description ?? "") ||
      isPublic() !== originalPublic ||
      showOfferButton() !== originalShowOfferButton;

    // Check field scenario changes
    const current = fieldScenarioSelections();
    const saved = savedFieldScenarioSelections();
    let fieldScenariosDirty = false;

    if (current.size !== saved.size) {
      fieldScenariosDirty = true;
    } else {
      for (const [layerId, projectId] of current.entries()) {
        if (saved.get(layerId) !== projectId) {
          fieldScenariosDirty = true;
          break;
        }
      }
    }

    return metadataDirty || fieldScenariosDirty;
  });

  const [isSaving, setIsSaving] = createSignal(false);

  const handleSave = async () => {
    const config = configData();
    if (!config) {
      return;
    }

    const trimmedName = scenarioName().trim();
    if (!trimmedName) {
      showToast({
        title: "Name required",
        description: "Scenario name cannot be empty.",
        variant: "error",
      });
      return;
    }

    setIsSaving(true);
    try {
      const trimmedDescription = scenarioDescription().trim();
      const current = fieldScenarioSelections();

      // Build the updated fieldScenarios array from current selections
      const updatedFieldScenarios = Array.from(current.entries()).map(([layerId, projectId]) => ({
        layer: layerId,
        project: projectId || undefined,
        enabled: true,
      }));

      // Use the PUT endpoint to update the entire config
      const updatedConfig = await updateFarmScenarioConfig(params().farmScenarioId, {
        name: trimmedName,
        description: trimmedDescription || undefined,
        isPublic: isPublic(),
        showOfferButton: showOfferButton(),
        fieldScenarios: updatedFieldScenarios,
      });

      // Update local state
      setSavedFieldScenarioSelections(new Map(current));
      mutateConfig(() => updatedConfig);

      showToast({
        title: "Changes saved",
        description: "All changes have been saved successfully.",
        variant: "success",
      });
    } catch (error) {
      console.error("Failed to save:", error);
      showToast({
        title: "Save failed",
        description:
          error instanceof Error ? error.message : "Unable to save changes. Please try again.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const [layerProjects] = createResource(
    () => {
      if (!authReady()) {
        return null;
      }
      const layers = parcelLayersData();
      if (!layers || layers.length === 0) {
        return null;
      }
      const layerIds = layers.map((layer: any) => String(layer._id));
      return layerIds;
    },
    async (layerIds) => {
      if (!layerIds || layerIds.length === 0) {
        return new Map<string, any[]>();
      }

      const results = await Promise.all(
        layerIds.map(async (layerId) => {
          try {
            const response = await fetch(
              `${import.meta.env.VITE_BACKEND_URL}/layers/${layerId}/projects`,
              apiFetchOptions(),
            );
            if (!response.ok) {
              return [layerId, []] as const;
            }
            const projects = await response.json();
            return [layerId, projects] as const;
          } catch (error) {
            console.error(`Failed to fetch projects for layer ${layerId}:`, error);
            return [layerId, []] as const;
          }
        }),
      );

      return new Map(results);
    },
  );

  const selectableLayers = createMemo(() => {
    const layers = parcelLayersData();
    const projectsMap = layerProjects();
    const selections = fieldScenarioSelections();
    if (!layers || !projectsMap) {
      return [] as any[];
    }

    return layers
      .map((layer: any) => {
        const layerId = String(layer._id);
        const projectsRaw = projectsMap.get(layerId) ?? [];
        // Filter out deleted or invalid projects
        const projects = projectsRaw
          .filter((project: any) => project && project._id && project.name)
          .map((project: any) => ({
            ...project,
            _id: project._id ? String(project._id) : undefined,
          }));

        const selectedProjectId = selections.get(layerId) ?? null;
        const selectedProject = projects.find(
          (project: any) => String(project._id) === selectedProjectId,
        );

        return {
          layerId,
          layer,
          name: layer.name || "Unnamed Field",
          projects,
          selectedProjectId,
          selectedProjectName: selectedProject?.name,
          lat: layer.lat,
          lng: layer.lng,
        };
      })
      .filter((entry) => selections.has(entry.layerId));
  });

  const handleFieldSelection = async (field: { layerId: string; lat: number; lng: number }) => {
    if (!field.layerId) {
      return;
    }

    if (isMapFieldLoading()) {
      return;
    }

    setSelectedFieldId(field.layerId);
    setIsMapFieldLoading(true);

    if (map && mapLoaded()) {
      clearAllFieldLayers(map);
      map.easeTo({
        center: [field.lng, field.lat],
        duration: 1000,
      });

      // If this field has a selected scenario (project), ensure we have its system design,
      // then compute the system layout so it can be drawn by the map effects.
      try {
        const allFields = fieldsData();
        const selected = allFields?.find((f) => f.layerId === field.layerId);

        if (!selected || !selected.projectId) {
          // No scenario selected for this field
          console.log("No project selected for field");
        } else {
          let systemDesign = selected.systemDesign;

          console.log("Field has project:", {
            projectId: selected.projectId,
            hasSystemDesign: !!systemDesign,
            systemDesign: systemDesign,
          });

          // Fetch project to get system design if missing
          if (!systemDesign) {
            console.log("System design missing, fetching project...");
            const resp = await fetch(
              `${import.meta.env.VITE_BACKEND_URL}/projects/${selected.projectId}`,
              apiFetchOptions(),
            );
            if (resp.ok) {
              const project = await resp.json();
              console.log("Fetched project:", project);
              systemDesign = project?.systemdesign ?? project?.systemDesign ?? null;
            } else {
              console.error(`Failed to fetch project ${selected.projectId}: ${resp.statusText}`);

              // If project not found, clear it from the field
              if (resp.status === 404) {
                console.warn("Project not found, clearing from field");
                selected.projectId = undefined;
                selected.systemDesign = null;
                selected.systemLayout = undefined;
                // Continue to draw the field geometry without the system design
              }
            }
          } else {
            console.log("Using system design from config");
          }

          if (systemDesign) {
            // Validate system design has required data
            if (
              !systemDesign.rows ||
              !Array.isArray(systemDesign.rows) ||
              systemDesign.rows.length === 0
            ) {
              console.warn("System design is missing rows data, skipping layout calculation");
              selected.systemDesign = systemDesign;
              selected.systemLayout = undefined;
              // Continue to draw the field without system layout
            } else {
              const geometryString =
                typeof selected.geometry === "string"
                  ? selected.geometry
                  : JSON.stringify(selected.geometry);

              try {
                const layout = await generateLayout(systemDesign, geometryString);
                // Mutate the selected field so downstream effects can draw it
                selected.systemDesign = systemDesign;
                selected.systemLayout = layout;
              } catch (e) {
                console.error("Failed to compute system layout:", e);
                console.error("System design:", systemDesign);
                // Set systemDesign but leave systemLayout undefined
                selected.systemDesign = systemDesign;
                selected.systemLayout = undefined;
              }
            }
          }
        }
      } catch (e) {
        console.error("Error preparing system design/layout for selected field:", e);
      }
    }

    drawField();
    setIsMapFieldLoading(false);
  };

  const handleFieldScenarioChange = async (layerId: string, projectId: string) => {
    const normalizedProjectId = projectId === "" ? null : projectId;
    const layerIdString = String(layerId);
    if (!layerIdString) {
      return;
    }
    const previousSelection = fieldScenarioSelections().get(layerIdString) ?? null;
    const previousField = selectedFieldId();

    if (previousSelection === normalizedProjectId) {
      if (previousField !== layerIdString) {
        setSelectedFieldId(layerIdString);
      }
      return;
    }

    const config = configData();
    if (!config) {
      return;
    }

    setUpdatingFieldId(layerIdString);
    setSelectedFieldId(layerIdString);
    setIsMapFieldLoading(true);

    if (map && mapLoaded()) {
      clearAllFieldLayers(map);
    }

    // Update the selection (optimistic update for preview)
    setFieldScenarioSelections((prev) => {
      const next = new Map(prev);
      next.set(layerIdString, normalizedProjectId);
      return next;
    });

    try {
      if (map && mapLoaded()) {
        clearAllFieldLayers(map);

        // If this field has a selected scenario (project), ensure we have its system design,
        // then compute the system layout so it can be drawn by the map effects.
        try {
          const allFields = fieldsData();
          const selected = allFields?.find((f) => f.layerId === layerId);

          if (selected) {
            // Update the project ID
            selected.projectId = normalizedProjectId ?? undefined;

            // If no project selected, clear the system design
            if (!normalizedProjectId) {
              console.log("No scenario selected, clearing system design");
              selected.projectName = undefined;
              selected.systemDesign = null;
              selected.systemLayout = undefined;
              // Trigger reactivity update
              setFieldsUpdateTrigger((prev) => prev + 1);
            }

            map.easeTo({
              center: [selected.lng, selected.lat],
              duration: 1000,
            });

            if (normalizedProjectId) {
              try {
                const resp = await fetch(
                  `${import.meta.env.VITE_BACKEND_URL}/projects/${normalizedProjectId}`,
                  apiFetchOptions(),
                );

                if (resp.ok) {
                  const project = await resp.json();
                  selected.projectName = project?.name ?? selected.projectName;
                  selected.systemDesign =
                    project?.systemdesign ?? project?.systemDesign ?? selected.systemDesign;
                } else {
                  console.error(
                    `Failed to fetch project ${normalizedProjectId}: ${resp.status} ${resp.statusText}`,
                  );

                  // If project not found, show warning and clear selection
                  if (resp.status === 404) {
                    showToast({
                      title: "Scenario not found",
                      description:
                        "The selected scenario no longer exists. Please choose a different one.",
                      variant: "error",
                    });

                    // Clear the invalid project reference
                    selected.projectId = undefined;
                    selected.systemDesign = null;
                    selected.systemLayout = undefined;
                  }
                }
              } catch (e) {
                console.error(`Error fetching project ${normalizedProjectId}:`, e);
              }
            }
          }

          if (!selected || !selected.projectId) {
            // No scenario selected for this field
          } else {
            let systemDesign = selected.systemDesign;

            // Fetch project to get system design if missing
            if (!systemDesign) {
              const resp = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/projects/${selected.projectId}`,
                apiFetchOptions(),
              );
              if (resp.ok) {
                const project = await resp.json();
                systemDesign = project?.systemdesign ?? project?.systemDesign ?? null;
              } else {
                console.error(`Failed to fetch project ${selected.projectId}: ${resp.statusText}`);

                // If project not found, clear the reference
                if (resp.status === 404) {
                  console.warn("Project not found, clearing from field");
                  selected.projectId = undefined;
                  selected.systemDesign = null;
                  selected.systemLayout = undefined;
                }
              }
            }

            if (systemDesign) {
              // Validate system design has required data
              if (
                !systemDesign.rows ||
                !Array.isArray(systemDesign.rows) ||
                systemDesign.rows.length === 0
              ) {
                console.warn("System design is missing rows data, skipping layout calculation");
                selected.systemDesign = systemDesign;
                selected.systemLayout = undefined;
              } else {
                const geometryString =
                  typeof selected.geometry === "string"
                    ? selected.geometry
                    : JSON.stringify(selected.geometry);

                try {
                  const layout = await generateLayout(systemDesign, geometryString);
                  // Mutate the selected field so downstream effects can draw it
                  selected.systemDesign = systemDesign;
                  selected.systemLayout = layout;
                  // Trigger reactivity update for aggregated data
                  setFieldsUpdateTrigger((prev) => prev + 1);
                } catch (e) {
                  console.error("Failed to compute system layout:", e);
                  console.error("System design:", systemDesign);
                  // Set systemDesign but leave systemLayout undefined
                  selected.systemDesign = systemDesign;
                  selected.systemLayout = undefined;
                  // Trigger reactivity update even on error
                  setFieldsUpdateTrigger((prev) => prev + 1);
                }
              }
            }
          }
        } catch (e) {
          console.error("Error preparing system design/layout for selected field:", e);
        }
      }
    } catch (error) {
      console.error(`Failed to update field scenario for layer ${layerIdString}:`, error);
      setFieldScenarioSelections((prev) => {
        const next = new Map(prev);
        next.set(layerIdString, previousSelection);
        return next;
      });
      if (previousField) {
        setSelectedFieldId(previousField);
      }
      showToast({
        title: "Update failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to update the selected scenario. Please try again.",
        variant: "error",
      });
    } finally {
      setUpdatingFieldId(null);
      drawField();
      setIsMapFieldLoading(false);
    }
  };

  const mapBounds = createMemo(() => {
    const field = selectedField();
    if (!field) return null;

    const fc = turf.featureCollection([field.geometry]);
    const bounds = bbox(fc);

    return [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ];
  });

  const mapCenter = createMemo(() => {
    const field = selectedField();
    if (field) {
      return [field.lng, field.lat];
    }

    // If no field is selected, use the first available field as the center
    const fields = fieldsData();
    if (fields && fields.length > 0) {
      return [fields[0].lng, fields[0].lat];
    }

    return [0, 0];
  });

  let map: maplibregl.Map | undefined;
  const [mapRef, setMapRef] = createSignal<HTMLElement>();

  let renderedFieldId: string | null = null;
  type LayerEventHandler = (event: maplibregl.MapMouseEvent) => void;
  const layerEventHandlers = new Map<
    string,
    {
      mouseenter: LayerEventHandler;
      mouseleave: LayerEventHandler;
      click: LayerEventHandler;
    }
  >();

  const clearAllFieldLayers = (targetMap: maplibregl.Map) => {
    layerEventHandlers.forEach((handlers, layerKey) => {
      targetMap.off("mouseenter", layerKey, handlers.mouseenter);
      targetMap.off("mouseleave", layerKey, handlers.mouseleave);
      targetMap.off("click", layerKey, handlers.click);
    });
    layerEventHandlers.clear();

    const style = targetMap.getStyle();

    if (style?.layers) {
      style.layers
        .map((layer) => layer.id)
        .filter((id) => id.startsWith("field-"))
        .forEach((id) => {
          if (targetMap.getLayer(id)) {
            targetMap.removeLayer(id);
          }
        });
    }

    if (style?.sources) {
      Object.keys(style.sources)
        .filter((sourceId) => sourceId.startsWith("field-"))
        .forEach((sourceId) => {
          if (targetMap.getSource(sourceId)) {
            targetMap.removeSource(sourceId);
          }
        });
    }

    renderedFieldId = null;
  };

  createEffect(() => {
    const field = selectedField();
    const container = mapRef();
    const fields = fieldsData();

    if (!container) {
      if (map) {
        if (mapLoaded()) {
          clearAllFieldLayers(map);
        }
        renderedFieldId = null;
        map.remove();
        map = undefined;
        setMapLoaded(false);
      }
      return;
    }

    // Wait for fields data to load before initializing map
    if (!fields || fields.length === 0) {
      return;
    }

    // Initialize map even if no field is selected
    if (!map) {
      map = new maplibregl.Map({
        container,
        attributionControl: false,
        style: GoogleSatStyle,
        center: mapCenter() as [number, number],
        zoom: 13,
        maxZoom: 20,
        pitch: configData()?.displaySettings?.initialPitch || 0,
        bearing: configData()?.displaySettings?.initialBearing || 0,
      });

      map.on("load", () => {
        const bounds = mapBounds();
        // Only fit to bounds if a field is selected
        if (bounds && field) {
          map!.fitBounds(bounds as any, { padding: 50 });
        }

        // const { show3D: controlShow3D, setShow3D: setControlShow3D } =
        //   use3DControl(map!, aggregatedLayoutData, species);

        // createEffect(() => {
        //   const is3D = controlShow3D();
        //   setShow3D(is3D);
        // });

        // Add navigation control (compass/north arrow + zoom buttons)
        const nav = new maplibregl.NavigationControl({
          showCompass: true,
          showZoom: true,
          visualizePitch: true,
        });
        map!.addControl(nav, "top-right");

        // Add scale control
        const scale = new maplibregl.ScaleControl({
          maxWidth: 100,
          unit: "metric",
        });
        map!.addControl(scale, "bottom-right");

        setMapLoaded(true);
      });
    } else if (mapLoaded() && field) {
      // Only pan to field if one is selected, without changing zoom
      map!.easeTo({
        center: mapCenter() as [number, number],
        duration: 800,
      });
    }
  });

  function drawField() {
    if (!map || !mapLoaded()) {
      return;
    }

    const field = selectedField()!;

    const layerId = `field-${field.layerId}`;

    map!.addSource(layerId, {
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

    map!.addLayer({
      id: layerId,
      type: "fill",
      source: layerId,
      layout: {},
      paint: {
        "fill-color": "#4ade80",
        "fill-opacity": 0.3,
      },
    });

    map!.addLayer({
      id: `${layerId}-border`,
      type: "line",
      source: layerId,
      layout: {},
      paint: {
        "line-color": "#22c55e",
        "line-width": 3,
      },
    });

    const handleMouseEnter: LayerEventHandler = () => {
      map!.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeave: LayerEventHandler = () => {
      map!.getCanvas().style.cursor = "";
    };
    const handleLayerClick: LayerEventHandler = (event) => {
      event.preventDefault();
      void handleFieldSelection({
        layerId: field.layerId,
        lat: field.lat,
        lng: field.lng,
      });
    };

    map!.on("mouseenter", layerId, handleMouseEnter);
    map!.on("mouseleave", layerId, handleMouseLeave);
    map!.on("click", layerId, handleLayerClick);

    layerEventHandlers.set(layerId, {
      mouseenter: handleMouseEnter,
      mouseleave: handleMouseLeave,
      click: handleLayerClick,
    });

    if (field.systemLayout && field.systemDesign) {
      const fieldPrefix = `field-${field.layerId}-`;
      drawSystemDesignWithPrefix(map!, field.systemLayout, show3D(), fieldPrefix);
    }

    renderedFieldId = field.layerId;
  }

  // Redraw when 3D mode changes
  function toggle2D3D() {
    const field = selectedField();
    const is3D = show3D();

    if (!map || !mapLoaded() || !field || isMapFieldLoading()) {
      return;
    }

    const layerId = `field-${field.layerId}`;
    const borderLayerId = `${layerId}-border`;

    if (is3D) {
      if (field.systemLayout && field.systemDesign) {
        const fieldPrefix = `field-${field.layerId}-`;
        drawSystemDesignWithPrefix(map!, field.systemLayout, true, fieldPrefix);
      }

      if (map!.getLayer(layerId)) {
        map!.setLayoutProperty(layerId, "visibility", "none");
      }
      if (map!.getLayer(borderLayerId)) {
        map!.setLayoutProperty(borderLayerId, "visibility", "none");
      }
    } else {
      if (map!.getLayer(layerId)) {
        map!.setLayoutProperty(layerId, "visibility", "visible");
      }
      if (map!.getLayer(borderLayerId)) {
        map!.setLayoutProperty(borderLayerId, "visibility", "visible");
      }

      if (field.systemLayout && field.systemDesign) {
        const fieldPrefix = `field-${field.layerId}-`;
        drawSystemDesignWithPrefix(map!, field.systemLayout, false, fieldPrefix);
      }
    }
  }

  return (
    <div style={{ height: "calc(100vh - var(--app-nav-height, 3.5rem))" }}>
      <Resizable>
        {/* Sidebar with field list */}
        <ResizablePanel
          initialSize={0.5}
          minSize={0.2}
          maxSize={0.7}
          collapsible={false}
          style={{ overflow: "hidden" }}
        >
          <div class="flex h-full flex-col overflow-y-auto bg-white dark:bg-gray-900">
            <div class="p-4">
              <h2 class="text-xl font-bold mb-4">Farm Planting Plan</h2>

              <Show
                when={!configData.error && configData()}
                fallback={
                  <div>
                    {configData.error ? (
                      <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <p class="text-red-600 dark:text-red-400 font-semibold">
                          Error loading configuration
                        </p>
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
                    ) : !authReady() ? (
                      <div>Initializing authentication...</div>
                    ) : (
                      <div>Loading configuration...</div>
                    )}
                  </div>
                }
              >
                <div class="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                  <div>
                    <label class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Scenario name
                    </label>
                    <input
                      type="text"
                      value={scenarioName()}
                      onInput={(event) => setScenarioName(event.currentTarget.value)}
                      class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                      placeholder="Scenario name"
                      disabled={isSaving()}
                    />
                  </div>
                  <div>
                    <label class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={scenarioDescription()}
                      onInput={(event) => setScenarioDescription(event.currentTarget.value)}
                      class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                      placeholder="Add a short description for this scenario"
                      disabled={isSaving()}
                    />
                  </div>
                  <div class="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900">
                    {/* Toggle on the left */}
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                      checked={isPublic()}
                      disabled={isSaving()}
                      onChange={(event) => setIsPublic(event.currentTarget.checked)}
                    />

                    {/* Text in the middle */}
                    <div class="flex-1">
                      <span
                        class={`text-xs font-semibold uppercase tracking-wide transition-colors ${
                          isPublic()
                            ? "text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        Public preview
                      </span>
                      <p
                        class={`mt-0.5 text-xs transition-colors ${
                          isPublic()
                            ? "text-gray-700 dark:text-gray-200"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        Allow anyone with the link to view this farm planting plan.
                      </p>
                    </div>

                    {/* Link icon on the right - only shown when saved as public */}
                    <Show when={configData()?.isPublic === true}>
                      <a
                        href={`/farm-scenario-preview/${params().farmScenarioId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex-shrink-0 p-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                        title="Open preview link"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      </a>
                    </Show>
                  </div>

                  <div class="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900">
                    {/* Toggle on the left */}
                    <input
                      type="checkbox"
                      class={`h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 ${
                        !isPublic() || isSaving()
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer"
                      }`}
                      checked={showOfferButton()}
                      disabled={!isPublic() || isSaving()}
                      onChange={(event) => setShowOfferButton(event.currentTarget.checked)}
                    />

                    {/* Text in the middle */}
                    <div class="flex-1">
                      <span
                        class={`text-xs font-semibold uppercase tracking-wide transition-colors ${
                          !isPublic()
                            ? "text-gray-400 dark:text-gray-600"
                            : showOfferButton()
                              ? "text-gray-900 dark:text-white"
                              : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        Show offer button in public preview
                      </span>
                      <p
                        class={`mt-0.5 text-xs transition-colors ${
                          !isPublic()
                            ? "text-gray-400 dark:text-gray-600"
                            : showOfferButton()
                              ? "text-gray-700 dark:text-gray-200"
                              : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        Display "Request offer on trees" button in the preview for eligible
                        countries.
                      </p>
                    </div>
                  </div>
                </div>
              </Show>

              <div class="space-y-2">
                <h4 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Field Scenarios
                </h4>

                <Show when={!layerProjects.loading} fallback={<div>Loading fields...</div>}>
                  <Show
                    when={selectableLayers().length > 0}
                    fallback={
                      <div class="text-sm text-gray-500 dark:text-gray-400">
                        No fields with scenarios available.
                      </div>
                    }
                  >
                    <For each={selectableLayers()}>
                      {(field) => (
                        <div
                          class={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedFieldId() === field.layerId
                              ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                          }`}
                          onClick={() => {
                            void handleFieldSelection(field);
                          }}
                        >
                          <div class="font-medium">{field.name}</div>
                          <div class="mt-3 space-y-1">
                            <label class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Selected scenario
                            </label>
                            <select
                              class="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              value={fieldScenarioSelections().get(field.layerId) ?? ""}
                              onChange={(event) =>
                                handleFieldScenarioChange(field.layerId, event.currentTarget.value)
                              }
                              disabled={
                                isSaving() ||
                                layerProjects.loading ||
                                updatingFieldId() === field.layerId ||
                                (field.projects?.length ?? 0) === 0
                              }
                            >
                              <option value="">
                                {(field.projects?.length ?? 0) === 0
                                  ? "No scenarios available"
                                  : "No scenario selected"}
                              </option>
                              <For each={field.projects}>
                                {(project: any) => (
                                  <option value={project._id ? String(project._id) : ""}>
                                    {project.name || "Unnamed scenario"}
                                  </option>
                                )}
                              </For>
                            </select>
                            <Show when={(field.projects?.length ?? 0) === 0}>
                              <div class="text-xs text-amber-600 dark:text-amber-400">
                                Create a system design for this field to enable scenario selection.
                              </div>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </Show>
                </Show>
              </div>

              {/* Unified save button */}
              <div class="mt-6 px-4 flex justify-end">
                <button
                  type="button"
                  class="rounded-sm px-3 py-1 text-sm btn-primary bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges() || isSaving()}
                >
                  {isSaving() ? "Saving..." : "Save changes"}
                </button>
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
                        {fieldsData()!.filter((f) => f.projectId).length}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-600 dark:text-gray-400">Total trees:</span>
                      <span class="font-medium">{totalTrees().toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Request offer on trees button */}
              <Show when={totalTrees() > 0}>
                <div class="mt-4 px-4">
                  <Button class="w-full" onClick={() => setOfferModalOpen(true)}>
                    Request offer on trees ({totalTrees().toLocaleString()} trees)
                  </Button>
                </div>
              </Show>
            </div>
          </div>
        </ResizablePanel>

        {/* Drag Handle */}
        <ResizableHandle withHandle />
        <ResizablePanel initialSize={0.5}>
          <div class="relative h-full w-full">
            <div ref={(el) => setMapRef(el)} class="h-full w-full" />

            {/* Info box for selected field */}
            <Show when={!isMapFieldLoading() && selectedField()}>
              {(fieldGetter) => {
                const field = fieldGetter();
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
                            geometry: JSON.stringify(field!.geometry),
                          },
                        },
                      }}
                    />
                  </Show>
                );
              }}
            </Show>
          </div>
        </ResizablePanel>
      </Resizable>

      <OfferRequestModal
        isOpen={isOfferModalOpen()}
        onOpenChange={setOfferModalOpen}
        speciesBreakdown={speciesBreakdown()}
        configId={params().farmScenarioId}
        userEmail={userEmail()}
      />
    </div>
  );
};
