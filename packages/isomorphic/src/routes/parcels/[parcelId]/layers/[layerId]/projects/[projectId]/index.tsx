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
import type { ISystemBasedLayout } from "@rw/modelling/gis/types/system-based-layout.ts";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";
import { useMeasureControl } from "~/util/map_controls/useMeasureControl.ts";
import _ from "lodash";
// import { toast } from "solid-sonner";
// import { Toaster } from "~/components/ui/sonner";

import { showToast, Toaster } from "~/components/ui/toast";
import { isFreemium } from "~/auth/useAuth";
import FarmerAdvisorSelector from "~/components/freemium/farmer-advisor-selector";

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

  let map: maplibregl.Map;

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

          ...mapCameraState,
          // bearing: 40,
          // maxPitch: 85,
        });

        map.on("load", () => {
          window.dispatchEvent(new Event("resize"));

          const areaLat = scenarioData()?.project.layer.lat;
          const areaLng = scenarioData()?.project.layer.lng;

          use3DControl(map, systemLayout, species);
          useMeasureControl(map);

          if (withinDKBBox(areaLng!, areaLat!)) {
            useHCControl(map);
            useBSControl(map);
          }

          const nav = new MaptilerNavigationControl();
          map.addControl(nav, "top-right");

          setMapLoaded(true);

          const unparsedFieldPolygon: any =
            scenarioData()?.project.layer.geometry;
          const fieldPolygon = JSON.parse(
            unparsedFieldPolygon!.replace(/&#34;/g, '"')
          );

          // var offset = layoutData()?.offset

          const fieldPolygonVisible = true;
          if (fieldPolygonVisible) {
            if (map.getSource("fieldPolygon")) {
              map.removeLayer("fieldPolygon");
              map.removeSource("fieldPolygon");
            }

            map.addLayer({
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

  createEffect(() => {
    if (mapLoaded() && systemLayout()) {
      drawSystemDesign(map, systemLayout());
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

  async function saveSystem() {
    setSaving(true);

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

  const [isFarmerAdvisorSelectorOpen, setIsFarmerAdvisorSelectorOpen] =
    createSignal(false);
  const [deleteModalOpen, setDeleteModalOpen] = createSignal(false);

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

                    <TabsContent value="edit" style={{ overflow: "overlay", flex: "1 1 auto" }}>
                      <Show when={!isFreemium()} fallback={
                        <div style={{ height: "100%", display: "flex", "align-items": "center", "justify-content": "center", padding: "40px" }}>
                          <div class="text-center">
                            <i class="fas fa-lock text-6xl text-gray-400 mb-4" />
                            <h2 class="text-2xl font-bold mb-4">Upgrade to unlock full design functionality</h2>
                            <p class="text-gray-600 dark:text-gray-400 mb-6">
                              You are using the free version of RegenWorks. 
                              Choose a paid plan to access the full row editor and system design tools.
                            </p>
                            <A href="/settings" class="rounded-sm p-2 px-4 btn-default">
                              View upgrade options
                            </A>
                          </div>
                        </div>
                      }>
                      <div style={{ height: "100%", position: "relative" }}>
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
                                disabled={isFreemium()}
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
                            flex: 1,
                          }}
                        >
                        <For each={system.rows}>
                          {(row, rowIdx) => (
                            <>
                              <AddRow
                                index={rowIdx()}
                                setSystem={setSystem}
                                logSystem={logSystem}
                              />

                              <div
                                style={{
                                  "min-width": "240px",
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
                                                    placeholder="Spacing (m)"
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
                                                    defaultValue={ species()?.species.find(s => s._id === sequence.species)}
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
                                      defaultValue={ species()?.species.find(s => s._id === row.groundcover)}
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
                                        placeholder="Width"
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

                                <div class="flex w-full justify-center align-middle">
                                  <i
                                    onClick={() => {
                                      setSystem("rows", (prev) => {
                                        const newRows = [...prev];
                                        newRows.splice(rowIdx(), 1);
                                        return newRows;
                                      });
                                      logSystem();
                                    }}
                                    class="fa-solid fa-trash cursor-pointer text-zinc-400 dark:text-zinc-500 dark:hover:text-red-500 hover:text-red-500 m-1 text-lg "
                                  />

                                  <p class="font-bold leading-9">
                                    Row {rowIdx() + 1}
                                  </p>
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
                        />
                        </div>
                      </div>
                    </Show>
                  </TabsContent>

                  <TabsContent value="presets" style={{ overflow: "auto", flex: "1 1 auto", padding: "20px" }}>
                    <DesignPresetContent
                      getSystemDesign={getSystemDesign}
                      system={system}
                      setSystem={setSystem}
                      logSystem={logSystem}
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

                  <div>
                    <div class="flex justify-between px-2	 border-t border-zinc-300 dark:border-slate-600 bg-white dark:bg-customdark1">
                      <A
                        end={true}
                        href={`/parcels/${params.parcelId}/layers/${params.layerId}`}
                        class="rounded-sm p-1 mr-1 my-2 btn-default "
                      >
                        <i class="fas fa-arrow-left" /> Back to field
                      </A>

                      <div class="form-group">
                        <button
                          // disabled={submitDisabled()}
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
                          // disabled={submitDisabled()}
                          type="submit"
                          class="rounded-sm p-1 my-2 btn-default"
                          onclick={getSystemDesign}
                          disabled={previewing() || system.rows.length === 0}
                        >
                          Generate preview
                        </button>
                      </div>

                      {/* <div class='form-group'>
                      <button
                        // disabled={submitDisabled()}
                        type='submit'
                        class='btn btn-default'
                      >
                        Preview
                      </button>
                    </div> */}
                    </div>
                  </div>
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
              />
            </Show>
          </div>
        </div>
      </ResizablePanel>
    </Resizable>
  );
}

export { drawSystemDesign };

const DesignPresetBox = ({
  system,
  setSystem,
  logSystem,
  getSystemDesign,
  triggerFarmerAdvisorSelector,
}: any) => {
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
  ];

  const [presetIndex, setPresetIndex] = createSignal(0);

  const [showPreset, setShowPreset] = createSignal<boolean>(isFreemium());

  return (
    <>
      <div class="dark:bg-customdark1 overflow-hidden bg-white text-black left-2 top-2 p-2 rounded-md border border-zinc-300 dark:border-slate-600  dark:text-white absolute">
        <div class="overflow-hidden">
          <div class="flex justify-between overflow-hidden">
            <span
              class="cursor-pointer"
              onClick={() => setShowPreset((prev) => !prev)}
            >
              {showPreset() ? "Presets (click here to hide)" : "Show Presets"}
            </span>

            <Show when={showPreset()}>
              <div class="flex gap-2">
                <button
                  class="rounded-sm p-1 btn-default"
                  onClick={() =>
                    setPresetIndex((i) => (i <= 0 ? images.length - 1 : i - 1))
                  }
                >
                  <i class="fas fa-arrow-left" />
                </button>
                <button
                  class="rounded-sm p-1 btn-default"
                  onClick={() =>
                    setPresetIndex((i) => (i >= images.length - 1 ? 0 : i + 1))
                  }
                >
                  <i class="fas fa-arrow-right" />
                </button>
              </div>
            </Show>
          </div>
        </div>
        <Show when={showPreset()}>
          <br />

          <div class="flex flex-col gap-2 justify-start ">
            {/* <For each={images}>
              {({ src, alt, desc, system }) => ( */}
            <div
              class="flex relative whitespace-nowrap h-min-[200px]"
              onClick={() => {
                setSystem(images[presetIndex()].system);
                getSystemDesign();
                triggerFarmerAdvisorSelector();
              }}
            >
              <img
                src={images[presetIndex()].src}
                alt={images[presetIndex()].alt}
                style={{ "min-height": "200px", "max-width": "500px" }}
              />
              <div class="absolute bg-gray-700 bg-opacity-80 h-full w-full opacity-0 hover:opacity-100 flex items-center justify-center">
                <p
                  class="text-center font-serif italic text-white p-4"
                  style={{ "white-space": "pre-line" }}
                >
                  {images[presetIndex()].desc}
                </p>
              </div>
            </div>
            {/* )} */}
            {/* </For> */}
            <Show when={isFreemium()}>
              <FreemiumBox />
            </Show>
          </div>
        </Show>
      </div>
    </>
  );
};

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
  triggerFarmerAdvisorSelector,
}: any) => {
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
  ];

  const [presetIndex, setPresetIndex] = createSignal(0);

  return (
    <>
      <div class="dark:bg-customdark1 bg-white text-black dark:text-white">
        <h2 class="font-bold text-lg mb-4">Design Presets</h2>
        <div class="flex gap-2 mb-4">
          <button
            class="rounded-sm p-1 btn-default"
            onClick={() =>
              setPresetIndex((i) => (i <= 0 ? images.length - 1 : i - 1))
            }
          >
            <i class="fas fa-arrow-left" />
          </button>
          <button
            class="rounded-sm p-1 btn-default"
            onClick={() =>
              setPresetIndex((i) => (i >= images.length - 1 ? 0 : i + 1))
            }
          >
            <i class="fas fa-arrow-right" />
          </button>
        </div>

        <div class="flex flex-col gap-2 justify-start ">
          <div
            class="flex relative whitespace-nowrap h-min-[200px] cursor-pointer"
            onClick={() => {
              setSystem(images[presetIndex()].system);
              getSystemDesign();
              triggerFarmerAdvisorSelector();
            }}
          >
            <img
              src={images[presetIndex()].src}
              alt={images[presetIndex()].alt}
              style={{ "min-height": "200px", "max-width": "500px" }}
            />
            <div class="absolute bg-gray-700 bg-opacity-80 h-full w-full opacity-0 hover:opacity-100 flex items-center justify-center">
              <p
                class="text-center font-serif italic text-white p-4"
                style={{ "white-space": "pre-line" }}
              >
                {images[presetIndex()].desc}
              </p>
            </div>
          </div>
          <Show when={isFreemium()}>
            <FreemiumBox />
          </Show>
        </div>
      </div>
    </>
  );
};

const ExportAndShareContent = ({ scenarioData, params }: any) => {
  const [exportingKML, setExportingKML] = createSignal(false);
  const [isPublic, setIsPublic] = createSignal(scenarioData()?.project.isPublic || false);

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

  return (
    <div class="dark:bg-customdark1 bg-white text-black dark:text-white">
      <h2 class="font-bold text-lg mb-4">Export and Share</h2>
      
      <div class="mb-6">
        <h3 class="font-semibold mb-2">Export KML</h3>
        <button
          type="button"
          class="rounded-sm p-1 my-2 btn-default"
          onClick={exportKML}
          disabled={exportingKML()}
        >
          Export trees from system design as KML
        </button>
      </div>

      <div class="mb-6">
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
