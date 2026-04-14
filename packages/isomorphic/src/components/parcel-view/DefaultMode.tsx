import type { IParcelSchema } from "@rw/db/schemas/parcel.ts";
import { Link, useNavigate, useParams } from "@tanstack/solid-router";
import type * as turf from "@turf/turf";
import type { Map as MLMap } from "maplibre-gl";
import {
  createEffect,
  createResource,
  createSignal,
  For,
  onMount,
  type Resource,
  Show,
} from "solid-js";
import { showToast } from "~/components/ui/toast";
import {
  createFarmScenarioConfig,
  deleteFarmScenarioConfig,
  getFarmScenarioConfigs,
} from "~/util/api/farmScenarioConfig.ts";
import { deleteFinancialModel, getFinancialModels } from "~/util/api/financialModel.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { removeLayers } from "~/util/removeLayers.ts";
import { CreateFinancialModelModal } from "../CreateFinancialModelModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

type DefaultModeProps = {
  data: Resource<
    | {
        parcel: IParcelSchema;
        collection: turf.helpers.FeatureCollection<any, any>;
        places: turf.helpers.FeatureCollection<
          turf.helpers.Point,
          {
            description: string;
          }
        >;
      }
    | undefined
  >;
  params: any;
  setMode: any;
  addField: any;
  editField: any;
  getMap: () => MLMap;
  refetch: any;
};

