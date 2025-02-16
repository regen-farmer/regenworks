import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { A, useNavigate, useParams } from "@solidjs/router";
import { AddRow } from "~/components/systems/add-row.tsx";
import type { ISpeciesSchema } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { useHCControl } from "~/util/map_controls/useHCControl.ts";
import { useBSControl } from "~/util/map_controls/useBSControl.ts";
import maplibregl from "maplibre-gl";

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
import {
  currentSubscriptions,
  isFreemium,
  subscriptions,
} from "~/auth/useAuth";
import FarmerAdvisorSelector from "~/components/freemium/farmer-advisor-selector";

function isEqual(var1, var2) {
  // Break the comparison out into a neat little function
  if (typeof var1 !== "object" && !Array.isArray(var1)) {
    const equal = var1 === var2;
    console.log(var1, var2, equal);
    return equal;
  } else {
    return deepEqual(var1, var2);
  }
}

function deepEqual(var1, var2) {
  for (const i in var1) {
    if (typeof var2[i] === "undefined") {
      // Quick check, does the property even exist?
      return false;
    }
    if (!isEqual(var1[i], var2[i])) {
      return false;
    }
  }
  return true;
}

function areObjectsEqual(obj1, obj2) {
  return deepEqual(obj1, obj2) && deepEqual(obj2, obj1); // Two-way checking
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

  const scenarioData = getScenario(params.projectId, (result) => {
    if (result) {
      if (result?.project.systemdesign) {
        setSavedSystem(
          JSON.parse(JSON.stringify(result?.project.systemdesign!))
        );
        setSystem(result?.project.systemdesign!);
      }
    }
  });

  const species = getSpecies();

  // createMemo(() => {
  // 	scenarioDataRefresh();
  // 	return useLocation().pathname;
  // });

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

  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <Resizable>
      <ResizablePanel style={{ overflow: "hidden" }}>
        <FarmerAdvisorSelector
          isOpen={isOpen}
          onClose={() => {
            setIsOpen(false);
          }}
          onSelect={() => {
            setIsOpen(false);
          }}
        />
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
                  <div style={{ overflow: "overlay", flex: "1 1 auto" }}>
                    <Show when={!isFreemium()}>
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
                                                  <select
                                                    style="width:100%;max-width:100%;"
                                                    class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                                                    value={
                                                      sequence.species ?? ""
                                                    }
                                                    onchange={(e) => {
                                                      setSystem(
                                                        "rows",
                                                        rowIdx(),
                                                        "sequence",
                                                        sequenceIdx(),
                                                        "species",
                                                        (species) => {
                                                          const newSpecies =
                                                            e.target.value;
                                                          return newSpecies;
                                                        }
                                                      );

                                                      logSystem();
                                                    }}
                                                  >
                                                    <option value="">
                                                      none
                                                    </option>
                                                    <For
                                                      each={species()?.species.filter(
                                                        (
                                                          species: ISpeciesSchema
                                                        ) =>
                                                          ![
                                                            "herb",
                                                            "grass",
                                                          ].includes(
                                                            species.form
                                                          )
                                                      )}
                                                    >
                                                      {(species) => (
                                                        <option
                                                          value={species._id}
                                                        >
                                                          {species.nameCommon}
                                                        </option>
                                                      )}
                                                    </For>
                                                  </select>
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

                                  <select
                                    class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                                    style="width:100%;max-width:100%;"
                                    value={row.groundcover ?? ""}
                                    onchange={(e) => {
                                      setSystem(
                                        "rows",
                                        rowIdx(),
                                        "groundcover",
                                        (gc) => {
                                          const newGroundCover = e.target.value;
                                          return newGroundCover;
                                        }
                                      );

                                      logSystem();
                                    }}
                                  >
                                    <option value="">none</option>
                                    <For
                                      each={species()?.species.filter(
                                        (species: ISpeciesSchema) =>
                                          ["herb", "grass"].includes(
                                            species.form
                                          )
                                      )}
                                    >
                                      {(species) => (
                                        <option value={species._id}>
                                          {species.nameCommon}
                                        </option>
                                      )}
                                    </For>
                                  </select>

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
                    </Show>
                  </div>

                  <div>
                    <div class="flex justify-between px-2	 border-t border-zinc-300 dark:border-slate-600 bg-white dark:bg-customdark1">
                      <A
                        end={true}
                        href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}`}
                        class="rounded-sm p-1 mr-1 my-2 btn-default "
                      >
                        <i class="fas fa-arrow-left" /> Back to scenario
                        dashboard
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

          {/* <Show when={!isFreemium()}> */}
          <Parameterbox
            system={system}
            setSystem={setSystem}
            logSystem={logSystem}
          />
          {/* </Show> */}

          <DesignPresetBox
            getSystemDesign={getSystemDesign}
            system={system}
            setSystem={setSystem}
            logSystem={logSystem}
          />
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
      <div class="dark:bg-customdark1 bg-white text-black left-2 top-2 p-2 rounded-md border border-zinc-300 dark:border-slate-600  dark:text-white absolute">
        <div>
          <div class="flex justify-between">
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

          <div class="flex flex-col gap-2 justify-start overflow-y-scroll">
            {/* <For each={images}>
              {({ src, alt, desc, system }) => ( */}
            <div
              class="flex relative whitespace-nowrap h-min-[200px]"
              onClick={() => {
                setSystem(images[presetIndex()].system);
                getSystemDesign();
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
      You are using the free version of RegenWorks - Choose a paid plan to
      unlock full design functionality
    </button>
  );
};

const Parameterbox = ({ system, setSystem, logSystem }: any) => {
  return (
    <div class="dark:bg-customdark1 bg-white text-black right-2 top-2 p-2 rounded-md border border-zinc-300 dark:border-slate-600  dark:text-white absolute">
      <Show when={system}>
        {/* 
              <div class='form-group'>
                <label>Layout type</label>
                <select
                  class='form-control'
                  value={systemData()?.systemdesign?.layout}
                  onchange={(e) => {
                    setSystem('layout', e.target.value)
                    logSystem()
                  }}
                >
                  <option value='straight'>Straight rows</option>
                </select>
              </div>
              <div class='form-group'>
                <label>Alignment</label>
                <select
                  class='form-control'
                  value={systemData()?.systemdesign?.alignment}
                  onchange={(e) => {
                    setSystem('alignment', e.target.value)
                    logSystem()
                  }}
                >
                 
                  <option value='north'>North/south</option>
                  <option value='west'>West/East</option>
                </select>
              </div> */}

        <div class="form-group justify-between	flex my-1 align-middle">
          <label class="leading-7 mr-2 w-full text-right">Bearing</label>
          <input
            disabled={isFreemium()}
            type="number"
            min={-180}
            class="form-control p-1 rounded-sm w-20  border border-zinc-300 dark:border-slate-600"
            onchange={(e) => {
              setSystem("bearing", Number.parseFloat(e.target.value));
              logSystem();
            }}
            value={system.bearing ?? 0}
          />
        </div>

        <div class="form-group justify-between	flex my-1 align-middle">
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

        <div class="form-group justify-between	flex my-1 align-middle">
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
      </Show>
    </div>
  );
};
