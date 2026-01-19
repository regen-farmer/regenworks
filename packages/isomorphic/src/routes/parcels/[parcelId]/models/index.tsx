import { A, useNavigate, useParams } from "@solidjs/router";
import {
	type Component,
	createResource,
	createSignal,
	For,
	Show,
} from "solid-js";
import { Button } from "~/components/ui/button";
import { showToast } from "~/components/ui/toast";
import { getFarmScenarioConfigs } from "~/util/api/farmScenarioConfig";
import {
	createFinancialModel,
	deleteFinancialModel,
	getFinancialModels,
} from "~/util/api/financialModel";

const ModelsIndex: Component = () => {
	const params = useParams<{ parcelId: string }>();
	const navigate = useNavigate();
	const [isCreating, setIsCreating] = createSignal(false);
	const [selectedPlanId, setSelectedPlanId] = createSignal<string>("");
	const [newModelName, setNewModelName] = createSignal("New Financial Model");

	// Fetch farm planting plans for this parcel
	const [plantingPlans, { refetch: refetchPlans }] = createResource(
		() => params.parcelId,
		async (parcelId) => {
			try {
				return await getFarmScenarioConfigs(parcelId);
			} catch (error) {
				console.error("Failed to fetch planting plans:", error);
				return [];
			}
		},
	);

	// Fetch all financial models for all planting plans
	const [allModels, { refetch: refetchModels }] = createResource(
		() => plantingPlans(),
		async (plans) => {
			if (!plans || plans.length === 0) return [];

			try {
				const modelPromises = plans.map(async (plan) => {
					const models = await getFinancialModels(plan._id as string);
					return models.map((m) => ({
						...m,
						planName: plan.name || "Unnamed Plan",
						planId: plan._id as string,
					}));
				});

				const results = await Promise.all(modelPromises);
				return results.flat();
			} catch (error) {
				console.error("Failed to fetch models:", error);
				return [];
			}
		},
	);

	const handleCreateModel = async () => {
		if (!selectedPlanId()) {
			showToast({
				title: "Select a planting plan",
				description: "Please select a planting plan to create a model for.",
				variant: "error",
			});
			return;
		}

		setIsCreating(true);
		try {
			const result = await createFinancialModel(selectedPlanId(), {
				name: newModelName(),
			});

			await refetchModels();
			setNewModelName("New Financial Model");
			setSelectedPlanId("");

			showToast({
				title: "Model created",
				description: "Financial model created successfully.",
				variant: "success",
			});

			// Navigate to the new model
			navigate(`/parcels/${params.parcelId}/models/${result.model._id}`);
		} catch (error: any) {
			showToast({
				title: "Failed to create model",
				description: error.message || "An error occurred.",
				variant: "error",
			});
		} finally {
			setIsCreating(false);
		}
	};

	const handleDeleteModel = async (modelId: string) => {
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

	return (
		<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
			{/* Header */}
			<div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
				<div class="flex items-center justify-between">
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
								Financial Models
							</h1>
							<p class="text-sm text-gray-500 dark:text-gray-400">
								Create and manage financial models for your planting plans
							</p>
						</div>
					</div>
				</div>
			</div>

			<div class="p-6 max-w-4xl mx-auto">
				{/* Create New Model */}
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						Create New Model
					</h2>

					<Show
						when={plantingPlans() && plantingPlans()!.length > 0}
						fallback={
							<div class="text-gray-500 dark:text-gray-400">
								<p>
									No planting plans found. Create a planting plan first to build
									a financial model.
								</p>
								<A
									href={`/parcels/${params.parcelId}`}
									class="text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-2 inline-block"
								>
									Go to farm view
								</A>
							</div>
						}
					>
						<div class="space-y-4">
							<div>
								<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Based on Planting Plan
								</label>
								<select
									value={selectedPlanId()}
									onChange={(e) => setSelectedPlanId(e.currentTarget.value)}
									class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
								>
									<option value="">Select a planting plan...</option>
									<For each={plantingPlans()}>
										{(plan) => (
											<option value={plan._id as string}>
												{plan.name || "Unnamed Plan"}
											</option>
										)}
									</For>
								</select>
							</div>

							<div>
								<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Model Name
								</label>
								<input
									type="text"
									value={newModelName()}
									onInput={(e) => setNewModelName(e.currentTarget.value)}
									placeholder="Enter model name"
									class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
								/>
							</div>

							<Button
								onClick={handleCreateModel}
								disabled={
									isCreating() || !selectedPlanId() || !newModelName().trim()
								}
							>
								{isCreating() ? "Creating..." : "Create Financial Model"}
							</Button>
						</div>
					</Show>
				</div>

				{/* Existing Models */}
				<div class="bg-white dark:bg-gray-800 rounded-lg shadow">
					<div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
							Your Financial Models
						</h2>
					</div>

					<Show
						when={allModels() && allModels()!.length > 0}
						fallback={
							<div class="p-6 text-center text-gray-500 dark:text-gray-400">
								No financial models yet. Create one above to get started.
							</div>
						}
					>
						<div class="divide-y divide-gray-200 dark:divide-gray-700">
							<For each={allModels()}>
								{(model) => (
									<div class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50">
										<div class="flex-1">
											<A
												href={`/parcels/${params.parcelId}/models/${model._id}`}
												class="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
											>
												{model.name}
											</A>
											<p class="text-sm text-gray-500 dark:text-gray-400">
												Based on: {(model as any).planName}
											</p>
										</div>
										<div class="flex items-center gap-2">
											<A
												href={`/parcels/${params.parcelId}/models/${model._id}`}
												class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
											>
												Open
											</A>
											<button
												onClick={() => handleDeleteModel(model._id as string)}
												class="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
											>
												Delete
											</button>
										</div>
									</div>
								)}
							</For>
						</div>
					</Show>
				</div>
			</div>
		</div>
	);
};

export default ModelsIndex;
