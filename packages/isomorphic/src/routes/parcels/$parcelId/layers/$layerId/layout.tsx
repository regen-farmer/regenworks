import {
  createEffect,
  createResource,
  createSignal,
  For,
  Show,
  onCleanup,
  onMount,
} from "solid-js";
import { Link, useParams, createFileRoute } from "@tanstack/solid-router";
import type { LayerDocument } from "@rw/db/schemas/layer.ts";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import maplibregl from "maplibre-gl";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import type * as turf from "@turf/turf";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";
import { Row } from "~/components/row/Row";
import { useBSControl } from "~/util/map_controls/useBSControl.ts";
import { useHCControl } from "~/util/map_controls/useHCControl.ts";

export const Route = createFileRoute("/parcels/$parcelId/layers/$layerId/layout")({
  component: LayerLayoutView,
});

function LayerLayoutView() {
  const params = useParams({ strict: false });

  const [data] = createResource<{
    layer: LayerDocument;
    presentsystem: SystemDocument;
    species: SpeciesDocument[];
    collection: turf.FeatureCollection<turf.Geometry, turf.Properties>;
    places: turf.FeatureCollection<
      turf.Point,
      {
        description: string;
      }
    >;
    trees: turf.FeatureCollection<turf.Polygon, turf.Properties>;
    treenames: turf.FeatureCollection<
      turf.Point,
      {
        description: string;
      }
    >;
    vegetables: turf.FeatureCollection<turf.Polygon, turf.Properties>;
    strips: turf.FeatureCollection<
      turf.Polygon,
      {
        name: string;
      }
    >;
    alleys: turf.FeatureCollection<
      turf.Polygon,
      {
        name: string;
      }
    >;
  }>(async () => {
    const params = useParams<{ parcelId: string; layerId: string }>();

    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/layers/${params().layerId}/layout`,
      {
        ...apiFetchOptions(),
      },
    );
    return await response.json();
  });

  const handleDeleteRow = async (e: SubmitEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const rowId = formData.get("row[id]")?.toString()!;

    await fetch(`${import.meta.env.VITE_BACKEND_URL}/layers/${params().layerId}/row/${rowId}`, {
      body: "",
      method: "delete",
      ...apiFetchOptions(),
    });
  };

  const [layoutMapRef, setLayoutMapRef] = createSignal<HTMLElement>();

  createEffect(async () => {
    if (data.state === "ready" && layoutMapRef()) {
      const areaLat = data()?.layer.lat;
      const areaLng = data()?.layer.lng;

      const trees = data()?.trees;

      const alleys = data()?.alleys;

      const strips = data()?.strips;

      const col = data()?.collection;

      // @ts-ignore
      const getgeometry = data()?.layer.geometry;
      const correctgeometry = JSON.parse(getgeometry!.replace(/&#34;/g, '"'));

      const placecollection = data()?.places;

      const treenames = data()?.treenames;

      const vegecollection = data()?.vegetables;

      console.log(correctgeometry);

      const map = new maplibregl.Map({
        container: layoutMapRef()!,
        attributionControl: false,
        style: GoogleSatStyle,
        center: [areaLng!, areaLat!],
        zoom: 16,
        maxZoom: 20,
      });

      map.on("load", () => {
        map.addControl(new maplibregl.FullscreenControl({}));
        useBSControl(map);
        useHCControl(map);

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
                coordinates: correctgeometry.geometry.coordinates,
              },
              properties: {},
            },
          },
          layout: {},
          paint: {
            "fill-color": "#fff1ff",
            "fill-opacity": 0.5,
            "fill-outline-color": "#F0F8FF",
          },
        });

        map.addLayer({
          id: "alleys",
          type: "fill",
          // @ts-ignore
          source: {
            type: "geojson",
            data: alleys,
          },
          layout: {},
          paint: {
            "fill-color": "#1EBEC8",
            "fill-opacity": 0.6,
            "fill-outline-color": "#F0F8FF",
          },
        });

        map.addLayer({
          id: "strips",
          type: "fill",
          // @ts-ignore
          source: {
            type: "geojson",
            data: strips,
          },
          layout: {},
          paint: {
            "fill-color": "#002eff",
            "fill-opacity": 0.6,
            "fill-outline-color": "#F0F8FF",
          },
        });

        map.addLayer({
          id: "map1",
          type: "line",
          // @ts-ignore
          source: {
            type: "geojson",
            data: col,
          },
          layout: {},
          paint: {
            "line-color": "#1f1f1f",
          },
        });

        map.addLayer({
          id: "poi-labels",
          type: "symbol",
          maxzoom: 20,
          // @ts-ignore
          source: {
            type: "geojson",
            data: placecollection,
          },
          layout: {
            "text-field": ["get", "description"],
            "text-justify": "center",
            "icon-image": ["concat", ["get", "icon"], "-15"],
          },
        });

        map.addLayer({
          id: "map2",
          type: "fill",
          // @ts-ignore
          source: {
            type: "geojson",
            data: trees,
          },
          layout: {},
          paint: {
            "fill-color": "#1EBEC8",
            "fill-opacity": 0.8,
            "fill-outline-color": "#F0F8FF",
          },
        });

        map.addLayer({
          id: "map3",
          type: "fill",
          // @ts-ignore
          source: {
            type: "geojson",
            data: vegecollection,
          },
          layout: {},
          paint: {
            "fill-color": "#1EBEC8",
            "fill-opacity": 0.8,
            "fill-outline-color": "#F0F8FF",
          },
        });

        map.addLayer({
          id: "tree-labels",
          type: "symbol",
          minzoom: 20,
          // @ts-ignore
          source: {
            type: "geojson",
            data: treenames,
          },
          layout: {
            "text-field": ["get", "description"],
            "text-justify": "center",
            "icon-image": ["concat", ["get", "icon"], "-15"],
          },
        });
      });

      onCleanup(() => {
        if (map) {
          map.remove();
        }
      });
    }
  });

  const [showDeleteRowModal, setShowDeleteRowModal] = createSignal("");

  return (
    <>
      <div style={{ margin: "20px" }}>
        test
        <Show when={data()}>
          <Row>
            <div class="col-md-6">
              <div id="layerMapShow" ref={setLayoutMapRef} />
              <Link
                to={`/parcels/${params().parcelId}/layers/${params().layerId}`}
                class="rounded-sm p-1 my-1 mt-2 btn-default"
              >
                <i class="fas fa-arrow-left" /> Field
              </Link>
              <Link
                title="Draw row/line on map"
                to={`/parcels/${params().parcelId}/layers/${params().layerId}/row/new`}
                class="rounded-sm p-1 my-1 mt-2 btn-default"
              >
                Draw row/line on map <i class="fas fa-plus" />
              </Link>
              <Link
                to={`/parcels/${params().parcelId}/layers/${params().layerId}/sequences/new`}
                class="rounded-sm p-1 my-1 mt-2 btn-default"
              >
                Create new row sequence
              </Link>
            </div>
            {/* <!--<div class="col-md-3">
            <div class="card">
                <div class="card-body">
                    <h2 class="h2">Existing assets</h2>
                </div>
            </div>
        </div>--> */}
            <div class="col-md-6">
              <div class="card">
                <div class="card-body">
                  <h2 class="h2">Existing rows {showDeleteRowModal()}</h2>
                  <table class="table small">
                    <tbody>
                      <tr class="table-secondary">
                        <td>Row ref</td>
                        <td>Row sequense pattern</td>
                        <td />
                      </tr>
                      <Show when={data()?.layer.rows && data()?.layer.rows.length! > 0}>
                        <For each={data()?.layer.rows}>
                          {(row, i) => (
                            <>
                              <tr>
                                <td>{row.name}</td>
                                {row.sequence ? (
                                  <td>
                                    {row.sequence.name}
                                    <Link
                                      to={`/parcels/${params().parcelId}/layers/${params().layerId}/sequences/${row.sequence._id}/edit`}
                                      class="rounded-sm p-1 my-1 btn-sm btn-default"
                                    >
                                      <i class="far fa-edit" />
                                    </Link>
                                  </td>
                                ) : (
                                  <td>---</td>
                                )}
                                <td>
                                  <Link
                                    to={`/parcels/${params().parcelId}/layers/${params().layerId}/row/${row._id}/edit`}
                                    class="rounded-sm p-1 my-1 btn-sm btn-default"
                                  >
                                    <i class="far fa-edit" />
                                  </Link>
                                  <button
                                    class="rounded-sm p-1 my-1 btn-danger"
                                    data-bs-toggle="modal"
                                    data-bs-target={`#deleteRowModal_${row._id}`}
                                    onClick={() => setShowDeleteRowModal(row._id.toString())}
                                  >
                                    <i class="far fa-trash-alt" />
                                  </button>
                                </td>
                              </tr>
                              {/* // <!-- Modal --> */}

                              <div
                                class="modal fade"
                                id={`deleteRowModal_${row._id}`}
                                tabindex="-1"
                                aria-labelledby={`deleteRowModalLabel_${row._id}`}
                                aria-hidden="true"
                              >
                                <div class="modal-dialog">
                                  <div class="modal-content">
                                    <div class="modal-header">
                                      <h1 class="modal-title" id={`deleteRowModalLabel_${row._id}`}>
                                        Confirm deletion of row
                                      </h1>
                                    </div>
                                    <div class="modal-body">
                                      <p>Confirm deletion of row: "{row.name}"</p>
                                    </div>
                                    <div class="modal-footer">
                                      <form onSubmit={handleDeleteRow} class="delete-form">
                                        <input
                                          type="hidden"
                                          name="row[id]"
                                          value={row._id.toString()}
                                        />
                                        <button
                                          class="rounded-sm p-1 my-1 btn-sm btn-danger"
                                          data-bs-dismiss="modal"
                                        >
                                          Delete row <i class="far fa-trash-alt" />
                                        </button>
                                      </form>
                                      <button
                                        class="rounded-sm p-1 my-2 btn-default"
                                        data-bs-dismiss="modal"
                                        onClick={() => setShowDeleteRowModal("")}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </For>
                      </Show>
                    </tbody>
                  </table>
                </div>
              </div>
              <Show when={data()?.layer.areas && data()?.layer.areas.length! > 0}>
                <div class="card">
                  <div class="card-body">
                    <h2 class="h2">Sub-areas</h2>
                    <table class="table small">
                      <tbody>
                        <tr class="table-secondary">
                          <td>Area ref</td>
                          <td>Crop rotation</td>
                          <td>Size</td>
                          <td />
                        </tr>
                        <Show when={data()?.layer.areas && data()?.layer.areas.length! > 0}>
                          <For each={data()?.layer.areas}>
                            {(area, i) => (
                              <>
                                <tr>
                                  <td>{area.name}</td>
                                  {area.rotation ? (
                                    <td>
                                      {area.rotation.name}
                                      {/* //                                 <!--
//                                     <A href="/projects/${params().layerId}/rotations/<%= layer.areas[i].rotation._id %>/edit" class="rounded-sm p-1 my-1 btn-sm btn-default"><i class="far fa-edit" /></A>
// --> */}
                                    </td>
                                  ) : (
                                    <td>---</td>
                                  )}
                                  {area.size ? <td>{Math.round(area.size)} m2</td> : <td>---</td>}
                                  <td>
                                    {/* //   <!--  <A href="/layers/${params().layerId}/areas/${ area._id }/edit" class="rounded-sm p-1 my-1 btn-sm btn-default"><i class="far fa-edit" /></A>
                            //     <button type="button" class="rounded-sm p-1 my-1 btn-sm btn-danger" data-toggle="modal" data-target="#myModalDeleteArea<%= i %>"><i class="far fa-trash-alt" /></button>
                            // --> */}
                                  </td>
                                </tr>
                                {/* // <!-- Modal --> */}
                                {/* <div
                                class='modal fade'
                                id={`myModalDeleteArea${i}`}
                                role='dialog'
                              >
                                <div class='modal-dialog'>
                                  <div class='modal-content'>
                                    <div class='modal-header'>
                                      <button
                                        type='button'
                                        class='close'
                                        data-dismiss='modal'
                                      >
                                        &times;
                                      </button>
                                      <h4 class='h4 modal-title'>
                                        Confirm deletion of area
                                      </h4>
                                    </div>
                                    <div class='modal-body'>
                                      <p>
                                        Confirm deletion of area: "{area.name}"
                                      </p>
                                    </div>
                                    <div class='modal-footer'>
                                      <form
                                        class='delete-form'
                                        action={`/layers/${params().layerId}/areas/${area._id}?_method=DELETE`}
                                        method='post'
                                      >
                                        <button class='btn btn-sm btn-danger'>
                                          Delete area{' '}
                                          <i class='far fa-trash-alt' />
                                        </button>
                                      </form>
                                      <button
                                        type='button'
                                        class='btn btn-default'
                                        data-dismiss='modal'
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div> */}
                              </>
                            )}
                          </For>
                        </Show>
                      </tbody>
                    </table>
                    {/* <!--
                    <button type="button" class="rounded-sm p-1 my-1 btn-sm btn-danger" data-toggle="modal" data-target="#myModalDeleteAllAreas">Delete all sub-areas <i class="far fa-trash-alt" /></button>
--> */}
                    {/* <!-- Modal --> */}
                    {/* <div
                    class='modal fade'
                    id='myModalDeleteAllAreas'
                    role='dialog'
                  >
                    <div class='modal-dialog'>
                      <div class='modal-content'>
                        <div class='modal-header'>
                          <button
                            type='button'
                            class='close'
                            data-dismiss='modal'
                          >
                            &times;
                          </button>
                          <h4 class='h4 modal-title'>Confirm delete all areas</h4>
                        </div>
                        <div class='modal-body'>
                          <p>
                            Reverts the design and planning back to dynamic
                            design where you can change headland and overall
                            system design again. This will delete all current
                            individual areas on the project. This will not
                            delete any existing rows, areas or trees on your
                            farm area, only on the project.
                          </p>
                        </div>
                        <div class='modal-footer'>
                          <A
                            href={`/parcels/${params().parcelId}/layers/${params().layerId}/deleteareas`}
                            class='btn mt-2 mb-2 btn-danger'
                          >
                            Delete all areas
                          </A>
                          <button
                            type='button'
                            class='btn btn-default'
                            data-dismiss='modal'
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div> */}
                  </div>
                </div>
              </Show>
            </div>
          </Row>
        </Show>
      </div>
    </>
  );
}
