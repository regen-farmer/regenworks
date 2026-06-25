import geojsonArea from "@mapbox/geojson-area";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
  onCleanup,
} from "solid-js";
import maplibregl from "maplibre-gl";
import type { LayerDocument } from "@rw/db/schemas/layer";
import { useLocation, useNavigate, useParams, Link, createFileRoute } from "@tanstack/solid-router";
import { getMongoDBUser } from "~/auth/useAuth.tsx";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { CreateNewScenarioModal } from "~/components/CreateNewScenarioModal.tsx";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";
import DuplicateScenarioModal from "~/components/DuplicateScenarioModal.tsx";
import { useMeasureControl } from "~/util/map_controls/useMeasureControl.ts";
import { useBSControl } from "~/util/map_controls/useBSControl.ts";
import { useHCControl } from "~/util/map_controls/useHCControl.ts";
import { useJordartControl } from "~/util/map_controls/useJordartControl.ts";
import { withinDKBBox } from "~/util/map_controls/within-dk-bbox.ts";
import { JordartLegend } from "~/components/JordartLegend.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export const Route = createFileRoute("/parcels/$parcelId/layers/$layerId/")({
  component: LayerIndexView,
});

function LayerIndexView() {
  const params = useParams({ strict: false });
  const [data, { refetch }] = createResource<{
    layer: LayerDocument;
    presentsystem: SystemDocument;
    species: SpeciesDocument[];
    rows: {
      row: number;
      array: {
        species: SpeciesDocument;
        position: number[];
        width: number;
      }[];
    }[];
  }>(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/layers/${params().layerId}`,
      apiFetchOptions(),
    );
    return await response.json();
  });

  const navigate = useNavigate();

  createMemo(() => {
    refetch();
    return useLocation().pathname;
  });

  const [modalOpen, setModalOpen] = createSignal(false);
  const [modal2Open, setModal2Open] = createSignal(false);
  const [activeScenario, setActiveScenario] = createSignal(undefined);
  const [showJordartLegend, setShowJordartLegend] = createSignal(false);
  const [jordartLegendCollapsed, setJordartLegendCollapsed] = createSignal(false);

  const handleDeleteField = async (e: SubmitEvent) => {
    e.preventDefault();
    await fetch(`${import.meta.env.VITE_BACKEND_URL}/layers/${params().layerId}`, {
      body: "",
      method: "delete",
      ...apiFetchOptions(),
    });
    navigate({ to: `/parcels/${params().parcelId}` });
  };

  const [mapContainer, setMapContainer] = createSignal<HTMLDivElement>();

  createEffect(() => {
    // console.log('mapcontainer', mapContainer(), 'data', data())
    if (data() && mapContainer()) {
      const areaLat = data()?.layer.lat;
      const areaLng = data()?.layer.lng;
      const escapedGeometry = data()?.layer.geometry;

      const correctgeometry = JSON.parse(escapedGeometry!);

      const map = new maplibregl.Map({
        container: mapContainer()!,
        attributionControl: false,
        style: GoogleSatStyle,
        center: [areaLng!, areaLat!],
        zoom: 15,
        maxZoom: 20,
      });

      map.on("load", () => {
        useMeasureControl(map);

        if (withinDKBBox(areaLng as number, areaLat as number)) {
          useHCControl(map);
          useBSControl(map);
          useJordartControl(map, setShowJordartLegend);
        }

        map.addLayer({
          id: "map",
          type: "fill",
          // @ts-ignore
          source: {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: correctgeometry?.geometry.coordinates,
              },
              properties: {},
            },
          },
          layout: {},
          paint: {
            "fill-color": "#7F22C0",
            "fill-opacity": 0.6,
            "fill-outline-color": "#F0F8FF",
          },
        });
      });

      onCleanup(() => {
        setShowJordartLegend(false);
        if (map) {
          map.remove();
        }
      });
    }
  });

  function deleteSystem(system: SystemDocument): () => void {
    return async () => {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/parcels/${
          params().parcelId
        }/layers/${params().layerId}/systems/${system._id}`,
        {
          body: JSON.stringify({}),
          method: "delete",
          ...apiFetchOptions(),
        },
      );

      if (response.status !== 200) {
        console.log(response.status, response.statusText);
      } else {
        refetch();
      }
    };
  }

  const projectStatusList = [
    ["planning", "Planning", "bg-primary", "list-group-item-primary"],
    ["Implementation", "Implementing", "bg-info", "list-group-item-info"],
    ["Completed", "Completed", "bg-success", "list-group-item-success"],
    ["Retired", "Retired", "bg-secondary", "list-group-item-secondary"],
    ["No status", "No status", "bg-secondary", "list-group-item-secondary"],
  ];

  const [deleteFieldModalOpen, setDeleteFieldModalOpen] = createSignal(false);

  function getArea() {
    const area = geojsonArea.geometry(JSON.parse(data()?.layer.geometry).geometry);
    console.log(area);
    return area;
  }

  return (
    <>
      <Dialog open={deleteFieldModalOpen()} onOpenChange={setDeleteFieldModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle id="deleteFieldModalLabel">Confirm deletion of field</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            <p>
              When you delete your field, all information connected to it like saved systems,
              projects and budgets will be permanently deleted and it will not be able to be
              restored.
            </p>
          </DialogDescription>
          <DialogFooter>
            <form onSubmit={handleDeleteField} class="delete-form">
              <button
                class="rounded-sm p-1 my-1 btn-danger"
                onClick={() => setDeleteFieldModalOpen(false)}
              >
                Delete field
              </button>
            </form>
            <button
              class="rounded-sm p-1 my-2 ml-2 btn-default"
              onClick={() => setDeleteFieldModalOpen(false)}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicateScenarioModal
        activeScenario={activeScenario}
        modalOpen={modal2Open}
        setModalOpen={setModal2Open}
        refetchScenarios={refetch}
      />

      <div>
        <Show when={data()}>
          <div id="layerMapShow" ref={setMapContainer} />

          <Show when={showJordartLegend()}>
            <JordartLegend
              collapsed={jordartLegendCollapsed()}
              onToggleCollapsed={() => setJordartLegendCollapsed(!jordartLegendCollapsed())}
            />
          </Show>

          <div
            style={{
              background: "#151515dd",
              "border-radius": "10px",
              position: "fixed",
              "z-index": 10,
              color: "white",
              right: "10px",
              bottom: "10px",
              padding: "10px",
            }}
          >
            <Show when={data()?.layer.projects}>
              <strong>Scenarios</strong>
              <div class="list-group rounded-md">
                <For each={data()?.layer.projects.slice().reverse()}>
                  {(project, i) => {
                    // let status = projectStatusList.find(
                    // 	(el) => el[0] === project.status,
                    // )!;

                    // if (!status) {
                    // 	status = projectStatusList[4];
                    // }

                    return (
                      <>
                        <div class="list-group-item list-group-item-action list-group-item-primary  overlay-list-div">
                          <Link
                            to={`/parcels/${params().parcelId}/layers/${params().layerId}/projects/${project._id}`}
                            class={"overlay-list-link"}
                          >
                            {/* <div
																	style={{
																		display: "inline-block",
																		"min-width": "120px",
																	}}
																>
																	<span
																		class={"badge ${status[2]} rounded-pill"}
																	>
																		{status[1]}
																	</span>
																</div> */}

                            <span>{project.name}</span>
                          </Link>

                          <button
                            title="Duplicate scenario"
                            class={
                              "rounded-sm p-1 my-2 btn-default menu-btn list-group-button rounded-sm"
                            }
                            onClick={() => {
                              setActiveScenario(project);
                              setModal2Open(true);
                            }}
                          >
                            <i class="fa-regular fa-copy" />
                          </button>
                        </div>
                      </>
                    );
                  }}
                </For>
              </div>
              <CreateNewScenarioModal
                modalOpen={modalOpen}
                setModalOpen={setModalOpen}
                refetchScenarios={refetch}
              >
                <button class="rounded-sm p-1 my-2 btn-default w-full">Create new scenario</button>
              </CreateNewScenarioModal>
            </Show>
          </div>

          <div
            style={{
              background: "#151515dd",
              "border-radius": "10px",
              position: "fixed",
              "z-index": 10,
              color: "white",
              left: "10px",
              bottom: "10px",
              padding: "10px",
            }}
          >
            <p class="card-text">
              {"Area size: "}
              {getArea()! > 5000
                ? `${(getArea()! * 0.0001).toFixed(2).replace(".", ",")} ha`
                : `${getArea().toFixed(0).replace(".", ",")} m2`}
            </p>

            <p>{data()?.layer.description ?? ""}</p>
            <hr />
            <Show when={getMongoDBUser() && data()?.layer.owner.id === getMongoDBUser()._id}>
              <>
                <Link
                  class="rounded-sm p-1 my-2 btn-default"
                  to={`/parcels/${params().parcelId}/layers/${data()?.layer._id}/edit`}
                >
                  Edit field details
                </Link>
                <button
                  class="rounded-sm p-1 my-1 ml-1 btn-danger"
                  onClick={() => setDeleteFieldModalOpen(true)}
                >
                  Delete Field
                </button>
                {/* // <!-- Modal --> */}
              </>
            </Show>
          </div>
        </Show>
      </div>
    </>
  );
}
