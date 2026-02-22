import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import { A, action, useLocation, useNavigate, useParams } from "@solidjs/router";
import maplibregl from "maplibre-gl";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
  onCleanup,
} from "solid-js";
import { createStore } from "solid-js/store";
import { AddRow } from "~/components/systems/add-row.tsx";
import {
  ComboboxContent,
  ComboboxControl,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxItemLabel,
  ComboboxRoot,
  ComboboxSection,
  ComboboxTrigger,
} from "~/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { useBSControl } from "~/util/map_controls/useBSControl.ts";
import { useHCControl } from "~/util/map_controls/useHCControl.ts";

import { withinDKBBox } from "~/util/map_controls/within-dk-bbox.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import { MaptilerNavigationControl } from "@maptiler/sdk";
import type { ISystemDesignSchema, SystemDesignDocument } from "@rw/db/schemas/systemdesign.ts";

import { generateLayout } from "~/util/layoutService.ts";
import type { ISystemBasedLayout } from "@rw/modelling/gis-ts/types/system-based-layout.ts";
import { OfferRequestModal } from "~/components/OfferRequestModal";
import { drawSystemDesign } from "~/components/systemDesigner/drawSystemDesign.ts";
import { SystemInfoBox } from "~/components/systemDesigner/SystemInfoBox.tsx";
import { TreeStripsExport } from "~/components/systemDesigner/TreeStripsExport.tsx";
import { Button } from "~/components/ui/button";
import { Resizable, ResizableHandle, ResizablePanel } from "~/components/ui/resizable";
import { getScenario } from "~/util/getScenario.ts";
import { getSpecies } from "~/util/getSpecies.ts";
import { use3DControl } from "~/util/map_controls/use3DControl.ts";
import { useMeasureControl } from "~/util/map_controls/useMeasureControl.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";

// import { toast } from "solid-sonner";
// import { Toaster } from "~/components/ui/sonner";

import type { LayerDocument } from "@rw/db/schemas/layer.ts";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import { getAuth0User, isFreemium } from "~/auth/useAuth";
import FarmerAdvisorSelector from "~/components/freemium/farmer-advisor-selector";
import { Row } from "~/components/row/Row";
import { setReloadSignal } from "~/components/select/project-select";
import { showToast, Toaster } from "~/components/ui/toast";

function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 == null || obj2 == null) return false;
  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
  }
  return true;
}

function systemDesignsAreEqual(sd1: string, sd2: string) {
  function deleteKeys(sd: SystemDesignDocument) {
    sd._id = undefined;
    sd.__v = undefined;

    for (const row of sd.rows) {
      row._id = undefined;
      row.headland = undefined;

      for (const sequence of row.sequence) {
        sequence._id = undefined;
      }
    }

    return sd;
  }

  const sd1JSON = deleteKeys(JSON.parse(sd1));
  const sd2JSON = deleteKeys(JSON.parse(sd2));

  return deepEqual(sd1JSON, sd2JSON);
}

