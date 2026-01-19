import { A, useParams } from "@solidjs/router";
import { type Component, createResource, Show } from "solid-js";
import { FarmFinancialsTab } from "~/components/farm-financials/FarmFinancialsTab";
import { getFinancialModel } from "~/util/api/financialModel";

const ModelDetail: Component = () => {
	const params = useParams<{ parcelId: string; modelId: string }>();

	// Fetch the model to get its associated config
	const [modelData] = createResource(
		() => params.modelId,
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
			class="h-full flex flex-col"
			style={{ height: "calc(100vh - var(--app-nav-height, 3.5rem))" }}
		>
			{/* Header */}
			<div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
				<div class="flex items-center gap-4">
					<A
						href={`/parcels/${params.parcelId}`}
						class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
								clip-rule="evenodd"
							/>
						</svg>
					</A>
					<div>
						<h1 class="text-xl font-bold text-gray-900 dark:text-white">
							{modelData()?.model?.name || "Financial Model"}
						</h1>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							Financial model analysis
						</p>
					</div>
				</div>
			</div>

			{/* Main content */}
			<div class="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-800">
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
		</div>
	);
};

export default ModelDetail;
