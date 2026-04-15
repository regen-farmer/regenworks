import { useParams, createFileRoute } from "@tanstack/solid-router";
import { type Component, createResource, Show } from "solid-js";
import { FarmFinancialsTab } from "~/components/farm-financials/FarmFinancialsTab";
import { getFinancialModel } from "~/util/api/financialModel";

const ModelDetail: Component = () => {
  const params = useParams({ strict: false });

  // Fetch the model to get its associated config
  const [modelData] = createResource(
    () => params().modelId,
    async (modelId) => {
      if (!modelId) return null;
      try {
        return await getFinancialModel(modelId);
      } catch (error) {
        console.error("Error fetching financial model:", error);
        return null;
      }
    },
  );

  const configId = () => {
    const data = modelData();
    if (!data?.model) return null;
    return typeof data.model.farmScenarioConfig === "string"
      ? data.model.farmScenarioConfig
      : (data.model.farmScenarioConfig as any)?.toString();
  };

  return (
    <div
      class="h-full bg-neutral-100 dark:bg-neutral-900"
      style={{ height: "calc(100vh - var(--app-nav-height, 3.5rem))" }}
    >
      <Show
        when={configId()}
        fallback={
          <div class="flex items-center justify-center h-full text-gray-500">
            <Show when={modelData.loading}>Loading...</Show>
            <Show when={!modelData.loading && !configId()}>
              Model not found or invalid configuration
            </Show>
          </div>
        }
      >
        <FarmFinancialsTab configId={configId()!} />
      </Show>
    </div>
  );
};

export const Route = createFileRoute("/parcels/$parcelId/models/$modelId/")({
  component: ModelDetail,
});
