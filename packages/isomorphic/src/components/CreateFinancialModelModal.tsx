import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { showToast } from "~/components/ui/toast";
import { createFinancialModel } from "~/util/api/financialModel";

type PlantingPlan = {
	_id: string;
	name?: string;
};

type CreateFinancialModelModalProps = {
	isOpen: () => boolean;
	onOpenChange: (open: boolean) => void;
	plantingPlans: () => PlantingPlan[] | undefined;
	onCreated: (modelId: string) => void;
};

export function CreateFinancialModelModal({
	isOpen,
	onOpenChange,
	plantingPlans,
	onCreated,
}: CreateFinancialModelModalProps) {
	const [selectedPlanId, setSelectedPlanId] = createSignal<string>("");
	const [modelName, setModelName] = createSignal("");
	const [isCreating, setIsCreating] = createSignal(false);

	const handleCreate = async () => {
		if (!selectedPlanId()) {
			showToast({
				title: "Select a planting plan",
				description: "Please select a planting plan to create a model for.",
				variant: "error",
			});
			return;
		}

		if (!modelName().trim()) {
			showToast({
				title: "Name required",
				description: "Please enter a name for the model.",
				variant: "error",
			});
			return;
		}

		setIsCreating(true);
		try {
			const result = await createFinancialModel(selectedPlanId(), {
				name: modelName(),
			});

			showToast({
				title: "Model created",
				description: "Financial model created successfully.",
				variant: "success",
			});

			// Reset form
			setSelectedPlanId("");
			setModelName("");
			onOpenChange(false);
			onCreated(result.model._id as string);
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

	return (
		<Dialog open={isOpen()} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Financial Model</DialogTitle>
				</DialogHeader>
				<DialogDescription>
					<Show
						when={plantingPlans() && plantingPlans()!.length > 0}
						fallback={
							<div class="text-gray-500 dark:text-gray-400 py-4">
								No planting plans found. Create a planting plan first to build a
								financial model.
							</div>
						}
					>
						<div class="space-y-4 py-2">
							<div>
								<label
									for="financial-model-plan"
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>
									Based on Planting Plan
								</label>
								<select
									id="financial-model-plan"
									value={selectedPlanId()}
									onChange={(e) => setSelectedPlanId(e.currentTarget.value)}
									class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
								>
									<option value="">Select a planting plan...</option>
									<For each={plantingPlans()}>
										{(plan) => (
											<option value={plan._id}>
												{plan.name || "Unnamed Plan"}
											</option>
										)}
									</For>
								</select>
							</div>

							<div>
								<label
									for="financial-model-name"
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
								>
									Model Name
								</label>
								<input
									id="financial-model-name"
									type="text"
									value={modelName()}
									onInput={(e) => setModelName(e.currentTarget.value)}
									placeholder="New Financial Model"
									class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
								/>
							</div>
						</div>
					</Show>
				</DialogDescription>
				<DialogFooter>
					<Button
						onClick={() => onOpenChange(false)}
						class="bg-gray-500 hover:bg-gray-600"
					>
						Cancel
					</Button>
					<Show when={plantingPlans() && plantingPlans()!.length > 0}>
						<Button
							onClick={handleCreate}
							disabled={
								isCreating() || !selectedPlanId() || !modelName().trim()
							}
						>
							{isCreating() ? "Creating..." : "Create Model"}
						</Button>
					</Show>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default CreateFinancialModelModal;