export default function view() {
  const params = useParams<{
    projectId: string;
    parcelId: string;
    layerId: string;
  }>();

  const location = useLocation();
  const navigate = useNavigate();

  // Get initial tab from URL params, default to "edit"
  const getInitialTab = () => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("tab") || "edit";
  };

  const [activeTab, setActiveTab] = createSignal(getInitialTab());

  // Update active tab when URL changes
  createEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get("tab");
    if (tabParam && tabParam !== activeTab()) {
      setActiveTab(tabParam);
    }
  });

  // Handle tab change - update both state and URL
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Update URL without navigating away
    const newUrl = `${location.pathname}?tab=${value}`;
    navigate(newUrl, { replace: true });
  };

  const [systemLayout, setSystemLayout] = createSignal<ISystemBasedLayout>();
  const [show3D, setShow3D] = createSignal(false);
  const [mapInstance, setMapInstance] = createSignal<maplibregl.Map | undefined>();

  const [system, setSystem] = createStore<ISystemDesignSchema>({
    rows: [],
    bearing: 0,
    margin: 0,
    headland: 0,
  });

  async function getSystemDesign() {
    const start = Date.now();

    setPreviewing(true);

    try {
      const result = await generateLayout(system, scenarioData()?.project?.layer.geometry);

      setSystemLayout({
        treeRowLines: result.treeRowLines,
        groundCoverAreas: result.groundCoverAreas?.features || result.groundCoverAreas || [],
        groundCoverAreasM2: result.groundCoverAreasM2 || 0,
        headlandPolygon: result.headlandPolygon,
        marginPolygon: result.marginPolygon,
        speciesCountArray: result.speciesCountArray,
        sidesCloseToBearing:
          result.sidesCloseToBearing?.features || result.sidesCloseToBearing || [],
        intersectionPoints: result.intersectionPoints?.features || result.intersectionPoints || [],
        headlandSides: result.headlandSides?.features || result.headlandSides || [],
        treeMarkerArray: result.treeMarkerArray,
      } as ISystemBasedLayout);
    } catch (error) {
      console.error("Layout generation failed:", error);
    }

    // Don't touch

    window.dispatchEvent(new Event("resize"));

    setPreviewing(false);
    const timeTaken = Date.now() - start;
    console.log(`Rendering in: ${timeTaken} milliseconds`);
  }

  // Use createResource for project data to get refetch capability
  const [scenarioData, { refetch }] = createResource(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/layout`,
      apiFetchOptions(),
    );
    const result = await response.json();

    if (result?.project?.systemdesign) {
      setSavedSystem(JSON.parse(JSON.stringify(result.project.systemdesign!)));
      setSystem(result.project.systemdesign!);
    } else {
      // No saved system design, reset to empty
      setSavedSystem(undefined);
      setSystem({
        rows: [],
        bearing: 0,
        margin: 0,
        headland: 0,
      });
    }

    return result;
  });

  // Watch for URL changes and refetch
  createMemo(() => {
    refetch();
    return location.pathname;
  });

  // Clear systemLayout when project changes to remove old previews from map
  createEffect(() => {
    const projectId = params.projectId;
    // Clear the system layout when switching projects
    setSystemLayout(undefined);
  });

  const species = getSpecies();

  const [mapLoaded, setMapLoaded] = createSignal<boolean>(false);

  // const [mapCameraState, setMapCameraState] = createSignal({})
  const mapCameraState = {};

  let map: maplibregl.Map | undefined;

  createEffect(() => {
    // console.log('Updateing map', rebuildMap())

    if (scenarioData()) {
      if (!map) {
        const areaLat = scenarioData()?.project?.layer.lat;
        const areaLng = scenarioData()?.project?.layer.lng;

        map = new maplibregl.Map({
          container: "layerMapShow",
          attributionControl: false,
          style: GoogleSatStyle,
          center: [areaLng!, areaLat!],
          zoom: 16,
          maxZoom: 20,
          pitch: 0,
          // @ts-expect-error - preserveDrawingBuffer is needed for canvas export
          preserveDrawingBuffer: true, // Enable canvas export capability

          ...mapCameraState,
          // bearing: 40,
          // maxPitch: 85,
        });

        setMapInstance(map); // Store the map instance

        map.on("load", () => {
          window.dispatchEvent(new Event("resize"));

          const areaLat = scenarioData()?.project?.layer.lat;
          const areaLng = scenarioData()?.project?.layer.lng;

          // Use the 3D control and link it to our local signal
          const { show3D: controlShow3D, setShow3D: controlSetShow3D } = use3DControl(
            map,
            systemLayout,
            species,
          );

          // Create an effect to sync the control's signal with our local one
          createEffect(() => {
            const is3D = controlShow3D();
            setShow3D(is3D);
            // The global effect will handle the redraw
          });

          useMeasureControl(map);

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
          map!.addControl(nav, "top-right");

          // Add scale control
          const scale = new maplibregl.ScaleControl({
            maxWidth: 100,
            unit: "metric",
          });
          map!.addControl(scale, "bottom-right");

          const unparsedFieldPolygon: any = scenarioData()?.project?.layer.geometry;
          const fieldPolygon = JSON.parse(unparsedFieldPolygon!.replace(/&#34;/g, '"'));

          // var offset = layoutData()?.offset

          const fieldPolygonVisible = true;
          if (fieldPolygonVisible) {
            if (map!.getSource("fieldPolygon")) {
              map!.removeLayer("fieldPolygon");
              map!.removeSource("fieldPolygon");
            }

            map!.addLayer({
              id: "fieldPolygon",
              type: "fill",
              //@ts-expect-error
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

        // map.transformCameraUpdate = ({ center, zoom }) => {
        //   mapCameraState = {
        //     center,
        //     zoom,
        //     pitch: map.getPitch(),
        //     bearing: map.getBearing(),
        //   }

        //   return {}
        // }
      }
    }

    onCleanup(() => {
      if (map) {
        map.remove();
        map = undefined;
      }
    });
  });

  // Helper function to clear all system design layers
  function clearSystemDesignLayers(targetMap: maplibregl.Map) {
    const style = targetMap.getStyle();
    if (!style || !style.layers) return;

    // Get all layer IDs that belong to system design
    const systemLayerIds = style.layers
      .map((layer: any) => layer.id)
      .filter(
        (id: string) =>
          id.startsWith("strips-") ||
          id.startsWith("trees-") ||
          id.startsWith("strips-border-") ||
          id === "headland-sides" ||
          id === "margin-polygon" ||
          id === "headland-polygon" ||
          id === "bearing-sides" ||
          id === "headland-intersection-points" ||
          id === "treeRowLines" ||
          id === "row-labels",
      );

    // Remove all system design layers and sources
    systemLayerIds.forEach((layerId: string) => {
      if (targetMap.getLayer(layerId)) {
        targetMap.removeLayer(layerId);
      }
      if (targetMap.getSource(layerId)) {
        targetMap.removeSource(layerId);
      }
    });
  }

  // Draw the system design when the layout, 3D mode, or project changes
  createEffect(() => {
    // Track project ID to clear when switching projects via breadcrumbs
    // (accessing params.projectId registers it as a dependency even if unused)
    const projectId = params.projectId;

    if (mapLoaded() && map) {
      // Always clear old system design layers first
      // This ensures switching projects via breadcrumbs removes obsolete designs
      clearSystemDesignLayers(map);

      // Only draw if we have a system layout
      if (systemLayout()) {
        drawSystemDesign(map, systemLayout()!, show3D());
        // Ensure field polygon sits below system layers
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
    }
  });

  function logSystem() {
    console.log(JSON.stringify(system));
  }

  const [saving, setSaving] = createSignal(false);
  const [savedSystem, setSavedSystem] = createSignal<ISystemDesignSchema | undefined>(undefined);
  const [previewing, setPreviewing] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);

  // Save preset state
  const [showSavePresetModal, setShowSavePresetModal] = createSignal(false);
  const [presetName, setPresetName] = createSignal("");
  const [presetDescription, setPresetDescription] = createSignal("");
  const [savingPreset, setSavingPreset] = createSignal(false);

  // Offer request modal state
  const [isOfferModalOpen, setOfferModalOpen] = createSignal(false);

  // Species breakdown for offer modal
  const speciesBreakdown = createMemo(() => {
    const layout = systemLayout();
    if (!layout?.speciesCountArray) return [];

    return layout.speciesCountArray.map((item: any, index: number) => {
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

  async function saveSystem() {
    setSaving(true);

    console.log(system);

    const newsystem = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/set-systemdesign`,
      {
        body: JSON.stringify(system),
        method: "put",
        ...apiFetchOptions(),
      },
    );

    const systemData = await newsystem.json();

    setSavedSystem(systemData as ISystemDesignSchema);

    if (systemData) {
      // toast('System design saved.');
      showToast({ title: "System design saved." });
    }

    setSaving(false);

    // scenarioDataRefresh();
  }

  const saveAsPreset = async () => {
    if (!presetName().trim() || !presetDescription().trim()) {
      showToast({
        title: "Please provide both name and description",
        variant: "destructive",
      });
      return;
    }

    setSavingPreset(true);
    try {
      // Try to capture a thumbnail from the map if available
      let thumbnail = null;
      const mapElement = document.getElementById("layerMapShow");
      if (mapElement && map) {
        try {
          const canvas = map.getCanvas();
          thumbnail = canvas.toDataURL("image/png");
        } catch (err) {
          console.log("Could not capture map thumbnail:", err);
        }
      }

      // Clean the system design to only include species IDs
      const cleanSystemDesign = {
        ...system,
        rows: system.rows.map((row: any) => ({
          ...row,
          groundcover: typeof row.groundcover === "object" ? row.groundcover._id : row.groundcover,
          sequence: row.sequence
            ? row.sequence.map((seq: any) => ({
                ...seq,
                species: typeof seq.species === "object" ? seq.species._id : seq.species,
              }))
            : [],
        })),
      };

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/userpresets`, {
        method: "POST",
        body: JSON.stringify({
          name: presetName(),
          description: presetDescription(),
          systemDesign: cleanSystemDesign,
          thumbnail,
          isPublic: false,
        }),
        ...apiFetchOptions(),
      });

      if (response.ok) {
        showToast({ title: "Preset saved successfully!" });
        setShowSavePresetModal(false);
        setPresetName("");
        setPresetDescription("");
      } else {
        showToast({ title: "Failed to save preset", variant: "destructive" });
      }
    } catch (err) {
      console.error("Failed to save preset:", err);
      showToast({ title: "Failed to save preset", variant: "destructive" });
    } finally {
      setSavingPreset(false);
    }
  };

  const [isFarmerAdvisorSelectorOpen, setIsFarmerAdvisorSelectorOpen] = createSignal(false);
  const [deleteModalOpen, setDeleteModalOpen] = createSignal(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = createSignal(false);

  const deleteProjectAction = action(async (formData: FormData) => {
    await fetch(`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}`, {
      body: JSON.stringify({}),
      method: "delete",
      ...apiFetchOptions(),
    });

    navigate(`/parcels/${params.parcelId}/layers/${params.layerId}`);
  });

  return (
    <>
      <Resizable>
        <ResizablePanel style={{ overflow: "hidden" }}>
          <Show when={isFreemium()}>
            <FarmerAdvisorSelector
              isOpen={isFarmerAdvisorSelectorOpen}
              onClose={() => {
                setIsFarmerAdvisorSelectorOpen(false);
              }}
              onSelect={() => {
                setIsFarmerAdvisorSelectorOpen(false);
              }}
            />
          </Show>

          <DuplicateScenarioModalWithRedirect
            activeScenario={() => scenarioData()?.project}
            modalOpen={duplicateModalOpen}
            setModalOpen={setDuplicateModalOpen}
            refetchScenarios={refetch}
          />

          {/* Save Preset Modal */}
          <Dialog open={showSavePresetModal()} onOpenChange={setShowSavePresetModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Design as Preset</DialogTitle>
              </DialogHeader>
              <DialogDescription>
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium mb-1">Preset Name</label>
                    <input
                      type="text"
                      class="w-full p-2 rounded-sm border border-zinc-300 dark:border-slate-600"
                      value={presetName()}
                      onInput={(e) => setPresetName(e.currentTarget.value)}
                      placeholder="e.g., My Custom Agroforestry Design"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium mb-1">Description</label>
                    <textarea
                      class="w-full p-2 rounded-sm border border-zinc-300 dark:border-slate-600"
                      rows={3}
                      value={presetDescription()}
                      onInput={(e) => setPresetDescription(e.currentTarget.value)}
                      placeholder="Describe your design configuration..."
                    />
                  </div>
                </div>
              </DialogDescription>
              <DialogFooter>
                <button
                  class="rounded-sm p-2 btn-default"
                  onClick={() => {
                    setShowSavePresetModal(false);
                    setPresetName("");
                    setPresetDescription("");
                  }}
                >
                  Cancel
                </button>
                <button
                  class="rounded-sm p-2 btn-default"
                  onClick={saveAsPreset}
                  disabled={savingPreset()}
                >
                  {savingPreset() ? "Saving..." : "Save Preset"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div
            style={{
              display: "flex",
              position: "relative",

              "justify-content": "space-between",
              height: "calc(100vh - 57px)",
              flex: "1 0 auto",
            }}
          >
            <div
              style={{
                display: "flex",
                flex: "1 1 0%",
                "overflow-x": "hidden",
                "min-width": "500px",
                "flex-direction": "column",
              }}
            >
              <Show when={species() && scenarioData()}>
                {/* <form method="post" action={Form}> */}

                <>
                  <div
                    style={{
                      display: "flex",
                      "flex-direction": "column",
                      "justify-content": "space-between",
                      height: "100%",
                    }}
                  >
                    <Tabs
                      value={activeTab()}
                      onChange={handleTabChange}
                      style={{
                        height: "100%",
                        display: "flex",
                        "flex-direction": "column",
                      }}
                    >
                      <TabsList class="grid w-fit grid-cols-4 m-2">
                        <TabsTrigger class="border" value="edit">
                          Edit design
                        </TabsTrigger>
                        <TabsTrigger class="border" value="presets">
                          Presets
                        </TabsTrigger>
                        <TabsTrigger class="border" value="export">
                          Export and share
                        </TabsTrigger>
                        <TabsTrigger class="border" value="info">
                          Info
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent
                        value="edit"
                        style={{
                          overflow: "hidden",
                          flex: "1 1 auto",
                          display: "flex",
                          "flex-direction": "column",
                        }}
                      >
                        <Show when={isFreemium()}>
                          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 m-2">
                            <div class="flex items-start gap-2">
                              <i class="fas fa-info-circle text-blue-600 dark:text-blue-400 mt-0.5" />
                              <div class="text-sm">
                                <p class="font-semibold text-blue-900 dark:text-blue-100">
                                  Free plan - Limited editing
                                </p>
                                <p class="text-blue-800 dark:text-blue-200">
                                  You can apply presets and adjust the bearing angle.
                                  <br />
                                  <A href="/settings" class="underline">
                                    Upgrade to unlock
                                  </A>{" "}
                                  full row editing capabilities.
                                </p>
                              </div>
                            </div>
                          </div>
                        </Show>
                        <div
                          style={{
                            flex: "1 1 auto",
                            position: "relative",
                            overflow: "auto",
                          }}
                        >
                          <button
                            class="absolute top-2 right-2 rounded-sm p-2 btn-default z-10"
                            onClick={() => setShowSettings((prev) => !prev)}
                            title="Toggle design settings"
                          >
                            <i class="fas fa-cog" />
                          </button>

                          <Show when={showSettings()}>
                            <div class="absolute top-12 right-2 dark:bg-customdark1 bg-white text-black p-2 rounded-md border border-zinc-300 dark:border-slate-600 dark:text-white z-10">
                              <div class="form-group justify-between flex my-1 align-middle">
                                <label class="leading-7 mr-2 w-full text-right">Bearing</label>
                                <input
                                  type="number"
                                  min={-180}
                                  class="form-control p-1 rounded-sm w-20 border border-zinc-300 dark:border-slate-600"
                                  onchange={(e) => {
                                    setSystem("bearing", Number.parseFloat(e.target.value));
                                    logSystem();
                                  }}
                                  value={system.bearing ?? 0}
                                />
                              </div>

                              <div class="form-group justify-between flex my-1 align-middle">
                                <label class="leading-7 mr-2 w-full text-right">Margin</label>
                                <input
                                  disabled={isFreemium()}
                                  type="number"
                                  min={0}
                                  class="form-control p-1 rounded-sm w-20 border border-zinc-300 dark:border-slate-600"
                                  classList={{
                                    "opacity-50 cursor-not-allowed": isFreemium(),
                                  }}
                                  onchange={(e) => {
                                    setSystem("margin", Number.parseFloat(e.target.value));
                                    logSystem();
                                  }}
                                  value={system.margin ?? 0}
                                />
                              </div>

                              <div class="form-group justify-between flex my-1 align-middle">
                                <label class="leading-7 mr-2 w-full text-right">Headland</label>
                                <input
                                  disabled={isFreemium()}
                                  type="number"
                                  min={0}
                                  class="form-control p-1 rounded-sm w-20 border border-zinc-300 dark:border-slate-600"
                                  classList={{
                                    "opacity-50 cursor-not-allowed": isFreemium(),
                                  }}
                                  onchange={(e) => {
                                    setSystem("headland", Number.parseFloat(e.target.value));
                                    logSystem();
                                  }}
                                  value={system.headland ?? 0}
                                />
                              </div>
                            </div>
                          </Show>

                          <div
                            style={{
                              display: "flex",
                              "flex-direction": "row",
                              "min-height": "100%",
                              "padding-bottom": "20px",
                            }}
                          >
                            <For each={system.rows}>
                              {(row, rowIdx) => (
                                <>
                                  <AddRow
                                    index={rowIdx()}
                                    setSystem={setSystem}
                                    logSystem={logSystem}
                                    disabled={isFreemium()}
                                  />

                                  <div
                                    style={{
                                      "min-width": "180px",
                                      flex: "0 0 0",
                                      display: "flex",
                                      "flex-direction": "column",
                                      "justify-content": "flex-end",
                                    }}
                                  >
                                    <div class="border border-zinc-300 bg-white dark:bg-customdark1 p-2 rounded-sm dark:border-slate-600">
                                      {row.sequence.length ? (
                                        <>
                                          <div
                                            style={{
                                              display: "flex",
                                              "flex-direction": "column-reverse",
                                            }}
                                          >
                                            <div
                                              class="form-group"
                                              style={{
                                                display: "flex",
                                                "align-items": "center",
                                                "justify-content": "space-between",
                                              }}
                                            >
                                              <label>Offset</label>
                                              <div
                                                style={{
                                                  display: "flex",
                                                  "align-items": "center",
                                                }}
                                              >
                                                <input
                                                  style={{ width: "75px" }}
                                                  type="number"
                                                  min={0}
                                                  class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                                                  classList={{
                                                    "opacity-50 cursor-not-allowed": isFreemium(),
                                                  }}
                                                  disabled={isFreemium()}
                                                  value={row.offset?.before}
                                                  onChange={(e) => {
                                                    setSystem("rows", rowIdx(), "offset", (o) => {
                                                      const newOffset = {
                                                        ...o,
                                                      };
                                                      newOffset.before = Number.parseFloat(
                                                        e.target.value,
                                                      );
                                                      return newOffset;
                                                    });

                                                    logSystem();
                                                  }}
                                                  required
                                                />
                                                <span>m</span>
                                              </div>
                                            </div>

                                            <button
                                              title="Add tree"
                                              class="rounded-sm p-1 mt-2 mb-2 btn-default"
                                              disabled={isFreemium()}
                                              onclick={() => {
                                                // console.log('test')
                                                setSystem(
                                                  "rows",
                                                  rowIdx(),
                                                  "sequence",
                                                  (sequence) => {
                                                    const newSequence = [
                                                      {
                                                        species: undefined,
                                                        spacingAfter: 5,
                                                      },
                                                      ...sequence,
                                                    ];

                                                    // console.log(newRows)
                                                    return newSequence;
                                                  },
                                                );
                                                logSystem();
                                              }}
                                            >
                                              <i class="fa-solid fa-plus" /> Add tree
                                            </button>

                                            <For each={row.sequence}>
                                              {(sequence, sequenceIdx) => (
                                                // <div class='card'>
                                                //   <div class='card-body'>

                                                <div
                                                  style={{
                                                    display: "flex",
                                                    "align-items": "center",
                                                    "margin-top": "10px",
                                                  }}
                                                >
                                                  {/* <button
                                        class='btn btn-default'
                                        onClick={() => {
                                          // setSystem('rows', (prev) => {
                                          //   const newRows = [...prev]
                                          //   newRows.splice(j(), 1)
                                          //   return newRows
                                          // })
                                        }}
                                      > */}
                                                  <i
                                                    onClick={() => {
                                                      if (isFreemium()) return;
                                                      setSystem(
                                                        "rows",
                                                        rowIdx(),
                                                        "sequence",
                                                        (sequence) => {
                                                          const newSequence = [...sequence];
                                                          newSequence.splice(sequenceIdx(), 1);
                                                          return newSequence;
                                                        },
                                                      );
                                                      logSystem();
                                                    }}
                                                    class="fa-solid fa-trash cursor-pointer text-zinc-400 dark:text-zinc-500 dark:hover:text-red-500 hover:text-red-500 m-1 "
                                                    classList={{
                                                      "opacity-50 cursor-not-allowed": isFreemium(),
                                                    }}
                                                  />
                                                  {/* </button> */}

                                                  <div>
                                                    <div
                                                      style={{
                                                        display: "flex",
                                                        "align-items": "center",
                                                      }}
                                                    >
                                                      <i
                                                        class="fa-solid fa-arrows-up-down"
                                                        style={{
                                                          width: "20px",
                                                          "text-align": "center",
                                                        }}
                                                      />
                                                      <input
                                                        style={{
                                                          width: "100%",
                                                        }}
                                                        type="number"
                                                        min={0}
                                                        class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                                                        classList={{
                                                          "opacity-50 cursor-not-allowed":
                                                            isFreemium(),
                                                        }}
                                                        placeholder="Spacing (m)"
                                                        disabled={isFreemium()}
                                                        value={sequence.spacingAfter}
                                                        onChange={(e) => {
                                                          setSystem(
                                                            "rows",
                                                            rowIdx(),
                                                            "sequence",
                                                            sequenceIdx(),
                                                            (sequence) => {
                                                              const newSpecies = {
                                                                ...sequence,
                                                              };
                                                              newSpecies.spacingAfter =
                                                                Number.parseFloat(e.target.value);
                                                              return newSpecies;
                                                            },
                                                          );
                                                          logSystem();
                                                        }}
                                                      />
                                                    </div>
                                                    <div
                                                      style={{
                                                        display: "flex",
                                                        "margin-top": "10px",
                                                        "align-items": "center",
                                                      }}
                                                    >
                                                      <i
                                                        class="fa-solid fa-tree"
                                                        style={{
                                                          width: "20px",
                                                          "text-align": "center",
                                                        }}
                                                      />

                                                      <ComboboxRoot<ISpeciesSchema>
                                                        options={
                                                          species()?.species.filter(
                                                            (species: ISpeciesSchema) =>
                                                              !["herb", "grass"].includes(
                                                                species.form,
                                                              ),
                                                          ) ?? []
                                                        }
                                                        disabled={isFreemium()}
                                                        onChange={(e) => {
                                                          setSystem(
                                                            "rows",
                                                            rowIdx(),
                                                            "sequence",
                                                            sequenceIdx(),
                                                            "species",
                                                            () => {
                                                              return e?._id!;
                                                            },
                                                          );
                                                        }}
                                                        value={species()?.species.find(
                                                          (s) => s._id === sequence.species,
                                                        )}
                                                        optionValue="_id"
                                                        optionTextValue={(species) =>
                                                          `${species.nameCommon} (${species.family} ${species.genus} ${species.species})`
                                                        }
                                                        optionLabel="nameCommon"
                                                        placeholder="Search a species…"
                                                        itemComponent={(props) => (
                                                          <ComboboxItem item={props.item}>
                                                            <ComboboxItemLabel>
                                                              {props.item.rawValue.nameCommon} (
                                                              {props.item.rawValue.family}{" "}
                                                              {props.item.rawValue.genus}{" "}
                                                              {props.item.rawValue.species})
                                                            </ComboboxItemLabel>
                                                            <ComboboxItemIndicator />
                                                          </ComboboxItem>
                                                        )}
                                                      >
                                                        <ComboboxControl aria-label="Species">
                                                          <ComboboxInput />
                                                          <ComboboxTrigger />
                                                        </ComboboxControl>
                                                        <ComboboxContent />
                                                      </ComboboxRoot>
                                                    </div>
                                                  </div>
                                                </div>
                                              )}
                                            </For>

                                            <button
                                              class="rounded-sm p-1 mt-2 btn-default"
                                              disabled={isFreemium()}
                                              onclick={() => {
                                                // console.log('test')
                                                setSystem(
                                                  "rows",
                                                  rowIdx(),
                                                  "sequence",
                                                  (sequence) => {
                                                    const newSequence = [
                                                      ...sequence,
                                                      {
                                                        species: undefined,
                                                        spacingAfter: 5,
                                                      },
                                                    ];

                                                    // console.log(newRows)
                                                    return newSequence;
                                                  },
                                                );
                                                logSystem();
                                              }}
                                            >
                                              <i class="fa-solid fa-plus" /> Add tree
                                            </button>

                                            <div
                                              class="form-group"
                                              style={{
                                                display: "flex",
                                                "align-items": "center",
                                                "justify-content": "space-between",
                                              }}
                                            >
                                              <label>Offset</label>
                                              <div
                                                style={{
                                                  display: "flex",
                                                  "align-items": "center",
                                                }}
                                              >
                                                <input
                                                  style={{ width: "75px" }}
                                                  type="number"
                                                  min={0}
                                                  class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                                                  classList={{
                                                    "opacity-50 cursor-not-allowed": isFreemium(),
                                                  }}
                                                  disabled={isFreemium()}
                                                  value={row.offset?.after}
                                                  onChange={(e) => {
                                                    setSystem("rows", rowIdx(), "offset", (o) => {
                                                      const offset = { ...o };
                                                      offset.after = Number.parseFloat(
                                                        e.target.value,
                                                      );
                                                      return offset;
                                                    });

                                                    logSystem();
                                                  }}
                                                  required
                                                />
                                                <span>m</span>
                                              </div>
                                            </div>
                                          </div>
                                        </>
                                      ) : (
                                        <button
                                          class="rounded-sm p-1  w-full btn-default"
                                          disabled={isFreemium()}
                                          onclick={() => {
                                            // console.log('test')
                                            setSystem("rows", rowIdx(), "sequence", (sequence) => {
                                              const newSequence = [
                                                ...sequence,
                                                {
                                                  species: undefined,
                                                  spacingAfter: 5,
                                                },
                                              ];
                                              return newSequence;
                                            });
                                            logSystem();
                                          }}
                                        >
                                          Define tree sequence
                                        </button>
                                      )}

                                      <hr class="my-4 border-zinc-600 dark:border-white border-dashed" />

                                      <span>Ground cover</span>

                                      <ComboboxRoot<ISpeciesSchema>
                                        options={
                                          species()?.species.filter((species: ISpeciesSchema) =>
                                            ["herb", "grass"].includes(species.form),
                                          ) ?? []
                                        }
                                        disabled={isFreemium()}
                                        onChange={(e) => {
                                          setSystem("rows", rowIdx(), "groundcover", (gc) => {
                                            return e?._id!;
                                          });

                                          logSystem();
                                        }}
                                        value={species()?.species.find(
                                          (s) => s._id === row.groundcover,
                                        )}
                                        optionValue="_id"
                                        optionTextValue={(species) =>
                                          `${species.nameCommon} (${species.family} ${species.genus} ${species.species})`
                                        }
                                        optionLabel={(species) => species.nameCommon}
                                        placeholder="Search a species…"
                                        itemComponent={(props) => (
                                          <ComboboxItem item={props.item}>
                                            <ComboboxItemLabel>
                                              {props.item.rawValue.nameCommon} (
                                              {props.item.rawValue.family}{" "}
                                              {props.item.rawValue.genus}{" "}
                                              {props.item.rawValue.species})
                                            </ComboboxItemLabel>
                                            <ComboboxItemIndicator />
                                          </ComboboxItem>
                                        )}
                                      >
                                        <ComboboxControl aria-label="Species">
                                          <ComboboxInput />
                                          <ComboboxTrigger />
                                        </ComboboxControl>
                                        <ComboboxContent />
                                      </ComboboxRoot>

                                      <br />

                                      <div
                                        class="form-group mt-2"
                                        style={{
                                          display: "flex",
                                          "align-items": "center",
                                          "justify-content": "space-between",
                                        }}
                                      >
                                        <label>Row width</label>
                                        <div
                                          style={{
                                            display: "flex",
                                            "align-items": "center",
                                          }}
                                        >
                                          <input
                                            style={{ width: "75px" }}
                                            type="number"
                                            min={0}
                                            class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                                            classList={{
                                              "opacity-50 cursor-not-allowed": isFreemium(),
                                            }}
                                            placeholder="Width"
                                            disabled={isFreemium()}
                                            value={row.width}
                                            onChange={(e) => {
                                              setSystem("rows", rowIdx(), "width", (width) => {
                                                const newWidth = Number.parseFloat(e.target.value);
                                                return newWidth;
                                              });

                                              logSystem();
                                            }}
                                            required
                                          />
                                          <span>m</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div class="flex w-full items-center justify-center gap-2 py-1">
                                      <button
                                        type="button"
                                        aria-label="Delete row"
                                        class="flex items-center justify-center h-6 w-6 rounded-sm text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-500 transition"
                                        disabled={isFreemium()}
                                        onClick={() => {
                                          setSystem("rows", (prev) => {
                                            const newRows = [...prev];
                                            newRows.splice(rowIdx(), 1);
                                            return newRows;
                                          });
                                          logSystem();
                                        }}
                                      >
                                        <i class="fa-solid fa-trash text-sm" />
                                      </button>
                                      <span class="font-bold leading-none select-none">
                                        Row {rowIdx() + 1}
                                      </span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </For>
                            <AddRow
                              ping={system.rows.length === 0}
                              index={system.rows.length}
                              setSystem={setSystem}
                              logSystem={logSystem}
                              disabled={isFreemium()}
                            />
                          </div>
                        </div>

                        {/* Sticky bottom bar */}
                        <div
                          class="flex justify-between px-2 border-t border-zinc-300 dark:border-slate-600 bg-white dark:bg-customdark1"
                          style={{ "flex-shrink": 0 }}
                        >
                          <div>
                            <button
                              class="rounded-sm p-1 mr-2 my-2 btn-default"
                              onClick={() => setShowSavePresetModal(true)}
                              title="Save current design as preset"
                            >
                              <i class="fas fa-save" /> Save as Preset
                            </button>
                            <button
                              class="rounded-sm p-1 my-2 btn-default"
                              onClick={() => setDuplicateModalOpen(true)}
                              title="Duplicate scenario"
                            >
                              <i class="fa-regular fa-copy" /> Duplicate
                            </button>
                          </div>
                          <div class="form-group">
                            <button
                              type="submit"
                              class="rounded-sm p-1 mr-2 my-2 btn-default"
                              onclick={saveSystem}
                              disabled={
                                saving() ||
                                (!savedSystem() || !system
                                  ? false
                                  : systemDesignsAreEqual(
                                      JSON.stringify(savedSystem()),
                                      JSON.stringify(system),
                                    ))
                              }
                            >
                              Save system design
                            </button>
                            <button
                              type="submit"
                              class="rounded-sm p-1 mr-2 my-2 btn-default"
                              onclick={getSystemDesign}
                              disabled={previewing() || system.rows.length === 0}
                            >
                              Generate preview
                            </button>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent
                        value="presets"
                        style={{
                          overflow: "auto",
                          flex: "1 1 auto",
                          padding: "20px",
                        }}
                      >
                        <DesignPresetContent
                          getSystemDesign={getSystemDesign}
                          system={system}
                          setSystem={setSystem}
                          logSystem={logSystem}
                          map={mapLoaded() ? map : undefined}
                          params={params}
                          scenarioData={scenarioData}
                          systemLayout={systemLayout}
                          triggerFarmerAdvisorSelector={() => {
                            setTimeout(() => {
                              const key = "farmerAdvisorSelector";
                              if (!localStorage.getItem(key)) {
                                setIsFarmerAdvisorSelectorOpen(true);
                                localStorage.setItem(key, "true");
                              }
                            }, 10000);
                          }}
                        />
                      </TabsContent>

                      <TabsContent
                        value="export"
                        style={{
                          overflow: "auto",
                          flex: "1 1 auto",
                          padding: "20px",
                        }}
                      >
                        <ExportAndShareContent
                          scenarioData={scenarioData}
                          params={params}
                          systemLayout={systemLayout}
                          system={system}
                          species={species()}
                          mapInstance={mapInstance()}
                          onGeneratePreview={getSystemDesign}
                        />
                      </TabsContent>

                      <TabsContent
                        value="info"
                        style={{
                          overflow: "auto",
                          flex: "1 1 auto",
                          padding: "20px",
                        }}
                      >
                        <InfoContent
                          scenarioData={scenarioData}
                          refetchScenarioData={refetch}
                          params={params}
                          deleteModalOpen={deleteModalOpen}
                          setDeleteModalOpen={setDeleteModalOpen}
                          deleteProjectAction={deleteProjectAction}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>
                </>
                {/* </form> */}
              </Show>
            </div>

            {/* Parameterbox moved to Edit design tab */}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel>
          <Toaster />
          <div style={{ height: "100%", position: "relative", flex: "1 1 100%" }}>
            <div style={{ height: "100%" }}>
              <div id="layerMapShow" style={{ height: "100%", width: "100%" }} />

              <Show when={systemLayout() && species()}>
                <SystemInfoBox
                  systemLayout={systemLayout()!}
                  species={species()}
                  scenarioData={scenarioData()}
                >
                  {/* Request offer on trees button */}
                  <Show when={totalTrees() > 0}>
                    <div style={{ "margin-top": "12px" }}>
                      <Button class="w-full" onClick={() => setOfferModalOpen(true)}>
                        Request offer on trees
                      </Button>
                    </div>
                  </Show>
                </SystemInfoBox>
              </Show>
            </div>
          </div>
        </ResizablePanel>
      </Resizable>

      <OfferRequestModal
        isOpen={isOfferModalOpen()}
        onOpenChange={setOfferModalOpen}
        speciesBreakdown={speciesBreakdown()}
        configId={params.projectId}
        userEmail={userEmail()}
      />
    </>
  );
}

export { drawSystemDesign };

const FreemiumBox = ({}: any) => {
  const navigate = useNavigate();
  return (
    <button
      // @ts-expect-error
      type="submit"
      class={`rounded-sm w-full p-1 mr-2 my-2 btn-default`}
      onclick={async () => {
        navigate("/settings");
      }}
    >
      You are using the free version of RegenWorks.
      <br />
      Choose a paid plan to unlock full design functionality
    </button>
  );
};

// Parameterbox component removed - functionality moved to Edit design tab

const DesignPresetContent = ({
  system,
  setSystem,
  logSystem,
  getSystemDesign,
  map,
  params,
  scenarioData,
  systemLayout,
  triggerFarmerAdvisorSelector,
}: any) => {
  const navigate = useNavigate();
  const [userPresets, setUserPresets] = createSignal<any[]>([]);
  const [showSaveModal, setShowSaveModal] = createSignal(false);
  const [presetName, setPresetName] = createSignal("");
  const [presetDescription, setPresetDescription] = createSignal("");
  const [savingPreset, setSavingPreset] = createSignal(false);
  const [deletingPresetId, setDeletingPresetId] = createSignal<string | null>(null);
  const [editingPreset, setEditingPreset] = createSignal<any | null>(null);
  const [showEditModal, setShowEditModal] = createSignal(false);
  const [editName, setEditName] = createSignal("");
  const [editDescription, setEditDescription] = createSignal("");
  const [updatingPreset, setUpdatingPreset] = createSignal(false);

  // Preset confirmation modal state
  const [showPresetConfirmModal, setShowPresetConfirmModal] = createSignal(false);
  const [pendingPreset, setPendingPreset] = createSignal<any>(null);
  const [duplicatingScenario, setDuplicatingScenario] = createSignal(false);

  // Duplicate name modal state
  const [showDuplicateNameModal, setShowDuplicateNameModal] = createSignal(false);
  const [duplicateScenarioName, setDuplicateScenarioName] = createSignal("");

  // Check if there's an existing system design on the client (saved or unsaved)
  const hasExistingSystem = () => {
    return system.rows && system.rows.length > 0;
  };

  // Apply preset directly (overwrite)
  const applyPreset = (preset: any) => {
    console.log("Applying preset:", preset.system);
    // Clear existing system layers before drawing the preset
    const clearSystemDesignLayers = () => {
      if (!map) return;
      const style = map.getStyle();
      if (!style || !style.layers) return;

      // Get all layer IDs that belong to system design
      const systemLayerIds = style.layers
        .map((layer: any) => layer.id)
        .filter(
          (id: string) =>
            id.startsWith("strips-") ||
            id.startsWith("trees-") ||
            id.startsWith("strips-border-") ||
            id === "headland-sides" ||
            id === "margin-polygon" ||
            id === "headland-polygon" ||
            id === "bearing-sides" ||
            id === "headland-intersection-points" ||
            id === "treeRowLines" ||
            id === "row-labels",
        );

      // Remove all system design layers and sources
      systemLayerIds.forEach((layerId: string) => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getSource(layerId)) {
          map.removeSource(layerId);
        }
      });
    };

    clearSystemDesignLayers();

    // Clean the preset system to only use IDs
    const cleanSystem = {
      ...preset.system,
      rows: preset.system.rows.map((row: any) => ({
        ...row,
        groundcover: typeof row.groundcover === "object" ? row.groundcover._id : row.groundcover,
        sequence: row.sequence
          ? row.sequence.map((seq: any) => ({
              ...seq,
              species: typeof seq.species === "object" ? seq.species._id : seq.species,
            }))
          : [],
      })),
    };
    setSystem(cleanSystem);
    getSystemDesign();
    triggerFarmerAdvisorSelector();
    setShowPresetConfirmModal(false);
    setPendingPreset(null);
  };

  // Open duplicate name modal
  const openDuplicateNameModal = (preset: any) => {
    // Start with blank name - user must provide their own
    setDuplicateScenarioName("");
    setShowPresetConfirmModal(false);
    setShowDuplicateNameModal(true);
  };

  // Duplicate scenario with preset
  const duplicateScenarioWithPreset = async () => {
    if (!duplicateScenarioName().trim()) {
      showToast({
        title: "Name required",
        description: "Please enter a name for the new scenario",
        variant: "destructive",
      });
      return;
    }

    const preset = pendingPreset();
    if (!preset) {
      return;
    }

    setDuplicatingScenario(true);
    try {
      // Step 1: Create the new project
      const createResponse = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}/projects`,
        {
          method: "POST",
          body: JSON.stringify({
            project: {
              name: duplicateScenarioName().trim(),
            },
          }),
          ...apiFetchOptions(),
        },
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error("API Error Response:", errorText);
        throw new Error(
          `Failed to create duplicate scenario: ${createResponse.status} ${createResponse.statusText}`,
        );
      }

      const newProject = await createResponse.json();

      // Step 2: Apply the preset system design to the new project
      const cleanSystem = {
        ...preset.system,
        rows: preset.system.rows.map((row: any) => {
          const cleanedRow: any = {
            ...row,
            sequence: row.sequence
              ? row.sequence.map((seq: any) => ({
                  ...seq,
                  species: typeof seq.species === "object" ? seq.species._id : seq.species,
                }))
              : [],
          };

          // Only include groundcover if it exists
          if (row.groundcover) {
            cleanedRow.groundcover =
              typeof row.groundcover === "object" ? row.groundcover._id : row.groundcover;
          }

          return cleanedRow;
        }),
      };

      const updateResponse = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/projects/${newProject._id}/set-systemdesign`,
        {
          method: "PUT",
          body: JSON.stringify(cleanSystem),
          ...apiFetchOptions(),
        },
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("Failed to apply preset to new project:", errorText);

        // Close modals
        setShowDuplicateNameModal(false);
        setPendingPreset(null);

        // Show warning toast
        showToast({
          title: "Scenario created without preset",
          description: `Created new scenario: "${duplicateScenarioName()}", but failed to apply preset. You can apply it manually.`,
          variant: "destructive",
        });

        // Navigate to the new project with Edit design tab selected
        setTimeout(() => {
          navigate(
            `/parcels/${params.parcelId}/layers/${params.layerId}/projects/${newProject._id}?tab=edit`,
          );
        }, 500);

        return;
      }

      // Close modals
      setShowDuplicateNameModal(false);
      setPendingPreset(null);

      // Trigger breadcrumb reload
      setReloadSignal((prev) => prev + 1);

      // Show success toast
      showToast({
        title: "Scenario created with preset",
        description: `Created new scenario: "${duplicateScenarioName()}" with preset applied.`,
      });

      // Navigate to the new project with Edit design tab selected
      setTimeout(() => {
        navigate(
          `/parcels/${params.parcelId}/layers/${params.layerId}/projects/${newProject._id}?tab=edit`,
        );
      }, 500);
    } catch (error) {
      console.error("Failed to duplicate scenario:", error);
      showToast({
        title: "Failed to create scenario",
        variant: "destructive",
      });
    } finally {
      setDuplicatingScenario(false);
    }
  };

  // Handle preset click
  const handlePresetClick = (preset: any) => {
    if (hasExistingSystem()) {
      // Show confirmation modal
      setPendingPreset(preset);
      setShowPresetConfirmModal(true);
    } else {
      // No existing system, apply directly
      applyPreset(preset);
    }
  };

  // Fetch user presets on mount
  createEffect(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/userpresets`,
        apiFetchOptions(),
      );
      if (response.ok) {
        const data = await response.json();
        setUserPresets(data.presets || []);
      }
    } catch (err) {
      console.error("Failed to fetch user presets:", err);
    }
  });

  // Clear previously drawn system design layers from the map
  const clearSystemDesignLayers = () => {
    try {
      if (!map) return;
      const staticLayersToRemove = [
        "strips-points",
        "headland-sides",
        "margin-polygon",
        "headland-polygon",
        "bearing-sides",
        "headland-intersection-points",
        "treeRowLines",
        "row-labels",
      ];

      // Remove known static layers
      for (const id of staticLayersToRemove) {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }

      // Remove dynamic species-based layers (trees-/strips-/strips-border-)
      const style = map.getStyle();
      if (style && style.layers) {
        style.layers.forEach((layer: any) => {
          const id = layer.id as string;
          if (
            id.startsWith("trees-") ||
            id.startsWith("strips-") ||
            id.startsWith("strips-border-")
          ) {
            if (map.getLayer(id)) map.removeLayer(id);
            if (map.getSource(id)) map.removeSource(id);
          }
        });
      }
    } catch (err) {
      console.warn("clearSystemDesignLayers error:", err);
    }
  };

  const saveAsPreset = async () => {
    if (!presetName().trim() || !presetDescription().trim()) {
      showToast({
        title: "Please provide both name and description",
        variant: "destructive",
      });
      return;
    }

    setSavingPreset(true);
    try {
      // Try to capture a thumbnail from the map if available
      let thumbnail = null;
      const mapElement = document.getElementById("layerMapShow");
      if (mapElement && map) {
        try {
          const canvas = map.getCanvas();
          thumbnail = canvas.toDataURL("image/png");
        } catch (err) {
          console.log("Could not capture map thumbnail:", err);
        }
      }

      // Clean the system design to only include species IDs
      const cleanSystemDesign = {
        ...system,
        rows: system.rows.map((row: any) => ({
          ...row,
          groundcover: typeof row.groundcover === "object" ? row.groundcover._id : row.groundcover,
          sequence: row.sequence
            ? row.sequence.map((seq: any) => ({
                ...seq,
                species: typeof seq.species === "object" ? seq.species._id : seq.species,
              }))
            : [],
        })),
      };

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/userpresets`, {
        method: "POST",
        body: JSON.stringify({
          name: presetName(),
          description: presetDescription(),
          systemDesign: cleanSystemDesign,
          thumbnail,
          isPublic: false,
        }),
        ...apiFetchOptions(),
      });

      if (response.ok) {
        const data = await response.json();
        setUserPresets([data.preset, ...userPresets()]);
        showToast({ title: "Preset saved successfully!" });
        setShowSaveModal(false);
        setPresetName("");
        setPresetDescription("");
      } else {
        showToast({ title: "Failed to save preset", variant: "destructive" });
      }
    } catch (err) {
      console.error("Failed to save preset:", err);
      showToast({ title: "Failed to save preset", variant: "destructive" });
    } finally {
      setSavingPreset(false);
    }
  };

  const deletePreset = async (presetId: string) => {
    setDeletingPresetId(presetId);
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/userpresets/${presetId}`, {
        method: "DELETE",
        body: JSON.stringify({}),
        ...apiFetchOptions(),
      });

      if (response.ok) {
        setUserPresets(userPresets().filter((p) => p._id !== presetId));
        showToast({ title: "Preset deleted successfully!" });
      } else {
        showToast({ title: "Failed to delete preset", variant: "destructive" });
      }
    } catch (err) {
      console.error("Failed to delete preset:", err);
      showToast({ title: "Failed to delete preset", variant: "destructive" });
    } finally {
      setDeletingPresetId(null);
    }
  };

  const updatePreset = async () => {
    if (!editName().trim() || !editDescription().trim()) {
      showToast({
        title: "Please provide both name and description",
        variant: "destructive",
      });
      return;
    }

    setUpdatingPreset(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/userpresets/${editingPreset()._id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: editName(),
            description: editDescription(),
            systemDesign: editingPreset().systemDesign,
            thumbnail: editingPreset().thumbnail,
            isPublic: editingPreset().isPublic || false,
          }),
          ...apiFetchOptions(),
        },
      );

      if (response.ok) {
        const data = await response.json();
        setUserPresets(
          userPresets().map((p) =>
            p._id === editingPreset()._id
              ? { ...p, name: editName(), description: editDescription() }
              : p,
          ),
        );
        showToast({ title: "Preset updated successfully!" });
        setShowEditModal(false);
        setEditingPreset(null);
      } else {
        showToast({ title: "Failed to update preset", variant: "destructive" });
      }
    } catch (err) {
      console.error("Failed to update preset:", err);
      showToast({ title: "Failed to update preset", variant: "destructive" });
    } finally {
      setUpdatingPreset(false);
    }
  };

  const openEditModal = (preset: any) => {
    setEditingPreset(preset);
    setEditName(preset.name);
    setEditDescription(preset.description);
    setShowEditModal(true);
  };

  const images = [
    {
      src: "/freemium/presets/Silvoarable.jpg",
      alt: "Silvoarable preset",
      desc: `
Silvoarable with apples 
6 m tree rows, 24 m alleys (wheat)
24 m margin 
`,
      system: {
        rows: [
          {
            width: 6,
            sequence: [{ spacingAfter: 3, species: "5e6639548add4f22f08201ff" }],
            offset: { before: 0, after: 0 },
          },
          {
            width: 24,
            sequence: [],
            offset: { before: 0, after: 0 },
            groundcover: "5e6619b4c0c63516dc441d2a",
          },
        ],
        bearing: 0,
        margin: 24,
        headland: 0,
      },
    },
    {
      src: "/freemium/presets/Silvopasture.jpg",
      alt: "Silvopasture preset",
      desc: `
Silvopasture with chestnuts 
6 x 12 m grid. 
6 m margin
`,
      system: {
        rows: [
          {
            width: 12,
            sequence: [{ species: "5e6501a0e4a1961d40fc538e", spacingAfter: 6 }],
            offset: { before: 0, after: 0 },
          },
        ],
        bearing: 0,
        margin: 6,
        headland: 0,
      },
    },
    {
      src: "/freemium/presets/silvoarable-poplar-regenworks.jpg",
      alt: "Silvoarable with poplar preset",
      desc: `
Silvoarable with poplar
6 m tree rows, 60 m alleys (wheat) 
20 m margin 
N/S alignment 
`,
      system: {
        rows: [
          {
            width: 3,
            sequence: [
              { spacingAfter: 3, species: "5e747abba84eb20bccc77d79" }, // Poplar
            ],
            offset: { before: 0, after: 0 },
          },
          {
            width: 3,
            sequence: [
              { spacingAfter: 3, species: "5e747abba84eb20bccc77d79" }, // Poplar
            ],
            offset: { before: 0, after: 0 },
          },
          {
            width: 60,
            sequence: [],
            offset: { before: 0, after: 0 },
            groundcover: "5e6619b4c0c63516dc441d2a", // Wheat
          },
        ],
        bearing: 0, // N/S alignment
        margin: 20,
        headland: 0,
      },
    },
    //     {
    //       src: "/freemium/presets/Silvopoultry-poplar.jpg",
    //       alt: "Silvopoultry with poplar preset",
    //       desc: `
    // Silvopoultry with poplar
    // 7 m double tree row + 3.5 m grass strip
    // 3 m margin
    // N/S alignment
    // `,
    //       system: {
    //         rows: [
    //           {
    //             width: 3.5,
    //             sequence: [
    //               { spacingAfter: 1.5, species: "5e747abba84eb20bccc77d79" }, // Poplar
    //             ],
    //             offset: { before: 0, after: 0 },
    //           },
    //           {
    //             width: 3.5,
    //             sequence: [
    //               { spacingAfter: 1.5, species: "5e747abba84eb20bccc77d79" }, // Poplar (double row)
    //             ],
    //             offset: { before: 0, after: 0 },
    //           },
    //           {
    //             width: 3.5,
    //             sequence: [],
    //             offset: { before: 0, after: 0 },
    //             groundcover: "5e665452cccc150b186d4cd1", // Grass strip
    //           },
    //         ],
    //         bearing: 0, // N/S alignment
    //         margin: 3, // Changed from 20 to 3 as per description
    //         headland: 0,
    //       },
    //     },
  ];

  // Combine predefined and user presets
  const allPresets = createMemo(() => {
    const predefinedPresets = images.map((img, idx) => ({
      ...img,
      id: `predefined-${idx}`,
      type: "predefined",
      canDelete: false,
    }));

    const userPresetsMapped = userPresets().map((preset) => ({
      id: preset._id,
      type: "user",
      canDelete: true,
      src: preset.thumbnail || "/placeholder-preset.svg",
      alt: preset.name,
      desc: preset.description,
      system: preset.systemDesign,
    }));

    return [...userPresetsMapped, ...predefinedPresets];
  });

  const [hoveredPreset, setHoveredPreset] = createSignal<number | null>(null);
  const [mousePosition, setMousePosition] = createSignal({ x: 0, y: 0 });

  const handleMouseMove = (e: MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div class="dark:bg-customdark1 bg-white text-black dark:text-white relative">
        <div class="flex justify-between items-center mb-4">
          <h2 class="font-bold text-lg">Design Presets</h2>
          <button
            class="rounded-sm p-2 btn-default"
            onClick={() => setShowSaveModal(true)}
            title="Save current design as preset"
          >
            <i class="fas fa-save" /> Save as Preset
          </button>
        </div>

        <div class="space-y-3">
          <For each={allPresets()}>
            {(preset, index) => (
              <div
                class="border border-zinc-300 dark:border-slate-600 rounded-md p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-4"
                onClick={() => handlePresetClick(preset)}
              >
                {/* Thumbnail */}
                <img
                  src={preset.src}
                  alt={preset.alt}
                  class="w-20 h-20 object-contain bg-white rounded-md flex-shrink-0"
                  classList={{
                    "cursor-zoom-in": preset.src !== "/placeholder-preset.svg",
                  }}
                  onMouseEnter={(e) => {
                    // Only show hover if not placeholder image
                    if (preset.src !== "/placeholder-preset.svg") {
                      setHoveredPreset(index());
                      handleMouseMove(e);
                    }
                  }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setHoveredPreset(null)}
                />

                {/* Text content */}
                <div class="flex-1">
                  <h3 class="font-semibold">
                    {preset.alt}
                    {preset.type === "user" && (
                      <span class="text-xs text-gray-500 ml-2">(Personal)</span>
                    )}
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
                    {preset.desc.trim()}
                  </p>
                </div>

                {/* Edit and Delete buttons for user presets */}
                <Show when={preset.canDelete}>
                  <div class="flex gap-2">
                    <button
                      class="rounded-sm p-2 btn-default"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (preset.type === "user") {
                          const userPreset = userPresets().find((p) => p._id === preset.id);
                          if (userPreset) {
                            openEditModal(userPreset);
                          }
                        }
                      }}
                      title="Edit preset"
                    >
                      <i class="fas fa-edit" />
                    </button>
                    <button
                      class="rounded-sm p-2 btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePreset(preset.id);
                      }}
                      disabled={deletingPresetId() === preset.id}
                      title="Delete preset"
                    >
                      <i class="fas fa-trash" />
                    </button>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>

        {/* Popup image on hover */}
        <Show
          when={
            hoveredPreset() !== null &&
            allPresets()[hoveredPreset()!].src !== "/placeholder-preset.svg"
          }
        >
          <div
            class="fixed z-50 pointer-events-none"
            style={{
              left: `${Math.min(mousePosition().x + 20, window.innerWidth - 340)}px`,
              top: `${Math.min(Math.max(mousePosition().y - 150, 10), window.innerHeight - 300)}px`,
            }}
          >
            <div class="bg-white dark:bg-gray-800 p-2 rounded-lg shadow-2xl border border-zinc-300 dark:border-slate-600">
              <img
                src={allPresets()[hoveredPreset()!].src}
                alt={allPresets()[hoveredPreset()!].alt}
                class="rounded-md object-contain"
                style={{
                  width: "500px",
                  height: "350px",
                }}
              />
              <p class="text-xs text-center text-gray-600 dark:text-gray-400 mt-1">
                Click to apply
              </p>
            </div>
          </div>
        </Show>

        <Show when={isFreemium()}>
          <div class="mt-4">
            <FreemiumBox />
          </div>
        </Show>

        {/* Save Preset Modal */}
        <Dialog open={showSaveModal()} onOpenChange={setShowSaveModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Design as Preset</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium mb-1">Preset Name</label>
                  <input
                    type="text"
                    class="w-full p-2 rounded-sm border border-zinc-300 dark:border-slate-600"
                    value={presetName()}
                    onInput={(e) => setPresetName(e.currentTarget.value)}
                    placeholder="e.g., My Custom Agroforestry Design"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    class="w-full p-2 rounded-sm border border-zinc-300 dark:border-slate-600"
                    rows={3}
                    value={presetDescription()}
                    onInput={(e) => setPresetDescription(e.currentTarget.value)}
                    placeholder="Describe your design configuration..."
                  />
                </div>
              </div>
            </DialogDescription>
            <DialogFooter>
              <button class="rounded-sm p-2 btn-default" onClick={() => setShowSaveModal(false)}>
                Cancel
              </button>
              <button
                class="rounded-sm p-2 btn-primary"
                onClick={saveAsPreset}
                disabled={savingPreset()}
              >
                {savingPreset() ? "Saving..." : "Save Preset"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Preset Modal */}
        <Dialog open={showEditModal()} onOpenChange={setShowEditModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Preset</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium mb-1">Preset Name</label>
                  <input
                    type="text"
                    class="w-full p-2 rounded-sm border border-zinc-300 dark:border-slate-600"
                    value={editName()}
                    onInput={(e) => setEditName(e.currentTarget.value)}
                    placeholder="e.g., My Custom Agroforestry Design"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    class="w-full p-2 rounded-sm border border-zinc-300 dark:border-slate-600"
                    rows={3}
                    value={editDescription()}
                    onInput={(e) => setEditDescription(e.currentTarget.value)}
                    placeholder="Describe your design configuration..."
                  />
                </div>
              </div>
            </DialogDescription>
            <DialogFooter>
              <button
                class="rounded-sm p-2 btn-default"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingPreset(null);
                }}
              >
                Cancel
              </button>
              <button
                class="rounded-sm p-2 btn-default"
                onClick={updatePreset}
                disabled={updatingPreset()}
              >
                {updatingPreset() ? "Updating..." : "Update Preset"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preset Confirmation Modal */}
        <Dialog open={showPresetConfirmModal()} onOpenChange={setShowPresetConfirmModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply Preset?</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              <p class="text-sm text-gray-700 dark:text-gray-300 mb-4">
                Are you sure you want to apply this preset? This will replace the current system
                that you have already designed.
              </p>
            </DialogDescription>
            <DialogFooter class="flex flex-col gap-2">
              <button
                class="rounded-sm p-2 btn-default w-full"
                onClick={() => {
                  if (pendingPreset()) {
                    applyPreset(pendingPreset());
                  }
                }}
              >
                Yes, overwrite current design with preset
              </button>
              <button
                class="rounded-sm p-2 btn-default w-full"
                onClick={() => {
                  if (pendingPreset()) {
                    openDuplicateNameModal(pendingPreset());
                  }
                }}
              >
                Create a duplicate scenario with the preset
              </button>
              <button
                class="rounded-sm p-2 btn-default w-full"
                onClick={() => {
                  setShowPresetConfirmModal(false);
                  setPendingPreset(null);
                }}
              >
                Cancel
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Duplicate Scenario Name Modal */}
        <Dialog open={showDuplicateNameModal()} onOpenChange={setShowDuplicateNameModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Name Your New Scenario</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              <div class="space-y-4">
                <p class="text-sm text-gray-700 dark:text-gray-300">
                  Enter a name for the duplicate scenario. You'll be able to apply the preset once
                  the scenario is created.
                </p>
                <div>
                  <label class="block text-sm font-medium mb-1">Scenario Name</label>
                  <input
                    type="text"
                    class="w-full p-2 rounded-sm border border-zinc-300 dark:border-slate-600"
                    value={duplicateScenarioName()}
                    onInput={(e) => setDuplicateScenarioName(e.currentTarget.value)}
                    placeholder="Enter scenario name..."
                  />
                </div>
              </div>
            </DialogDescription>
            <DialogFooter class="flex flex-col gap-2 sm:flex-row">
              <button
                class="rounded-sm p-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70 w-full sm:w-auto"
                onClick={duplicateScenarioWithPreset}
                disabled={duplicatingScenario() || !duplicateScenarioName().trim()}
              >
                {duplicatingScenario() ? "Creating..." : "Create Scenario"}
              </button>
              <button
                class="rounded-sm p-2 btn-default w-full sm:w-auto"
                onClick={() => {
                  setShowDuplicateNameModal(false);
                  setShowPresetConfirmModal(true); // Go back to previous modal
                }}
                disabled={duplicatingScenario()}
              >
                Back
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

const ExportAndShareContent = ({
  scenarioData,
  params,
  systemLayout,
  system,
  species,
  mapInstance,
  onGeneratePreview,
}: any) => {
  const [exportingKML, setExportingKML] = createSignal(false);
  const [isPublic, setIsPublic] = createSignal(scenarioData()?.project?.isPublic || false);
  const [exportingImage, setExportingImage] = createSignal(false);

  createEffect(() => {
    if (scenarioData()) {
      setIsPublic(scenarioData()?.project?.isPublic || false);
    }
  });

  async function exportKML() {
    setExportingKML(true);
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/design-preview`,
      apiFetchOptions(),
    );

    const result: {
      treeRowLines: any;
      groundCoverAreas: any;
      headlandSides: any;
      marginPolygon: any;
      headlandPolygon: any;
      sidesCloseToBearing: any;
      intersectionPoints: any;
      treeMarkerArray: any;
      speciesCountArray: any;
    } = await response.json();

    const treeMarkerArray: any[] = result.treeMarkerArray;

    let kmlDoc = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
`;

    console.log(treeMarkerArray);
    for (const entry of treeMarkerArray) {
      console.log(entry);

      if (entry.species?.nameCommon) {
        kmlDoc += `<Placemark>
          <name>${entry.species.nameCommon}</name>
          <description>${entry.species.species}</description>
          <Point>
            <coordinates>${entry.point.geometry.coordinates[0]},${entry.point.geometry.coordinates[1]},0</coordinates>
          </Point>
        </Placemark>`;
      }
    }

    kmlDoc += `
    </Document>
    </kml>`;

    const element = document.createElement("a");

    element.setAttribute("href", `data:text/plain;charset=utf-8,${encodeURIComponent(kmlDoc)}`);
    element.setAttribute(
      "download",
      `${scenarioData()?.project?.layer.name} - ${scenarioData()?.project?.name}.kml`,
    );

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
    setExportingKML(false);
  }

  async function updatePublicSetting(value: boolean) {
    await fetch(`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/set-public`, {
      body: JSON.stringify({
        isPublic: value,
      }),
      method: "put",
      ...apiFetchOptions(),
    });
    setIsPublic(value);
  }

  function exportMapImage() {
    setExportingImage(true);

    if (!mapInstance) {
      console.error("Map not initialized");
      setExportingImage(false);
      showToast({
        title: "Error",
        description: "Map is not ready. Please wait for it to load.",
        variant: "error",
      });
      return;
    }

    const captureMap = () => {
      try {
        // Get the map canvas
        const mapCanvas = mapInstance.getCanvas();

        if (!mapCanvas) {
          console.error("Map canvas not found");
          setExportingImage(false);
          showToast({
            title: "Error",
            description: "Failed to find map canvas",
            variant: "error",
          });
          return;
        }

        // Create a new canvas to draw the map
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = mapCanvas.width;
        exportCanvas.height = mapCanvas.height;
        const context = exportCanvas.getContext("2d");

        if (!context) {
          console.error("Failed to get canvas context");
          setExportingImage(false);
          return;
        }

        // Draw the map canvas to our export canvas
        context.drawImage(mapCanvas, 0, 0);

        // Log canvas dimensions for debugging
        console.log("Canvas dimensions:", exportCanvas.width, "x", exportCanvas.height);

        // Convert canvas to blob
        exportCanvas.toBlob(
          (blob: Blob | null) => {
            if (!blob) {
              console.error("Failed to create image blob");
              setExportingImage(false);
              showToast({
                title: "Error",
                description: "Failed to capture map image. Try refreshing the page.",
                variant: "error",
              });
              return;
            }

            console.log("Blob created, size:", blob.size);

            if (blob.size < 1000) {
              console.error("Image too small, likely empty");
              showToast({
                title: "Error",
                description: "Map capture resulted in empty image. Please try again.",
                variant: "error",
              });
              setExportingImage(false);
              return;
            }

            // Create download link
            const url = URL.createObjectURL(blob);
            const element = document.createElement("a");
            const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
            const filename = `${scenarioData()?.project?.layer.name || "map"}_${scenarioData()?.project?.name || "export"}_${timestamp}.png`;

            element.setAttribute("href", url);
            element.setAttribute("download", filename);
            element.style.display = "none";
            document.body.appendChild(element);

            element.click();

            document.body.removeChild(element);
            URL.revokeObjectURL(url);
            setExportingImage(false);

            showToast({
              title: "Success",
              description: "Map image exported successfully",
              variant: "success",
            });
          },
          "image/png",
          1.0,
        );
      } catch (error) {
        console.error("Error exporting map image:", error);
        setExportingImage(false);
        showToast({
          title: "Error",
          description: "Failed to export map image",
          variant: "error",
        });
      }
    };

    // Wait for map to be idle and fully rendered
    if (mapInstance.isMoving() || !mapInstance.loaded()) {
      mapInstance.once("idle", () => {
        // Force a repaint and wait for next frame
        mapInstance.triggerRepaint();
        requestAnimationFrame(captureMap);
      });
    } else {
      // Map is already idle, trigger repaint and capture
      mapInstance.triggerRepaint();
      requestAnimationFrame(captureMap);
    }
  }

  return (
    <div class="dark:bg-customdark1 bg-white text-black dark:text-white">
      <h2 class="font-bold text-lg mb-4">Export and Share</h2>

      <div class="mb-6 border-t border-zinc-300 dark:border-slate-600 pt-6">
        <h3 class="font-semibold mb-2">Public Preview</h3>
        <div style={{ display: "flex", "align-items": "center" }}>
          Enable public preview of system design:
          <input
            style={{ margin: "0px 5px" }}
            type="checkbox"
            checked={isPublic()}
            onChange={async (e) => {
              await updatePublicSetting(e.target.checked);
            }}
          />
        </div>

        {isPublic() ? (
          <>
            <A target="_blank" href={`/scenario-preview/${params.projectId}`}>
              <div class="rounded-sm p-1 my-1 w-fit btn-default">See preview</div>
            </A>
          </>
        ) : (
          ""
        )}
      </div>

      <div class="mb-6">
        <h3 class="font-semibold mb-2">Export map view as image (png)</h3>
        <div class="flex gap-2 flex-wrap">
          <button
            type="button"
            class="rounded-sm p-2 my-2 btn-default"
            onClick={exportMapImage}
            disabled={exportingImage()}
          >
            <i class="fas fa-image mr-2" />
            {exportingImage() ? "Capturing..." : "Export map as image"}
          </button>
        </div>
      </div>

      <div class="mb-6">
        <h3 class="font-semibold mb-2">Export tree coordinates</h3>
        <div class="flex gap-2 flex-wrap">
          <button
            type="button"
            class="rounded-sm p-2 my-2 btn-default"
            onClick={exportKML}
            disabled={exportingKML()}
          >
            <i class="fas fa-map-marker-alt mr-2" />
            {exportingKML() ? "Exporting..." : "Export trees as KML"}
          </button>
        </div>
      </div>

      <div class="mb-6  border-zinc-300 dark:border-slate-600 pt-6">
        <TreeStripsExport
          systemLayout={systemLayout()}
          systemDesign={
            systemLayout() || !scenarioData()?.project?.systemdesign
              ? system
              : scenarioData()?.project?.systemdesign
          }
          species={species}
          onGeneratePreview={onGeneratePreview}
        />
      </div>
    </div>
  );
};

const InfoContent = ({
  scenarioData,
  refetchScenarioData,
  params,
  deleteModalOpen,
  setDeleteModalOpen,
  deleteProjectAction,
}: any) => {
  const [scenarioName, setScenarioName] = createSignal("");
  const [scenarioDescription, setScenarioDescription] = createSignal("");
  const [isSaving, setIsSaving] = createSignal(false);

  // Initialize values when scenarioData loads
  createEffect(() => {
    const data = scenarioData();
    if (data?.project) {
      setScenarioName(data.project.name || "");
      setScenarioDescription(data.project.description || "");
    }
  });

  // Check if there are unsaved changes
  const hasUnsavedChanges = createMemo(() => {
    const data = scenarioData();
    if (!data?.project) return false;

    return (
      scenarioName().trim() !== (data.project.name || "") ||
      scenarioDescription().trim() !== (data.project.description || "")
    );
  });

  const saveMetadata = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}`,
        {
          method: "PUT",
          ...apiFetchOptions(),
          body: JSON.stringify({
            project: {
              name: scenarioName().trim(),
              description: scenarioDescription().trim(),
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to update scenario");
      }

      showToast({
        title: "Saved",
        description: "Scenario information updated successfully",
        variant: "success",
      });

      // Refetch the scenario data to update the UI with saved values
      if (refetchScenarioData) {
        await refetchScenarioData();
      }

      // Trigger breadcrumb update by incrementing reload signal
      setReloadSignal((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to update scenario:", error);
      showToast({
        title: "Error",
        description: "Failed to update scenario information",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div class="dark:bg-customdark1 bg-white text-black dark:text-white">
      <h2 class="font-bold text-lg mb-4">Scenario Information</h2>

      <div class="mb-6">
        <label for="scenario-name" class="font-semibold mb-2 block">
          Title
        </label>
        <input
          id="scenario-name"
          type="text"
          value={scenarioName()}
          onInput={(e) => setScenarioName(e.target.value)}
          class="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          placeholder="Enter scenario title"
        />
      </div>

      <div class="mb-6">
        <label for="scenario-description" class="font-semibold mb-2 block">
          Description
        </label>
        <textarea
          id="scenario-description"
          value={scenarioDescription()}
          onInput={(e) => setScenarioDescription(e.target.value)}
          class="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 min-h-[100px]"
          placeholder="Enter scenario description"
        />
      </div>

      <Show when={hasUnsavedChanges()}>
        <div class="mb-6">
          <Button onClick={saveMetadata} disabled={isSaving()} class="w-full">
            {isSaving() ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </Show>

      <div class="border-t border-zinc-300 dark:border-slate-600 pt-8">
        <Dialog open={deleteModalOpen()} onOpenChange={setDeleteModalOpen}>
          <DialogTrigger>
            <button type="button" class="rounded-sm p-2 btn-danger">
              Delete Scenario
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm deletion of scenario</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              <p>
                When you delete your scenario, all information connected to it will be permanently
                deleted and we will not be able to recreate it.
              </p>
            </DialogDescription>
            <DialogFooter>
              <form method="post" action={deleteProjectAction}>
                <button class="rounded-sm p-2 btn-danger" onClick={() => setDeleteModalOpen(false)}>
                  Delete scenario
                </button>
              </form>
              <button
                type="button"
                class="rounded-sm p-2 btn-default"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

// Custom duplicate modal with redirect functionality
const DuplicateScenarioModalWithRedirect = ({
  modalOpen,
  setModalOpen,
  refetchScenarios,
  activeScenario,
}: any) => {
  const [error, setError] = createSignal<string>("");
  const [submitDisabled, setSubmitDisabled] = createSignal(false);
  const params = useParams();
  const navigate = useNavigate();

  function cancel() {
    setModalOpen(false);
    setSubmitDisabled(false);
  }

  const [data, { refetch }] = createResource<{
    layer: LayerDocument;
    system: SystemDocument;
  }>(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}/new-project`,
      apiFetchOptions(),
    );
    const result = await response.json();
    return result;
  });

  const routeAction = action(async (formData: FormData) => {
    setSubmitDisabled(true);

    try {
      const payload = {
        project: {
          name: formData.get("project[name]")?.toString()!,
          source: activeScenario(),
        },
      };

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}/projects/duplicate`,
        {
          body: JSON.stringify(payload),
          method: "post",
          ...apiFetchOptions(),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to duplicate scenario: ${response.statusText}`);
      }

      const project: ProjectDocument = await response.json();
      refetchScenarios();
      setModalOpen(false);
      setSubmitDisabled(false);

      // Trigger breadcrumb reload
      setReloadSignal((prev) => prev + 1);

      // Navigate to the new duplicated project with Edit design tab selected
      navigate(
        `/parcels/${params.parcelId}/layers/${params.layerId}/projects/${project._id}?tab=edit`,
      );
    } catch (err) {
      console.error("Error duplicating scenario:", err);
      setError(err instanceof Error ? err.message : "Failed to duplicate scenario");
      setSubmitDisabled(false);
    }
  });

  return (
    <div>
      <Show when={modalOpen()}>
        <Dialog open={modalOpen()} onOpenChange={cancel}>
          <DialogContent onPointerDownOutside={cancel}>
            <DialogHeader>
              <DialogTitle>Duplicate "{activeScenario()?.name}"</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              <Show when={data()}>
                <Row>
                  <div>
                    <form method="post" action={routeAction}>
                      <div class="form-group">
                        <label for="project[name]">Scenario title</label>
                        <input
                          type="text"
                          class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                          name="project[name]"
                          placeholder=""
                          required
                          disabled={submitDisabled()}
                        />
                      </div>

                      <br />
                      <div class="btn-group">
                        <button
                          disabled={submitDisabled()}
                          type="submit"
                          class="rounded-sm p-1 my-2 btn-default"
                        >
                          Duplicate scenario
                        </button>
                      </div>
                    </form>
                  </div>
                </Row>
              </Show>

              <Show when={error()}>
                <p>{error()}</p>
              </Show>
            </DialogDescription>
          </DialogContent>
        </Dialog>
      </Show>
    </div>
  );
};
