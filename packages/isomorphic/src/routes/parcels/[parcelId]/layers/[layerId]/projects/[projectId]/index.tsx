import { createEffect, createResource, createMemo, createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { A, useNavigate, useParams, useLocation } from "@solidjs/router";
import { AddRow } from "~/components/systems/add-row.tsx";
import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { useHCControl } from "~/util/map_controls/useHCControl.ts";
import { useBSControl } from "~/util/map_controls/useBSControl.ts";
import maplibregl from "maplibre-gl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { action } from "@solidjs/router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

import {
  ComboboxContent,
  ComboboxControl,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxItemLabel,
  ComboboxRoot,
  ComboboxSection,
  ComboboxTrigger
} from "~/components/ui/combobox";

import { withinDKBBox } from "~/util/map_controls/within-dk-bbox.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  ISystemDesignSchema,
  SystemDesignDocument,
} from "@rw/db/schemas/systemdesign.ts";

import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "~/components/ui/resizable";

import { use3DControl } from "~/util/map_controls/use3DControl.ts";
import { systemBasedLayout } from "@rw/modelling/gis/system_based_layout.ts";
import { MaptilerNavigationControl } from "@maptiler/sdk";
import { drawSystemDesign } from "~/components/systemDesigner/drawSystemDesign.ts";
import { getSpecies } from "~/util/getSpecies.ts";
import { getScenario } from "~/util/getScenario.ts";
import { SystemInfoBox } from "~/components/systemDesigner/SystemInfoBox.tsx";
import { TreeStripsExport } from "~/components/systemDesigner/TreeStripsExport.tsx";
import type { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";
import { Button } from "~/components/ui/button";
import { OfferRequestModal } from "~/components/OfferRequestModal";
import { useMeasureControl } from "~/util/map_controls/useMeasureControl.ts";
import _ from "lodash";
// import { toast } from "solid-sonner";
// import { Toaster } from "~/components/ui/sonner";

import { showToast, Toaster } from "~/components/ui/toast";
import { isFreemium, getAuth0User } from "~/auth/useAuth";
import FarmerAdvisorSelector from "~/components/freemium/farmer-advisor-selector";
import type { LayerDocument } from "@rw/db/schemas/layer.ts";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import { Row } from "~/components/row/Row";
import { setReloadSignal } from "~/components/select/project-select";

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

  const equal = _.isEqual(sd1JSON, sd2JSON);
  return equal;
}

