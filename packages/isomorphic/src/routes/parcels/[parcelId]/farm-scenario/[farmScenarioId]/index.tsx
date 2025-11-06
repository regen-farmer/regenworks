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
import {
  getFarmScenarioConfig,
  updateFarmScenarioConfig,
} from "~/util/api/farmScenarioConfig";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { bbox, helpers as turf } from "@turf/turf";
import { getAuth0User } from "~/auth/useAuth";
import { showToast } from "~/components/ui/toast";

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
  const params = useParams<{ parcelId: string; farmScenarioId: string }>();
  const species = getSpecies();
  const [mapLoaded, setMapLoaded] = createSignal<boolean>(false);
  const [selectedFieldId, setSelectedFieldId] = createSignal<string | null>(
    null
  );
  const [show3D, setShow3D] = createSignal(false);
  const [scenarioName, setScenarioName] = createSignal("");
  const [scenarioDescription, setScenarioDescription] = createSignal("");
  const [isPublic, setIsPublic] = createSignal(false);
  const [isSavingDetails, setIsSavingDetails] = createSignal(false);
  const [fieldScenarioSelections, setFieldScenarioSelections] = createSignal<
    Map<string, string | null>
  >(new Map());
  const [updatingFieldId, setUpdatingFieldId] = createSignal<string | null>(
    null
  );
  const [isMapFieldLoading, setIsMapFieldLoading] = createSignal(false);

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
          console.log(
            "Auth became available, proceeding with authenticated request"
          );
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
    () => authReady() && params.farmScenarioId,
    async (farmScenarioId) => {
      if (!farmScenarioId) return null;

      try {
        const data = await getFarmScenarioConfig(farmScenarioId);
        return data;
      } catch (error) {
        console.error("Error fetching farm scenario config:", error);
        throw error;
      }
    }
  );

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
        const projectData = fieldScenario.project;

        let systemDesign = null;
        let systemLayout = null;

        // Get system design if available
        if (projectData?.systemdesign) {
          systemDesign = projectData.systemdesign;

          // Calculate system layout - pass the geometry as a string
          // try {
          //   const geometryString = layerData.geometry.replace(/&#34;/g, '"');
          //   systemLayout = systemBasedLayout(systemDesign, geometryString);
          // } catch (error) {
          //   console.error(`Failed to calculate system layout for layer ${layerData._id}:`, error);
          //   // Continue without system layout for this field
          //   systemLayout = null;
          // }
        }

        fields.push({
          layerId: layerData._id ? String(layerData._id) : "",
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
    }
  );

  const [parcelLayersData] = createResource(
    () => (authReady() ? params.parcelId : undefined),
    async (parcelId) => {
      if (!parcelId) return [];

      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/parcels/${parcelId}/layers`,
          apiFetchOptions()
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
    }
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

  // Aggregate tree data from the selected field for 3D display
  const aggregatedLayoutData = createMemo(() => {
    const field = selectedField();
    if (!field || !field.systemLayout || !field.projectId) {
      return undefined;
    }

    const treeMarkerArray = field.systemLayout.treeMarkerArray ?? [];
    const speciesCount: Record<string, number> = {};

    if (field.systemLayout.speciesCountArray) {
      field.systemLayout.speciesCountArray.forEach((item: any) => {
        const speciesId = item.species?._id || item.species;
        if (speciesId) {
          speciesCount[speciesId] = (speciesCount[speciesId] || 0) + item.count;
        }
      });
    }

    return treeMarkerArray.length > 0
      ? {
          treeMarkerArray,
          speciesCountArray: Object.entries(speciesCount).map(
            ([species, count]) => ({
              species,
              count,
            })
          ),
        }
      : undefined;
  });

  createEffect(() => {
    const config = configData();
    if (config) {
      setScenarioName(config.name ?? "");
      setScenarioDescription(config.description ?? "");
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
      setIsPublic(Boolean(config.isPublic));
    }
  });

  const detailsDirty = createMemo(() => {
    const config = configData();
    if (!config) {
      return false;
    }
    const originalPublic = Boolean(config.isPublic);
    return (
      scenarioName().trim() !== (config.name ?? "") ||
      scenarioDescription().trim() !== (config.description ?? "") ||
      isPublic() !== originalPublic
    );
  });

  const handleResetDetails = () => {
    const config = configData();
    if (config) {
      setScenarioName(config.name ?? "");
      setScenarioDescription(config.description ?? "");
      setIsPublic(Boolean(config.isPublic));
    }
  };

  const handleSaveDetails = async () => {
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

    setIsSavingDetails(true);
    try {
      const trimmedDescription = scenarioDescription().trim();
      const updatedConfig = await updateFarmScenarioConfig(
        params.farmScenarioId,
        {
          name: trimmedName,
          description: trimmedDescription || undefined,
          isPublic: isPublic(),
        }
      );
      showToast({
        title: "Scenario updated",
        description: "Name and description saved successfully.",
        variant: "success",
      });
      mutateConfig((previous) =>
        previous
          ? {
              ...previous,
              name: updatedConfig.name ?? trimmedName,
              description:
                typeof updatedConfig.description === "string"
                  ? updatedConfig.description
                  : trimmedDescription,
              isPublic:
                typeof updatedConfig.isPublic === "boolean"
                  ? updatedConfig.isPublic
                  : isPublic(),
            }
          : previous
      );
    } catch (error) {
      console.error("Failed to update scenario details:", error);
      showToast({
        title: "Update failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to save the scenario details. Please try again.",
        variant: "error",
      });
    } finally {
      setIsSavingDetails(false);
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
              apiFetchOptions()
            );
            if (!response.ok) {
              return [layerId, []] as const;
            }
            const projects = await response.json();
            return [layerId, projects] as const;
          } catch (error) {
            console.error(
              `Failed to fetch projects for layer ${layerId}:`,
              error
            );
            return [layerId, []] as const;
          }
        })
      );

      return new Map(results);
    }
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
        const projects = projectsRaw.map((project: any) => ({
          ...project,
          _id: project._id ? String(project._id) : undefined,
        }));

        const selectedProjectId = selections.get(layerId) ?? null;
        const selectedProject = projects.find(
          (project: any) => String(project._id) === selectedProjectId
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
      .filter(
        (entry) =>
          selections.has(entry.layerId) && (entry.projects?.length ?? 0) > 0
      );
  });

  const handleFieldSelection = async (field: {
    layerId: string;
    lat: number;
    lng: number;
  }) => {
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
        zoom: 15,
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
            systemDesign: systemDesign
          });

          // Fetch project to get system design if missing
          if (!systemDesign) {
            console.log("System design missing, fetching project...");
            const resp = await fetch(
              `${import.meta.env.VITE_BACKEND_URL}/projects/${
                selected.projectId
              }`,
              apiFetchOptions()
            );
            if (resp.ok) {
              const project = await resp.json();
              console.log("Fetched project:", project);
              systemDesign =
                project?.systemdesign ?? project?.systemDesign ?? null;
            } else {
              console.error(
                `Failed to fetch project ${selected.projectId}: ${resp.statusText}`
              );

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
            if (!systemDesign.rows || !Array.isArray(systemDesign.rows) || systemDesign.rows.length === 0) {
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
                const layout = systemBasedLayout(systemDesign, geometryString);
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
        console.error(
          "Error preparing system design/layout for selected field:",
          e
        );
      }
    }

    drawField();
    setIsMapFieldLoading(false);
  };

  const handleFieldScenarioChange = async (
    layerId: string,
    projectId: string
  ) => {
    const normalizedProjectId = projectId === "" ? null : projectId;
    const layerIdString = String(layerId);
    if (!layerIdString) {
      return;
    }
    const previousSelection =
      fieldScenarioSelections().get(layerIdString) ?? null;
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

    setFieldScenarioSelections((prev) => {
      const next = new Map(prev);
      next.set(layerIdString, normalizedProjectId);
      return next;
    });

    try {
      const updatedFieldScenarios = config.fieldScenarios.map(
        (fieldScenario: any) => {
          const layerIdRaw =
            typeof fieldScenario.layer === "string"
              ? fieldScenario.layer
              : fieldScenario.layer?._id || fieldScenario.layer?.id;
          const layerIdValue = layerIdRaw ? String(layerIdRaw) : undefined;

          const existingProjectIdRaw = fieldScenario.project
            ? typeof fieldScenario.project === "string"
              ? fieldScenario.project
              : fieldScenario.project?._id
            : null;
          const existingProjectId = existingProjectIdRaw
            ? String(existingProjectIdRaw)
            : null;

          const projectToUse =
            layerIdValue === layerIdString
              ? normalizedProjectId
              : existingProjectId;

          const finalLayerId = layerIdValue ?? layerIdString;
          if (!finalLayerId) {
            return undefined;
          }

          const scenarioPayload: any = {
            layer: finalLayerId,
            enabled:
              typeof fieldScenario.enabled === "boolean"
                ? fieldScenario.enabled
                : true,
          };

          if (typeof fieldScenario.displayOrder !== "undefined") {
            scenarioPayload.displayOrder = fieldScenario.displayOrder;
          }

          if (projectToUse === null) {
            scenarioPayload.project = undefined;
          } else if (projectToUse) {
            scenarioPayload.project = projectToUse;
          }

          return scenarioPayload;
        }
      );

      await updateFarmScenarioConfig(params.farmScenarioId, {
        fieldScenarios: updatedFieldScenarios.filter(Boolean),
      });

      showToast({
        title: "Scenario updated",
        description: "Field scenario selection saved.",
        variant: "success",
      });

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
            }

            map.easeTo({
              center: [selected.lng, selected.lat],
              zoom: 15,
              duration: 1000,
            });

            if (normalizedProjectId) {
              try {
                const resp = await fetch(
                  `${import.meta.env.VITE_BACKEND_URL}/projects/${normalizedProjectId}`,
                  apiFetchOptions()
                );

                if (resp.ok) {
                  const project = await resp.json();
                  selected.projectName = project?.name ?? selected.projectName;
                  selected.systemDesign =
                    project?.systemdesign ??
                    project?.systemDesign ??
                    selected.systemDesign;
                } else {
                  console.error(
                    `Failed to fetch project ${normalizedProjectId}: ${resp.status} ${resp.statusText}`
                  );

                  // If project not found, show warning and clear selection
                  if (resp.status === 404) {
                    showToast({
                      title: "Scenario not found",
                      description: "The selected scenario no longer exists. Please choose a different one.",
                      variant: "error",
                    });

                    // Clear the invalid project reference
                    selected.projectId = undefined;
                    selected.systemDesign = null;
                    selected.systemLayout = undefined;
                  }
                }
              } catch (e) {
                console.error(
                  `Error fetching project ${normalizedProjectId}:`,
                  e
                );
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
                `${import.meta.env.VITE_BACKEND_URL}/projects/${
                  selected.projectId
                }`,
                apiFetchOptions()
              );
              if (resp.ok) {
                const project = await resp.json();
                systemDesign =
                  project?.systemdesign ?? project?.systemDesign ?? null;
              } else {
                console.error(
                  `Failed to fetch project ${selected.projectId}: ${resp.statusText}`
                );

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
              if (!systemDesign.rows || !Array.isArray(systemDesign.rows) || systemDesign.rows.length === 0) {
                console.warn("System design is missing rows data, skipping layout calculation");
                selected.systemDesign = systemDesign;
                selected.systemLayout = undefined;
              } else {
                const geometryString =
                  typeof selected.geometry === "string"
                    ? selected.geometry
                    : JSON.stringify(selected.geometry);

                try {
                  const layout = systemBasedLayout(systemDesign, geometryString);
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
          console.error(
            "Error preparing system design/layout for selected field:",
            e
          );
        }
      }
    } catch (error) {
      console.error(
        `Failed to update field scenario for layer ${layerIdString}:`,
        error
      );
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
    if (!field) return [0, 0];

    return [field.lng, field.lat];
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

    if (!container || !field || !field.projectId) {
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
        if (bounds) {
          map!.fitBounds(bounds as any, { padding: 50 });
        }

        // const { show3D: controlShow3D, setShow3D: setControlShow3D } =
        //   use3DControl(map!, aggregatedLayoutData, species);

        // createEffect(() => {
        //   const is3D = controlShow3D();
        //   setShow3D(is3D);
        // });

        const nav = new MaptilerNavigationControl();
        map!.addControl(nav, "top-right");

        setMapLoaded(true);
      });
    } else if (mapLoaded()) {
      map!.easeTo({
        center: mapCenter() as [number, number],
        zoom: Math.max(map!.getZoom(), 13),
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
      drawSystemDesignWithPrefix(
        map!,
        field.systemLayout,
        show3D(),
        fieldPrefix
      );
    }

    renderedFieldId = field.layerId;

    const bounds = mapBounds();
    if (bounds) {
      map!.fitBounds(bounds as any, { padding: 50 });
    }
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
        drawSystemDesignWithPrefix(
          map!,
          field.systemLayout,
          false,
          fieldPrefix
        );
      }
    }
  }

  return (
    <div
      class="flex flex-1 min-h-0 overflow-hidden"
      style={{ height: "calc(100vh - var(--app-nav-height, 3.5rem))" }}
    >
      {/* Sidebar with field list */}
      <div class="flex h-full w-80 flex-col overflow-y-auto border-r border-gray-200 bg-white p-0 dark:border-gray-700 dark:bg-gray-900">
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
                      {configData.error.message.includes(
                        "Authentication required"
                      )
                        ? "This configuration is private. Please log in to view it."
                        : configData.error.message ||
                          "Failed to load preview data"}
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
                  onInput={(event) =>
                    setScenarioName(event.currentTarget.value)
                  }
                  class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Scenario name"
                  disabled={isSavingDetails()}
                />
              </div>
              <div>
                <label class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={scenarioDescription()}
                  onInput={(event) =>
                    setScenarioDescription(event.currentTarget.value)
                  }
                  class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  placeholder="Add a short description for this scenario"
                  disabled={isSavingDetails()}
                />
              </div>
              <div class="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                <div>
                  <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Public preview
                  </span>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Allow anyone with the link to view this farm planting plan.
                  </p>
                </div>
                <div>
                <label class="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    checked={isPublic()}
                    disabled={isSavingDetails()}
                    onChange={(event) =>
                      setIsPublic(event.currentTarget.checked)
                    }
                  />
                  
                  <span class="select-none text-gray-700 dark:text-gray-200">
                    {"Public"}
                  </span>
                  
                  
                </label>
                  <br />
                  <a
                    href={`/farm-scenario-preview/${params.farmScenarioId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Link
                  </a>
                  </div>
              </div>
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-sm px-3 py-1 text-sm btn-default"
                  onClick={handleResetDetails}
                  disabled={!detailsDirty() || isSavingDetails()}
                >
                  Reset
                </button>
                <button
                  type="button"
                  class="rounded-sm px-3 py-1 text-sm btn-primary bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  onClick={handleSaveDetails}
                  disabled={!detailsDirty() || isSavingDetails()}
                >
                  {isSavingDetails() ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </Show>

          <div class="space-y-2">
            <h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Fields
            </h3>

            <Show
              when={!layerProjects.loading}
              fallback={<div>Loading fields...</div>}
            >
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
                          class="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          value={
                            fieldScenarioSelections().get(field.layerId) ?? ""
                          }
                          onChange={(event) =>
                            handleFieldScenarioChange(
                              field.layerId,
                              event.currentTarget.value
                            )
                          }
                          disabled={
                            layerProjects.loading ||
                            updatingFieldId() === field.layerId ||
                            isSavingDetails()
                          }
                        >
                          <option value="">No scenario selected</option>
                          <For each={field.projects}>
                            {(project: any) => (
                              <option
                                value={project._id ? String(project._id) : ""}
                              >
                                {project.name || "Unnamed scenario"}
                              </option>
                            )}
                          </For>
                        </select>
                        <div class="text-xs text-gray-500 dark:text-gray-400"></div>
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </Show>
          </div>

          {/* Summary stats */}
          <Show when={fieldsData() && fieldsData()!.length > 0}>
            <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Summary
              </h3>
              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">
                    Total Fields:
                  </span>
                  <span class="font-medium">{fieldsData()!.length}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">
                    With Scenarios:
                  </span>
                  <span class="font-medium">
                    {fieldsData()!.filter((f) => f.projectId).length}
                  </span>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>

      {/* Map container */}
      <div class="relative flex-1 min-h-0">
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
    </div>
  );
};

export default FarmScenarioPreview;