export default function DefaultMode({
  addField,
  editField,
  data,
  params,
  setMode,
  getMap,
  refetch,
}: DefaultModeProps) {
  function cleanupLayers() {
    removeLayers(["field-fills", "field-outlines", "field-labels"], getMap());
    getMap().off("click", "field-labels", moveMapToField);
    getMap().off("click", "field-fills", navigateToField);
  }

  const [activeField, setActiveField] = createSignal<string | undefined>(undefined);

  const navigate = useNavigate();

  // Fetch existing farm planting plan configurations
  const [farmConfigs, { refetch: refetchFarmConfigs }] = createResource(
    () => params().parcelId,
    async (parcelId) => {
      try {
        return await getFarmScenarioConfigs(parcelId);
      } catch (error) {
        console.error("Failed to fetch farm configs:", error);
        return [];
      }
    },
  );

  // Fetch financial models for all farm configs
  const [financialModels, { refetch: refetchModels }] = createResource(
    () => farmConfigs(),
    async (configs) => {
      if (!configs || configs.length === 0) return [];
      try {
        const modelPromises = configs.map(async (config) => {
          const models = await getFinancialModels(config._id as string);
          return models.map((m) => ({
            ...m,
            planName: config.name || "Unnamed Plan",
            planId: config._id as string,
          }));
        });
        const results = await Promise.all(modelPromises);
        return results.flat();
      } catch (error) {
        console.error("Failed to fetch financial models:", error);
        return [];
      }
    },
  );

  const [createScenarioModalOpen, setCreateScenarioModalOpen] = createSignal(false);
  const [newScenarioName, setNewScenarioName] = createSignal("");
  const [newScenarioDescription, setNewScenarioDescription] = createSignal("");
  const [isCreatingScenario, setIsCreatingScenario] = createSignal(false);
  const [activeListingPanel, setActiveListingPanel] = createSignal<
    "fields" | "scenarios" | "models" | null
  >("fields");
  const [deleteScenarioModalOpen, setDeleteScenarioModalOpen] = createSignal(false);
  const [scenarioToDelete, setScenarioToDelete] = createSignal<string | undefined>(undefined);
  const [createModelModalOpen, setCreateModelModalOpen] = createSignal(false);

  const handleDeleteFinancialModel = async (modelId: string) => {
    if (!confirm("Are you sure you want to delete this financial model?")) {
      return;
    }

    try {
      await deleteFinancialModel(modelId);
      await refetchModels();

      showToast({
        title: "Model deleted",
        description: "Financial model deleted successfully.",
        variant: "success",
      });
    } catch (error: any) {
      showToast({
        title: "Failed to delete",
        description: error.message || "An error occurred.",
        variant: "error",
      });
    }
  };

  const handleModelCreated = async (modelId: string) => {
    await refetchModels();
    navigate({ to: `/parcels/${params().parcelId}/models/${modelId}` });
  };

  const openCreateScenarioModal = () => {
    setIsCreatingScenario(false);
    setNewScenarioName("");
    setNewScenarioDescription("");
    setCreateScenarioModalOpen(true);
  };

  const handleCreateScenario = async (event: Event) => {
    event.preventDefault();
    if (isCreatingScenario()) {
      return;
    }

    const trimmedName = newScenarioName().trim();
    if (!trimmedName) {
      showToast({
        title: "Name required",
        description: "Add a name before creating a scenario.",
        variant: "error",
      });
      return;
    }

    setIsCreatingScenario(true);
    try {
      const fieldScenarios = (data()?.parcel.layers ?? []).map((layer) => ({
        layer: layer._id,
        enabled: true,
      }));

      const created = await createFarmScenarioConfig({
        parcel: params().parcelId,
        name: trimmedName,
        description: newScenarioDescription().trim() || undefined,
        fieldScenarios,
      });

      showToast({
        title: "Scenario created",
        description: "Opening the scenario preview.",
        variant: "success",
      });

      setCreateScenarioModalOpen(false);
      setNewScenarioName("");
      setNewScenarioDescription("");
      await refetchFarmConfigs();
      navigate({ to: `/parcels/${params().parcelId}/farm-scenario/${created._id}` });
    } catch (error) {
      console.error("Failed to create farm planting plan config:", error);
      showToast({
        title: "Creation failed",
        description:
          error instanceof Error
            ? error.message
            : "The scenario could not be created. Please try again.",
        variant: "error",
      });
    } finally {
      setIsCreatingScenario(false);
    }
  };

  const handleDeleteScenario = async () => {
    const configId = scenarioToDelete();
    if (!configId) return;

    try {
      await deleteFarmScenarioConfig(configId);

      showToast({
        title: "Scenario deleted",
        description: "The farm planting plan has been deleted.",
        variant: "success",
      });

      setDeleteScenarioModalOpen(false);
      setScenarioToDelete(undefined);
      await refetchFarmConfigs();
    } catch (error) {
      console.error("Failed to delete farm planting plan config:", error);
      showToast({
        title: "Deletion failed",
        description:
          error instanceof Error
            ? error.message
            : "The scenario could not be deleted. Please try again.",
        variant: "error",
      });
    }
  };

  function drawFields() {
    const map = getMap();
    if (!map) return;

    map.off("click", "field-labels", moveMapToField);
    map.off("click", "field-fills", navigateToField);

    const fillSource = map.getSource("field-fills") as maplibregl.GeoJSONSource;

    if (fillSource) {
      fillSource.setData(data()?.collection as any);
      const outlinesSource = map.getSource("field-outlines") as maplibregl.GeoJSONSource;
      if (outlinesSource) outlinesSource.setData(data()?.collection as any);
      const labelsSource = map.getSource("field-labels") as maplibregl.GeoJSONSource;
      if (labelsSource) labelsSource.setData(data()?.places as any);
    } else {
      cleanupLayers();

      map.addLayer({
        id: "field-fills",
        type: "fill",
        source: {
          type: "geojson",
          data: data()?.collection as any,
        },
        layout: {},
        paint: {
          "fill-color": "rgba(127,34,192,0.6)",
        },
      });

      map.addLayer({
        id: "field-outlines",
        type: "line",
        source: {
          type: "geojson",
          data: data()?.collection as any,
        },
        layout: {},
        paint: {
          "line-color": "rgba(255,255,255,0.5)",
          "line-width": 1,
        },
      });

      map.addLayer({
        id: "field-labels",
        type: "symbol",
        source: {
          type: "geojson",
          data: data()?.places as any,
        },
        layout: {
          "text-field": ["get", "description"],
          "text-justify": "center",
          "icon-image": ["concat", ["get", "icon"], "-15"],
          "text-size": 12,
        },
        paint: {
          "text-color": "white",
          "text-halo-color": "black",
          "text-halo-width": 1,
        },
      });
    }

    map.on("click", "field-labels", moveMapToField);
    map.on("click", "field-fills", navigateToField);
  }
  function navigateToField(e: any) {
    navigate({ to: `/parcels/${params().parcelId}/layers/${e.features[0].properties.id}` });
  }
  function moveMapToField(e: any) {
    e.clickOnLabel = true;
    getMap().flyTo({
      speed: 2,
      center: e.features[0].geometry.coordinates,
      zoom: 15,
    });
  }

  onMount(() => {
    if (getMap().isStyleLoaded()) {
      drawFields();
    } else {
      getMap().on("load", () => {
        drawFields();
      });
    }
  });

  createEffect(() => {
    const parcelData = data()?.parcel;
    if (parcelData && (parcelData as any)?._id === params().parcelId && getMap()?.isStyleLoaded()) {
      drawFields();
    }
  });

  async function handleDeleteField(e: SubmitEvent) {
    e.preventDefault();
    await fetch(`${import.meta.env.VITE_BACKEND_URL}/layers/${activeField()}`, {
      body: "",
      method: "delete",
      ...apiFetchOptions(),
    });

    setActiveField(undefined);
    await refetch();
    drawFields();
  }

  const [deleteFieldModalOpen, setDeleteFieldModalOpen] = createSignal(false);

  const [newFieldModalOpen, setNewFieldModalOpen] = createSignal(false);

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

      <Dialog
        open={createScenarioModalOpen()}
        onOpenChange={(open) => {
          setCreateScenarioModalOpen(open);
          if (!open) {
            setIsCreatingScenario(false);
            setNewScenarioName("");
            setNewScenarioDescription("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Farm Planting Plan</DialogTitle>
            <DialogDescription>
              Give the scenario a name and optional description. All current fields will be included
              by default.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateScenario} class="space-y-4">
            <div>
              <label class="block text-sm font-semibold text-gray-200" for="scenario-name">
                Scenario name
              </label>
              <input
                id="scenario-name"
                type="text"
                autocomplete="off"
                value={newScenarioName()}
                onInput={(event) => setNewScenarioName(event.currentTarget.value)}
                class="mt-1 w-full rounded-md border border-gray-600 bg-gray-900/70 p-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Spring planting plan"
              />
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-200" for="scenario-description">
                Description (optional)
              </label>
              <textarea
                id="scenario-description"
                rows={4}
                value={newScenarioDescription()}
                onInput={(event) => setNewScenarioDescription(event.currentTarget.value)}
                class="mt-1 w-full rounded-md border border-gray-600 bg-gray-900/70 p-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add any notes about this scenario"
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                class="rounded-sm p-2 btn-default"
                onClick={() => setCreateScenarioModalOpen(false)}
                disabled={isCreatingScenario()}
              >
                Cancel
              </button>
              <button
                type="submit"
                class="rounded-sm p-2 ml-2 btn-primary bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70"
                disabled={isCreatingScenario()}
              >
                {isCreatingScenario() ? "Creating..." : "Create scenario"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteScenarioModalOpen()} onOpenChange={setDeleteScenarioModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm deletion of farm planting plan</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            <p>
              When you delete this farm planting plan, all information connected to it will be
              permanently deleted and it will not be able to be restored.
            </p>
          </DialogDescription>
          <DialogFooter>
            <button class="rounded-sm p-2 btn-danger" onClick={handleDeleteScenario}>
              Delete scenario
            </button>
            <button
              class="rounded-sm p-2 ml-2 btn-default"
              onClick={() => {
                setDeleteScenarioModalOpen(false);
                setScenarioToDelete(undefined);
              }}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div class="fixed right-2.5 bottom-2.5 z-10 w-[300px] rounded-[10px] bg-black/85 p-2.5 text-white">
        <div class="space-y-2">
          <div class="overflow-hidden rounded-lg border border-white/10 bg-white/5">
            <button
              type="button"
              class="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              onClick={() =>
                setActiveListingPanel((current) => (current === "fields" ? null : "fields"))
              }
              aria-expanded={activeListingPanel() === "fields"}
            >
              <span>Fields</span>
              <i
                class="fa-solid fa-chevron-down transition-transform"
                classList={{ "rotate-180": activeListingPanel() === "fields" }}
              />
            </button>
            <div
              class="accordion-section"
              classList={{
                "accordion-open": activeListingPanel() === "fields",
              }}
            >
              <div class="space-y-3 border-t border-white/10 bg-black/20 p-3">
                <div
                  class="list-group rounded-md"
                  style={{
                    "max-height": "45vh",
                    "overflow-y": "auto",
                  }}
                >
                  <For each={data()?.parcel.layers}>
                    {(layer) => (
                      <div class="list-group-item list-group-item-action list-group-item-primary overlay-list-div">
                        <Link
                          class="overlay-list-link"
                          to={`/parcels/${params().parcelId}/layers/${layer._id}`}
                        >
                          {layer.name}
                        </Link>
                        <div>
                          <button
                            title="Edit field"
                            class={
                              "rounded-sm p-1 my-2 btn-default menu-btn list-group-button rounded-sm"
                            }
                            onClick={() => {
                              cleanupLayers();

                              getMap().flyTo({
                                speed: 2,
                                center: JSON.parse(layer.geometry).geometry.coordinates[0][0],
                                zoom: 15,
                              });

                              editField(layer);
                            }}
                          >
                            <i class="fa-solid fa-pen" />
                          </button>

                          <button
                            title="Show field on map"
                            type="button"
                            class={
                              "rounded-sm p-1 my-2 btn-default menu-btn list-group-button rounded-sm"
                            }
                            onClick={() => {
                              getMap().flyTo({
                                speed: 2,
                                center: JSON.parse(layer.geometry).geometry.coordinates[0][0],
                                zoom: 15,
                              });
                            }}
                          >
                            <i class="fa-solid fa-crosshairs" />
                          </button>
                          <button
                            title="Delete field"
                            type="button"
                            class={
                              "rounded-sm p-1 my-1 btn-danger menu-btn list-group-button rounded-sm"
                            }
                            onclick={() => {
                              setDeleteFieldModalOpen(true);
                              setActiveField(layer._id.toString());
                            }}
                          >
                            <i class="fa-solid fa-trash" />
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
                <button
                  type="button"
                  class="w-full rounded-sm bg-blue-600 p-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  onClick={() => addField()}
                >
                  Add new field
                </button>
              </div>
            </div>
          </div>
          <Show when={data()?.parcel.layers && data()!.parcel.layers.length > 0}>
            <div class="overflow-hidden rounded-lg border border-white/10 bg-white/5">
              <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                onClick={() =>
                  setActiveListingPanel((current) => (current === "scenarios" ? null : "scenarios"))
                }
                aria-expanded={activeListingPanel() === "scenarios"}
              >
                <span>Farm Planting Plan</span>
                <i
                  class="fa-solid fa-chevron-down transition-transform"
                  classList={{
                    "rotate-180": activeListingPanel() === "scenarios",
                  }}
                />
              </button>
              <div
                class="accordion-section"
                classList={{
                  "accordion-open": activeListingPanel() === "scenarios",
                }}
              >
                <div class="space-y-3 border-t border-white/10 bg-black/20 p-3">
                  <button
                    type="button"
                    class="w-full rounded-sm bg-blue-600 p-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                    onClick={openCreateScenarioModal}
                  >
                    <i class="fa-solid fa-plus mr-1" /> Create scenario
                  </button>
                  <Show
                    when={!farmConfigs.loading}
                    fallback={<div class="text-sm text-gray-300">Loading scenarios...</div>}
                  >
                    <Show
                      when={farmConfigs() && farmConfigs()!.length > 0}
                      fallback={<div class="text-sm text-gray-300">No scenarios yet.</div>}
                    >
                      <div
                        class="list-group rounded-md"
                        style={{
                          "max-height": "45vh",
                          "overflow-y": "auto",
                        }}
                      >
                        <For each={farmConfigs()}>
                          {(config: any) => (
                            <div class="list-group-item list-group-item-action list-group-item-primary overlay-list-div">
                              <Link
                                class="overlay-list-link"
                                to={`/parcels/${params().parcelId}/farm-scenario/${config._id}`}
                              >
                                {config.name || "Unnamed scenario"}
                              </Link>
                              <div>
                                <button
                                  title="Edit scenario"
                                  class="rounded-sm p-1 my-2 btn-default menu-btn list-group-button rounded-sm"
                                  onClick={() =>
                                    navigate({
                                      to: `/parcels/${params().parcelId}/farm-scenario/${config._id}`,
                                    })
                                  }
                                >
                                  <i class="fa-solid fa-pen" />
                                </button>
                                <button
                                  class="rounded-sm p-1 my-1 btn-danger menu-btn list-group-button rounded-sm"
                                  title="Delete scenario"
                                  onclick={() => {
                                    setScenarioToDelete(config._id);
                                    setDeleteScenarioModalOpen(true);
                                  }}
                                >
                                  <i class="fa-solid fa-trash" />
                                </button>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </div>
              </div>
            </div>
          </Show>

          {/* Financial Models Section - only show when there are planting plans */}
          {/* TEMPORARILY HIDDEN
          <Show when={false && farmConfigs() && farmConfigs()!.length > 0}>
            <div class="overflow-hidden rounded-lg border border-white/10 bg-white/5">
              <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                onClick={() =>
                  setActiveListingPanel((current) => (current === "models" ? null : "models"))
                }
                aria-expanded={activeListingPanel() === "models"}
              >
                <span>Financial Models</span>
                <i
                  class="fa-solid fa-chevron-down transition-transform"
                  classList={{
                    "rotate-180": activeListingPanel() === "models",
                  }}
                />
              </button>
              <div
                class="accordion-section"
                classList={{
                  "accordion-open": activeListingPanel() === "models",
                }}
              >
                <div class="space-y-3 border-t border-white/10 bg-black/20 p-3">
                  <button
                    type="button"
                    onClick={() => setCreateModelModalOpen(true)}
                    class="block w-full rounded-sm bg-green-600 p-2 text-center text-sm font-semibold text-white transition hover:bg-green-700"
                  >
                    <i class="fa-solid fa-plus mr-1" /> Create Model
                  </button>
                  <Show
                    when={!financialModels.loading}
                    fallback={<div class="text-sm text-gray-300">Loading models...</div>}
                  >
                    <Show
                      when={financialModels() && financialModels()!.length > 0}
                      fallback={<div class="text-sm text-gray-300">No financial models yet.</div>}
                    >
                      <div
                        class="list-group rounded-md"
                        style={{
                          "max-height": "30vh",
                          "overflow-y": "auto",
                        }}
                      >
                        <For each={financialModels()}>
                          {(model: any) => (
                            <div class="list-group-item list-group-item-action list-group-item-primary overlay-list-div">
                              <Link
                                class="overlay-list-link"
                                to={`/parcels/${params().parcelId}/models/${model._id}`}
                              >
                                <div>{model.name}</div>
                                <div class="text-xs text-gray-400">{model.planName}</div>
                              </Link>
                              <div class="flex gap-1">
                                <button
                                  title="Open model"
                                  class="rounded-sm p-1 my-2 btn-default menu-btn list-group-button"
                                  onClick={() =>
                                    navigate({ to: `/parcels/${params().parcelId}/models/${model._id}` })
                                  }
                                >
                                  <i class="fa-solid fa-chart-line" />
                                </button>
                                <button
                                  title="Delete model"
                                  class="rounded-sm p-1 my-2 btn-default menu-btn list-group-button text-red-400 hover:text-red-300"
                                  onClick={() => handleDeleteFinancialModel(model._id)}
                                >
                                  <i class="fa-solid fa-trash" />
                                </button>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </div>
              </div>
            </div>
          </Show>
          */}
        </div>
      </div>

      {/* Create Financial Model Modal */}
      <CreateFinancialModelModal
        isOpen={() => createModelModalOpen()}
        onOpenChange={setCreateModelModalOpen}
        plantingPlans={() => farmConfigs()?.map((c) => ({ _id: c._id as string, name: c.name }))}
        onCreated={handleModelCreated}
      />
    </>
  );
}