export default function view() {
  const params = useParams<{
    projectId: string;
    parcelId: string;
    layerId: string;
  }>();

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

    // On client
    const layout = systemBasedLayout(
      system,
      scenarioData()?.project.layer.geometry
    );
    setSystemLayout(layout);

    // Don't touch

    window.dispatchEvent(new Event("resize"));

    setPreviewing(false);
    const timeTaken = Date.now() - start;
    console.log(`Rendering in: ${timeTaken} milliseconds`);
  }

  const location = useLocation();
  
  // Use createResource for project data to get refetch capability
  const [scenarioData, { refetch }] = createResource(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/layout`,
      apiFetchOptions(),
    );
    const result = await response.json();
    
    if (result?.project.systemdesign) {
      setSavedSystem(
        JSON.parse(JSON.stringify(result.project.systemdesign!))
      );
      setSystem(result.project.systemdesign!);
    }
    
    return result;
  });
  
  // Watch for URL changes and refetch
  createMemo(() => {
    refetch();
    return location.pathname;
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
        const areaLat = scenarioData()?.project.layer.lat;
        const areaLng = scenarioData()?.project.layer.lng;

        map = new maplibregl.Map({
          container: "layerMapShow",
          attributionControl: false,
          style: GoogleSatStyle,
          center: [areaLng!, areaLat!],
          zoom: 16,
          maxZoom: 20,
          pitch: 0,
          // @ts-ignore - preserveDrawingBuffer is needed for canvas export
          preserveDrawingBuffer: true, // Enable canvas export capability

          ...mapCameraState,
          // bearing: 40,
          // maxPitch: 85,
        });

        setMapInstance(map); // Store the map instance

        map.on("load", () => {
          window.dispatchEvent(new Event("resize"));

          const areaLat = scenarioData()?.project.layer.lat;
          const areaLng = scenarioData()?.project.layer.lng;

          // Use the 3D control and link it to our local signal
          const { show3D: controlShow3D, setShow3D: controlSetShow3D } = use3DControl(map, systemLayout, species);
          
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

          const nav = new MaptilerNavigationControl();
          map!.addControl(nav, "top-right");

          const unparsedFieldPolygon: any =
            scenarioData()?.project.layer.geometry;
          const fieldPolygon = JSON.parse(
            unparsedFieldPolygon!.replace(/&#34;/g, '"')
          );

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
              //@ts-ignore
              source: {
                type: "geojson",
                data: {
                  type: "Feature",
                  geometry: {
                    type: "Polygon",
                    coordinates: fieldPolygon.geometry.coordinates,
                  },
                  properties: {}
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
  });

  // Draw the system design when the layout or 3D mode changes
  createEffect(() => {
    if (mapLoaded() && systemLayout() && map) {
      drawSystemDesign(map, systemLayout()!, show3D());
      // Ensure field polygon sits below system layers
      try {
        const style = map.getStyle();
        if (style && style.layers) {
          const target = style.layers.find((l: any) =>
            l.id.startsWith("strips-") ||
            l.id.startsWith("trees-") ||
            l.id === "treeRowLines" ||
            l.id === "row-labels"
          );
          if (target && map.getLayer("fieldPolygon")) {
            map.moveLayer("fieldPolygon", target.id);
          }
        }
      } catch {}
    }
  });

  function logSystem() {
    console.log(JSON.stringify(system));
  }

  const [saving, setSaving] = createSignal(false);
  const [savedSystem, setSavedSystem] = createSignal<
    ISystemDesignSchema | undefined
  >(undefined);
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

      const latinName = speciesDoc?.species || undefined;

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

    console.log(system)

    const newsystem = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${
        params.projectId
      }/set-systemdesign`,
      {
        body: JSON.stringify(system),
        method: "put",
        ...apiFetchOptions(),
      }
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
      showToast({ title: "Please provide both name and description", variant: "destructive" });
      return;
    }
    
    setSavingPreset(true);
    try {
      // Try to capture a thumbnail from the map if available
      let thumbnail = null;
      const mapElement = document.getElementById('layerMapShow');
      if (mapElement && map) {
        try {
          const canvas = map.getCanvas();
          thumbnail = canvas.toDataURL('image/png');
        } catch (err) {
          console.log('Could not capture map thumbnail:', err);
        }
      }
      
      // Clean the system design to only include species IDs
      const cleanSystemDesign = {
        ...system,
        rows: system.rows.map((row: any) => ({
          ...row,
          groundcover: typeof row.groundcover === 'object' ? row.groundcover._id : row.groundcover,
          sequence: row.sequence ? row.sequence.map((seq: any) => ({
            ...seq,
            species: typeof seq.species === 'object' ? seq.species._id : seq.species
          })) : []
        }))
      };
      
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/userpresets`,
        {
          method: "POST",
          body: JSON.stringify({
            name: presetName(),
            description: presetDescription(),
            systemDesign: cleanSystemDesign,
            thumbnail,
            isPublic: false,
          }),
          ...apiFetchOptions(),
        }
      );
      
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

  const [isFarmerAdvisorSelectorOpen, setIsFarmerAdvisorSelectorOpen] =
    createSignal(false);
  const [deleteModalOpen, setDeleteModalOpen] = createSignal(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = createSignal(false);

  const navigate = useNavigate();
  
  const deleteProjectAction = action(async (formData: FormData) => {
    await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}`,
      {
        body: JSON.stringify({}),
        method: "delete",
        ...apiFetchOptions(),
      }
    );

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
                  <Tabs defaultValue="edit" style={{ height: "100%", display: "flex", "flex-direction": "column" }}>
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

                    <TabsContent value="edit" style={{ overflow: "hidden", flex: "1 1 auto", display: "flex", "flex-direction": "column" }}>
                      <Show when={isFreemium()}>
                        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 m-2">
                          <div class="flex items-start gap-2">
                            <i class="fas fa-info-circle text-blue-600 dark:text-blue-400 mt-0.5" />
                            <div class="text-sm">
                              <p class="font-semibold text-blue-900 dark:text-blue-100">Free plan - Limited editing</p>
                              <p class="text-blue-800 dark:text-blue-200">
                                You can apply presets and adjust the bearing angle.<br />
                                <A href="/settings" class="underline">Upgrade to unlock</A> full row editing capabilities.
                              </p>
                            </div>
                          </div>
                        </div>
                      </Show>
                      <div style={{ flex: "1 1 auto", position: "relative", overflow: "auto" }}>
                        <button
                          class="absolute top-2 right-2 rounded-sm p-2 btn-default z-10"
                          onClick={() => setShowSettings(prev => !prev)}
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
                                classList={{ "opacity-50 cursor-not-allowed": isFreemium() }}
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
                                classList={{ "opacity-50 cursor-not-allowed": isFreemium() }}
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
                                              classList={{ "opacity-50 cursor-not-allowed": isFreemium() }}
                                              disabled={isFreemium()}
                                              value={row.offset?.before}
                                              onChange={(e) => {
                                                setSystem(
                                                  "rows",
                                                  rowIdx(),
                                                  "offset",
                                                  (o) => {
                                                    const newOffset = { ...o };
                                                    newOffset.before =
                                                      Number.parseFloat(
                                                        e.target.value
                                                      );
                                                    return newOffset;
                                                  }
                                                );

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
                                              }
                                            );
                                            logSystem();
                                          }}
                                        >
                                          <i class="fa-solid fa-plus" /> Add
                                          tree
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
                                                      const newSequence = [
                                                        ...sequence,
                                                      ];
                                                      newSequence.splice(
                                                        sequenceIdx(),
                                                        1
                                                      );
                                                      return newSequence;
                                                    }
                                                  );
                                                  logSystem();
                                                }}
                                                class="fa-solid fa-trash cursor-pointer text-zinc-400 dark:text-zinc-500 dark:hover:text-red-500 hover:text-red-500 m-1 "
                                                classList={{ "opacity-50 cursor-not-allowed": isFreemium() }}
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
                                                    style={{ width: "100%" }}
                                                    type="number"
                                                    min={0}
                                                    class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                                                    classList={{ "opacity-50 cursor-not-allowed": isFreemium() }}
                                                    placeholder="Spacing (m)"
                                                    disabled={isFreemium()}
                                                    value={
                                                      sequence.spacingAfter
                                                    }
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
                                                            Number.parseFloat(
                                                              e.target.value
                                                            );
                                                          return newSpecies;
                                                        }
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
                                                    options={species()?.species.filter(
                                                      (
                                                        species: ISpeciesSchema
                                                      ) =>
                                                        ![
                                                          "herb",
                                                          "grass",
                                                        ].includes(
                                                          species.form
                                                        )
                                                    )??[]}
                                                    disabled={isFreemium()}
                                                    onChange={(e)=>{
                                                      setSystem(
                                                        "rows",
                                                        rowIdx(),
                                                        "sequence",
                                                        sequenceIdx(),
                                                        "species",
                                                        () => {
                                                          return e?._id!;
                                                        }
                                                      );
                                                    }}
                                                    value={ species()?.species.find(s => s._id === sequence.species)}
                                                    optionValue="_id"
                                                    optionTextValue={(species)=> `${species.nameCommon} (${species.family} ${species.genus} ${species.species})`}
                                                    optionLabel="nameCommon"
                                                    placeholder="Search a species…"
                                                    
                                                    itemComponent={(props) => (
                                                      <ComboboxItem item={props.item}>
                                                        <ComboboxItemLabel>{props.item.rawValue.nameCommon} ({props.item.rawValue.family} {props.item.rawValue.genus} {props.item.rawValue.species})</ComboboxItemLabel>
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
                                              }
                                            );
                                            logSystem();
                                          }}
                                        >
                                          <i class="fa-solid fa-plus" /> Add
                                          tree
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
                                              classList={{ "opacity-50 cursor-not-allowed": isFreemium() }}
                                              disabled={isFreemium()}
                                              value={row.offset?.after}
                                              onChange={(e) => {
                                                setSystem(
                                                  "rows",
                                                  rowIdx(),
                                                  "offset",
                                                  (o) => {
                                                    const offset = { ...o };
                                                    offset.after =
                                                      Number.parseFloat(
                                                        e.target.value
                                                      );
                                                    return offset;
                                                  }
                                                );

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
                                            return newSequence;
                                          }
                                        );
                                        logSystem();
                                      }}
                                    >
                                      Define tree sequence
                                    </button>
                                  )}

                                  <hr class="my-4 border-zinc-600 dark:border-white border-dashed" />

                                  <span>Ground cover</span>

                                  <ComboboxRoot<ISpeciesSchema>
                                      options={species()?.species.filter(
                                        (
                                          species: ISpeciesSchema
                                        ) =>
                                          [
                                            "herb",
                                            "grass",
                                          ].includes(
                                            species.form
                                          )
                                      )??[]}
                                      disabled={isFreemium()}
                                      onChange={(e)=>{
                                        setSystem(
                                          "rows",
                                          rowIdx(),
                                          "groundcover",
                                          (gc) => {
                                            return e?._id!;
                                          }
                                        );


                                        logSystem();
                                      }}
                                      value={ species()?.species.find(s => s._id === row.groundcover)}
                                      optionValue="_id"
                                      optionTextValue={(species)=> `${species.nameCommon} (${species.family} ${species.genus} ${species.species})`}
                                      optionLabel={(species)=> species.nameCommon}
                                      placeholder="Search a species…"
                                      
                                      itemComponent={(props) => (
                                        <ComboboxItem item={props.item}>
                                          <ComboboxItemLabel>{props.item.rawValue.nameCommon} ({props.item.rawValue.family} {props.item.rawValue.genus} {props.item.rawValue.species})</ComboboxItemLabel>
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
                                        classList={{ "opacity-50 cursor-not-allowed": isFreemium() }}
                                        placeholder="Width"
                                        disabled={isFreemium()}
                                        value={row.width}
                                        onChange={(e) => {
                                          setSystem(
                                            "rows",
                                            rowIdx(),
                                            "width",
                                            (width) => {
                                              const newWidth =
                                                Number.parseFloat(
                                                  e.target.value
                                                );
                                              return newWidth;
                                            }
                                          );

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
                      <div class="flex justify-between px-2 border-t border-zinc-300 dark:border-slate-600 bg-white dark:bg-customdark1" style={{ "flex-shrink": 0 }}>
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
                                    JSON.stringify(system)
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

                  <TabsContent value="presets" style={{ overflow: "auto", flex: "1 1 auto", padding: "20px" }}>
                    <DesignPresetContent
                      getSystemDesign={getSystemDesign}
                      system={system}
                      setSystem={setSystem}
                      logSystem={logSystem}
                      map={mapLoaded() ? map : undefined}
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

                  <TabsContent value="export" style={{ overflow: "auto", flex: "1 1 auto", padding: "20px" }}>
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

                  <TabsContent value="info" style={{ overflow: "auto", flex: "1 1 auto", padding: "20px" }}>
                    <InfoContent
                      scenarioData={scenarioData}
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
      // @ts-ignore
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
  triggerFarmerAdvisorSelector,
}: any) => {
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
  
  // Fetch user presets on mount
  createEffect(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/userpresets`,
        apiFetchOptions()
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
      showToast({ title: "Please provide both name and description", variant: "destructive" });
      return;
    }
    
    setSavingPreset(true);
    try {
      // Try to capture a thumbnail from the map if available
      let thumbnail = null;
      const mapElement = document.getElementById('layerMapShow');
      if (mapElement && map) {
        try {
          const canvas = map.getCanvas();
          thumbnail = canvas.toDataURL('image/png');
        } catch (err) {
          console.log('Could not capture map thumbnail:', err);
        }
      }
      
      // Clean the system design to only include species IDs
      const cleanSystemDesign = {
        ...system,
        rows: system.rows.map((row: any) => ({
          ...row,
          groundcover: typeof row.groundcover === 'object' ? row.groundcover._id : row.groundcover,
          sequence: row.sequence ? row.sequence.map((seq: any) => ({
            ...seq,
            species: typeof seq.species === 'object' ? seq.species._id : seq.species
          })) : []
        }))
      };
      
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/userpresets`,
        {
          method: "POST",
          body: JSON.stringify({
            name: presetName(),
            description: presetDescription(),
            systemDesign: cleanSystemDesign,
            thumbnail,
            isPublic: false,
          }),
          ...apiFetchOptions(),
        }
      );
      
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
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/userpresets/${presetId}`,
        {
          method: "DELETE",
          body: JSON.stringify({}),
          ...apiFetchOptions(),
        }
      );
      
      if (response.ok) {
        setUserPresets(userPresets().filter(p => p._id !== presetId));
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
      showToast({ title: "Please provide both name and description", variant: "destructive" });
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
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setUserPresets(userPresets().map(p => 
          p._id === editingPreset()._id ? { ...p, name: editName(), description: editDescription() } : p
        ));
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
            sequence: [
              { spacingAfter: 3, species: "5e6639548add4f22f08201ff" },
            ],
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
            sequence: [
              { species: "5e6501a0e4a1961d40fc538e", spacingAfter: 6 },
            ],
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
    {
      src: "/freemium/presets/Silvopoultry-poplar.jpg",
      alt: "Silvopoultry with poplar preset",
      desc: `
Silvopoultry with poplar
7 m double tree row + 3.5 m grass strip
3 m margin
N/S alignment
`,
      system: {
        rows: [
          {
            width: 3.5,
            sequence: [
              { spacingAfter: 1.5, species: "5e747abba84eb20bccc77d79" }, // Poplar
            ],
            offset: { before: 0, after: 0 },
          },
          {
            width: 3.5,
            sequence: [
              { spacingAfter: 1.5, species: "5e747abba84eb20bccc77d79" }, // Poplar (double row)
            ],
            offset: { before: 0, after: 0 },
          },
          {
            width: 3.5,
            sequence: [],
            offset: { before: 0, after: 0 },
            groundcover: "5e665452cccc150b186d4cd1", // Grass strip
          },
        ],
        bearing: 0, // N/S alignment
        margin: 3, // Changed from 20 to 3 as per description
        headland: 0,
      },
    },
  ];

  // Combine predefined and user presets
  const allPresets = createMemo(() => {
    const predefinedPresets = images.map((img, idx) => ({
      ...img,
      id: `predefined-${idx}`,
      type: 'predefined',
      canDelete: false,
    }));
    
    const userPresetsMapped = userPresets().map(preset => ({
      id: preset._id,
      type: 'user',
      canDelete: true,
      src: preset.thumbnail || '/placeholder-preset.svg',
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
                onClick={() => {
                  console.log('Applying preset:', preset.system);
                  // Clear existing system layers before drawing the preset
                  clearSystemDesignLayers();
                  // Clean the preset system to only use IDs
                  const cleanSystem = {
                    ...preset.system,
                    rows: preset.system.rows.map((row: any) => ({
                      ...row,
                      groundcover: typeof row.groundcover === 'object' ? row.groundcover._id : row.groundcover,
                      sequence: row.sequence ? row.sequence.map((seq: any) => ({
                        ...seq,
                        species: typeof seq.species === 'object' ? seq.species._id : seq.species
                      })) : []
                    }))
                  };
                  setSystem(cleanSystem);
                  getSystemDesign();
                  triggerFarmerAdvisorSelector();
                }}
              >
                {/* Thumbnail */}
                <img
                  src={preset.src}
                  alt={preset.alt}
                  class="w-20 h-20 object-contain bg-white rounded-md flex-shrink-0"
                  classList={{
                    "cursor-zoom-in": preset.src !== '/placeholder-preset.svg'
                  }}
                  onMouseEnter={(e) => {
                    // Only show hover if not placeholder image
                    if (preset.src !== '/placeholder-preset.svg') {
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
                    {preset.type === 'user' && (
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
                        if (preset.type === 'user') {
                          const userPreset = userPresets().find(p => p._id === preset.id);
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
        <Show when={hoveredPreset() !== null && allPresets()[hoveredPreset()!].src !== '/placeholder-preset.svg'}>
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
                  height: "350px"
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
              <button
                class="rounded-sm p-2 btn-default"
                onClick={() => setShowSaveModal(false)}
              >
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
      </div>
    </>
  );
};

const ExportAndShareContent = ({ scenarioData, params, systemLayout, system, species, mapInstance, onGeneratePreview }: any) => {
  const [exportingKML, setExportingKML] = createSignal(false);
  const [isPublic, setIsPublic] = createSignal(scenarioData()?.project.isPublic || false);
  const [exportingImage, setExportingImage] = createSignal(false);

  createEffect(() => {
    if (scenarioData()) {
      setIsPublic(scenarioData()?.project.isPublic || false);
    }
  });

  async function exportKML() {
    setExportingKML(true);
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${
        params.projectId
      }/design-preview`,
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

    element.setAttribute(
      "href",
      `data:text/plain;charset=utf-8,${encodeURIComponent(kmlDoc)}`,
    );
    element.setAttribute(
      "download",
      `${scenarioData()?.project.layer.name} - ${scenarioData()?.project.name}.kml`,
    );

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
    setExportingKML(false);
  }

  async function updatePublicSetting(value: boolean) {
    await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${
        params.projectId
      }/set-public`,
      {
        body: JSON.stringify({
          isPublic: value,
        }),
        method: "put",
        ...apiFetchOptions(),
      },
    );
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
        variant: "error"
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
            variant: "error"
          });
          return;
        }
        
        // Create a new canvas to draw the map
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = mapCanvas.width;
        exportCanvas.height = mapCanvas.height;
        const context = exportCanvas.getContext('2d');
        
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
        exportCanvas.toBlob((blob: Blob | null) => {
          if (!blob) {
            console.error("Failed to create image blob");
            setExportingImage(false);
            showToast({
              title: "Error",
              description: "Failed to capture map image. Try refreshing the page.",
              variant: "error"
            });
            return;
          }
          
          console.log("Blob created, size:", blob.size);
          
          if (blob.size < 1000) {
            console.error("Image too small, likely empty");
            showToast({
              title: "Error",
              description: "Map capture resulted in empty image. Please try again.",
              variant: "error"
            });
            setExportingImage(false);
            return;
          }
          
          // Create download link
          const url = URL.createObjectURL(blob);
          const element = document.createElement("a");
          const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
          const filename = `${scenarioData()?.project.layer.name || 'map'}_${scenarioData()?.project.name || 'export'}_${timestamp}.png`;
          
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
            variant: "success"
          });
        }, 'image/png', 1.0);
      } catch (error) {
        console.error("Error exporting map image:", error);
        setExportingImage(false);
        showToast({
          title: "Error",
          description: "Failed to export map image",
          variant: "error"
        });
      }
    };
    
    // Wait for map to be idle and fully rendered
    if (mapInstance.isMoving() || !mapInstance.loaded()) {
      mapInstance.once('idle', () => {
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
            <A
              target="_blank"
              href={`/scenario-preview/${params.projectId}`}
            >
              <div class="rounded-sm p-1 my-1 w-fit btn-default">
                See preview
              </div>
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
          systemDesign={systemLayout() || !scenarioData()?.project.systemdesign ? system : scenarioData()?.project.systemdesign}
          species={species}
          onGeneratePreview={onGeneratePreview}
        />
      </div>


    </div>
  );
};

const InfoContent = ({ scenarioData, params, deleteModalOpen, setDeleteModalOpen, deleteProjectAction }: any) => {
  return (
    <div class="dark:bg-customdark1 bg-white text-black dark:text-white">
      <h2 class="font-bold text-lg mb-4">Scenario Information</h2>
      
      <div class="mb-6">
        <h3 class="font-semibold mb-2">Title</h3>
        <p class="text-gray-700 dark:text-gray-300">{scenarioData()?.project.name || "No title"}</p>
      </div>

      <div class="mb-6">
        <h3 class="font-semibold mb-2">Description</h3>
        <p class="text-gray-700 dark:text-gray-300">{scenarioData()?.project.description || "No description"}</p>
      </div>

      <div class="border-t border-zinc-300 dark:border-slate-600 pt-8">
        
        <Dialog open={deleteModalOpen()} onOpenChange={setDeleteModalOpen}>
          <DialogTrigger>
            <button
              type="button"
              class="rounded-sm p-2 btn-danger"
            >
              Delete Scenario
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm deletion of scenario</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              <p>
                When you delete your scenario, all information
                connected to it will be permanently deleted and we will not be
                able to recreate it.
              </p>
            </DialogDescription>
            <DialogFooter>
              <form method="post" action={deleteProjectAction}>
                <button
                  class="rounded-sm p-2 btn-danger"
                  onClick={() => setDeleteModalOpen(false)}
                >
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
  }

  const [data, { refetch }] = createResource<{
    layer: LayerDocument;
    system: SystemDocument;
  }>(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/layers/${
        params.layerId
      }/new-project`,
      apiFetchOptions(),
    );
    const result = await response.json();
    return result;
  });

  const routeAction = action(async (formData: FormData) => {
    setSubmitDisabled(true);

    const payload = {
      project: {
        name: formData.get("project[name]")?.toString()!,
        source: activeScenario()
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

    const project: ProjectDocument = await response.json();
    refetchScenarios();
    setModalOpen(false);
    
    // Trigger breadcrumb reload
    setReloadSignal(prev => prev + 1);
    
    // Navigate to the new duplicated project
    navigate(`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${project._id}`);
  });

  return (
    <div>
      <Show when={modalOpen()}>
        <Dialog open={modalOpen()} onOpenChange={cancel}>
          <DialogContent onPointerDownOutside={cancel}>
            <DialogHeader>
              <DialogTitle>
                Duplicate "{activeScenario()?.name}"
              </DialogTitle>
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
