import Chart from "chart.js/auto";
import {
	type Component,
	createEffect,
	createMemo,
	createResource,
	createSignal,
	For,
	Show,
} from "solid-js";
import { Button } from "~/components/ui/button";
import { showToast } from "~/components/ui/toast";
import {
	type AggregatedSpecies,
	exportFinancialModelCSV,
	getAggregatedSpecies,
	getFinancialModel,
	getFinancialModels,
	updateFinancialModel,
} from "~/util/api/financialModel";
import { useDarkMode } from "~/util/useDarkMode";

interface FarmFinancialsTabProps {
	configId: string;
}

export const FarmFinancialsTab: Component<FarmFinancialsTabProps> = (props) => {
	// State
	const [selectedModelId, setSelectedModelId] = createSignal<string | null>(
		null,
	);
	const [isSaving, setIsSaving] = createSignal(false);

	// Local editable state for parameters and species pricing
	const [localPeriod, setLocalPeriod] = createSignal(20);
	const [localCurrency, setLocalCurrency] = createSignal("EUR");
	const [localIncome, setLocalIncome] = createSignal<Map<string, number>>(
		new Map(),
	);
	const [localEstablishmentCost, setLocalEstablishmentCost] = createSignal<
		Map<string, number | undefined>
	>(new Map());
	const [localManagementCost, setLocalManagementCost] = createSignal<
		Map<string, number | undefined>
	>(new Map());
	const [hasUnsavedChanges, setHasUnsavedChanges] = createSignal(false);

	// Track dark mode for chart colors
	const isDarkMode = useDarkMode();

	// Fetch models for this config
	const [models, { refetch: refetchModels }] = createResource(
		() => props.configId,
		async (configId) => {
			try {
				return await getFinancialModels(configId);
			} catch (error) {
				console.error("Failed to fetch financial models:", error);
				return [];
			}
		},
	);

	// Fetch aggregated species (for showing species when no model exists yet)
	const [aggregatedSpecies] = createResource(
		() => props.configId,
		async (configId) => {
			try {
				return await getAggregatedSpecies(configId);
			} catch (error) {
				console.error("Failed to fetch aggregated species:", error);
				return [];
			}
		},
	);

	// Fetch selected model with financials
	const [modelData, { refetch: refetchModel }] = createResource(
		() => selectedModelId(),
		async (modelId) => {
			if (!modelId) return null;
			try {
				return await getFinancialModel(modelId);
			} catch (error) {
				console.error("Failed to fetch financial model:", error);
				return null;
			}
		},
	);

	// Auto-select first model when models load
	createEffect(() => {
		const modelsList = models();
		if (modelsList && modelsList.length > 0 && !selectedModelId()) {
			setSelectedModelId(modelsList[0]._id as string);
		}
	});

	// Sync local state when model data loads
	createEffect(() => {
		const data = modelData();
		if (data?.model) {
			setLocalPeriod(data.model.parameters?.period || 20);
			setLocalCurrency(data.model.parameters?.currency || "EUR");

			// Build pricing maps from saved speciesPricing
			const incomeMap = new Map<string, number>();
			const establishmentCostMap = new Map<string, number | undefined>();
			const managementCostMap = new Map<string, number | undefined>();

			if (data.model.speciesPricing) {
				for (const p of data.model.speciesPricing) {
					const speciesId =
						typeof p.species === "string"
							? p.species
							: (p.species as any)?.toString();
					if (speciesId) {
						incomeMap.set(speciesId, (p as any).incomePerTree || 0);
						establishmentCostMap.set(
							speciesId,
							(p as any).establishmentCostPerTree,
						);
						managementCostMap.set(
							speciesId,
							(p as any).managementCostPerTreePerYear,
						);
					}
				}
			}

			// Also add species from financials that aren't in speciesPricing yet
			// This ensures newly added species to the layout are included
			if (data.financials?.speciesSummary) {
				for (const entry of data.financials.speciesSummary) {
					const speciesId = entry.species._id;
					if (!incomeMap.has(speciesId)) {
						incomeMap.set(speciesId, 0);
					}
				}
			}

			setLocalIncome(incomeMap);
			setLocalEstablishmentCost(establishmentCostMap);
			setLocalManagementCost(managementCostMap);
			setHasUnsavedChanges(false);
		}
	});

	// Chart reference - single canvas, recreated on theme change
	let chartCanvas: HTMLCanvasElement | undefined;
	let chartInstance: Chart | null = null;

	// Helper to create chart
	const createCashFlowChart = (
		canvas: HTMLCanvasElement,
		cashFlow: {
			year: number;
			income: number;
			costs: number;
			cumulative: number;
		}[],
		darkMode: boolean,
	) => {
		const labels = cashFlow.map((cf) => `Year ${cf.year}`);
		const cumulativeData = cashFlow.map((cf) => cf.cumulative);
		const textColor = darkMode ? "#ffffff" : "#1f2937";
		const gridColor = darkMode
			? "rgba(255, 255, 255, 0.3)"
			: "rgba(0, 0, 0, 0.15)";

		const incomeFloatingData = cashFlow.map((cf) => [
			cf.cumulative,
			cf.cumulative + cf.income,
		]);
		const costsFloatingData = cashFlow.map((cf) => [
			cf.cumulative - cf.costs,
			cf.cumulative,
		]);

		return new Chart(canvas, {
			type: "bar",
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						labels: { color: textColor },
					},
					tooltip: {
						titleColor: textColor,
						bodyColor: textColor,
						callbacks: {
							label: (context: any) => {
								const datasetLabel = context.dataset.label;
								if (datasetLabel === "Income" || datasetLabel === "Costs") {
									const range = context.raw as [number, number];
									const value = Math.abs(range[1] - range[0]);
									return `${datasetLabel}: ${value.toLocaleString()}`;
								}
								const value = context.raw as number;
								return `${datasetLabel}: ${value.toLocaleString()}`;
							},
						},
					},
				},
				scales: {
					y: {
						stacked: false,
						ticks: { color: textColor },
						grid: { color: gridColor },
					},
					x: {
						stacked: true,
						ticks: { color: textColor },
						grid: { color: gridColor },
					},
				},
			},
			data: {
				labels,
				datasets: [
					{
						type: "bar",
						label: "Income",
						data: incomeFloatingData as any,
						backgroundColor: "rgba(34, 197, 94, 0.8)",
						borderColor: "rgba(34, 197, 94, 1)",
						borderWidth: 1,
						barPercentage: 0.15,
						categoryPercentage: 0.9,
						order: 2,
					},
					{
						type: "bar",
						label: "Costs",
						data: costsFloatingData as any,
						backgroundColor: "rgba(239, 68, 68, 0.8)",
						borderColor: "rgba(239, 68, 68, 1)",
						borderWidth: 1,
						barPercentage: 0.15,
						categoryPercentage: 0.9,
						order: 2,
					},
					{
						type: "line",
						label: "Cumulative",
						data: cumulativeData,
						borderColor: "rgb(34, 211, 238)",
						backgroundColor: "rgba(34, 211, 238, 0.15)",
						pointBackgroundColor: darkMode ? "#ffffff" : "#000000",
						pointBorderColor: "rgb(34, 211, 238)",
						pointBorderWidth: 2,
						borderWidth: 3,
						tension: 0.1,
						fill: true,
						order: 1,
					},
				],
			},
		});
	};

	// Update chart when data or theme changes
	createEffect(() => {
		const data = modelData();
		const darkMode = isDarkMode();

		if (!data?.financials || !chartCanvas) return;

		if (chartInstance) {
			chartInstance.destroy();
			chartInstance = null;
		}
		chartInstance = createCashFlowChart(
			chartCanvas,
			data.financials.cashFlow,
			darkMode,
		);
	});

	// Handlers
	const handleSaveChanges = async () => {
		const modelId = selectedModelId();
		if (!modelId) return;

		setIsSaving(true);
		try {
			// Build species pricing array with income and cost overrides
			const speciesPricing = Array.from(localIncome().entries()).map(
				([species, incomePerTree]) => ({
					species,
					incomePerTree,
					establishmentCostPerTree: localEstablishmentCost().get(species),
					managementCostPerTreePerYear: localManagementCost().get(species),
				}),
			);

			await updateFinancialModel(modelId, {
				parameters: {
					period: localPeriod(),
					currency: localCurrency(),
				},
				speciesPricing,
			});

			await refetchModel();
			setHasUnsavedChanges(false);

			showToast({
				title: "Changes saved",
				description: "Financial model updated successfully.",
				variant: "success",
			});
		} catch (error: any) {
			showToast({
				title: "Failed to save",
				description: error.message || "An error occurred.",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleExportCSV = async () => {
		const modelId = selectedModelId();
		if (!modelId) return;

		try {
			const blob = await exportFinancialModelCSV(modelId);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `financial-model.csv`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			showToast({
				title: "Export complete",
				description: "CSV file downloaded.",
				variant: "success",
			});
		} catch (error: any) {
			showToast({
				title: "Export failed",
				description: error.message || "An error occurred.",
				variant: "error",
			});
		}
	};

	const handleIncomeChange = (speciesId: string, value: number) => {
		setLocalIncome((prev) => {
			const next = new Map(prev);
			next.set(speciesId, value);
			return next;
		});
		setHasUnsavedChanges(true);
	};

	const handleEstablishmentCostChange = (
		speciesId: string,
		value: number | undefined,
	) => {
		setLocalEstablishmentCost((prev) => {
			const next = new Map(prev);
			next.set(speciesId, value);
			return next;
		});
		setHasUnsavedChanges(true);
	};

	const handleManagementCostChange = (
		speciesId: string,
		value: number | undefined,
	) => {
		setLocalManagementCost((prev) => {
			const next = new Map(prev);
			next.set(speciesId, value);
			return next;
		});
		setHasUnsavedChanges(true);
	};

	const handleParameterChange = () => {
		setHasUnsavedChanges(true);
	};

	// Get species data for display
	const speciesForDisplay = createMemo(() => {
		const data = modelData();
		if (data?.financials?.speciesSummary) {
			return data.financials.speciesSummary;
		}
		// Fall back to aggregated species if no model yet
		const agg = aggregatedSpecies();
		if (agg) {
			return agg.map((a) => ({
				species: a.species,
				count: a.count,
				incomePerTree: localIncome().get(a.species._id) || 0,
				establishmentCostPerTree: 0,
				managementCostPerTreePerYear: 0,
				defaultEstablishmentCostPerTree: 0,
				defaultManagementCostPerTreePerYear: 0,
				establishmentCost: 0,
				annualManagementCost: 0,
				annualIncomeAtMaturity: 0,
				totalIncomeOverPeriod: 0,
			}));
		}
		return [];
	});

	const financials = () => modelData()?.financials;
	const currency = () => localCurrency();

	const formatCurrency = (value: number) => {
		return `${currency()} ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
	};

	return (
		<div class="h-full overflow-y-auto p-4 space-y-6">
			{/* Model Title */}
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
					{"Financial Model: " + modelData()?.model?.name}
				</h2>
			</div>

			<Show
				when={selectedModelId()}
				fallback={
					<div class="flex items-center justify-center h-full text-gray-500">
						Loading...
					</div>
				}
			>
				{/* Parameters */}
				<div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4">
					<h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3">
						Parameters
					</h3>
					<div class="flex flex-wrap gap-4">
						<div>
							<span class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
								Period
							</span>
							<div class="flex items-center gap-1">
								<input
									type="number"
									value={localPeriod()}
									onInput={(e) => {
										setLocalPeriod(parseInt(e.currentTarget.value) || 20);
										handleParameterChange();
									}}
									class="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
									min="1"
									max="100"
									aria-label="Period in years"
								/>
								<span class="text-sm text-gray-500">years</span>
							</div>
						</div>
						<div>
							<span class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
								Currency
							</span>
							<select
								value={localCurrency()}
								onChange={(e) => {
									setLocalCurrency(e.currentTarget.value);
									handleParameterChange();
								}}
								class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
								aria-label="Currency"
							>
								<option value="EUR">EUR</option>
								<option value="USD">USD</option>
								<option value="GBP">GBP</option>
								<option value="DKK">DKK</option>
							</select>
						</div>
					</div>
				</div>

				{/* Species Economics */}
				<div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4">
					<h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3">
						Species Economics
					</h3>
					<p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
						Costs are calculated from species activities. Enter expected income
						per tree per year at maturity.
					</p>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-neutral-300 dark:border-neutral-600">
									<th class="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
										Species
									</th>
									<th class="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
										Trees
									</th>
									<th class="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
										<div>Establishment</div>
										<div>Cost/tree</div>
									</th>
									<th class="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
										<div>Management</div>
										<div>Cost/tree/yr</div>
									</th>
									<th class="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
										<div>Income</div>
										<div>/tree/yr</div>
									</th>
									<th class="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
										<div>Annual</div>
										<div>Income</div>
									</th>
								</tr>
							</thead>
							<tbody>
								<For each={speciesForDisplay()}>
									{(entry) => {
										const speciesId = entry.species._id;
										const incomePerTree =
											localIncome().get(speciesId) ?? entry.incomePerTree ?? 0;
										const annualIncome = entry.count * incomePerTree;

										// Get local overrides or use the calculated values from backend
										const localEstCost =
											localEstablishmentCost().get(speciesId);
										const localMgmtCost = localManagementCost().get(speciesId);

										// Display value: local override if set, otherwise backend value
										const estCostPerTree =
											localEstCost !== undefined
												? localEstCost
												: (entry.establishmentCostPerTree ?? 0);
										const mgmtCostPerTree =
											localMgmtCost !== undefined
												? localMgmtCost
												: (entry.managementCostPerTreePerYear ?? 0);

										// Defaults for placeholder
										const defaultEstCost =
											entry.defaultEstablishmentCostPerTree ?? 0;
										const defaultMgmtCost =
											entry.defaultManagementCostPerTreePerYear ?? 0;

										return (
											<tr class="border-b border-neutral-300 dark:border-neutral-600">
												<td class="py-2 px-2 text-gray-900 dark:text-gray-100">
													{entry.species.nameCommon || "Unknown"}
												</td>
												<td class="py-2 px-2 text-right text-gray-700 dark:text-gray-300">
													{entry.count.toLocaleString()}
												</td>
												<td class="py-2 px-2 text-right">
													<div class="flex items-center justify-end gap-1">
														<span class="text-gray-500">{currency()}</span>
														<input
															type="number"
															value={
																localEstCost !== undefined ? localEstCost : ""
															}
															placeholder={defaultEstCost.toString()}
															onInput={(e) => {
																const val = e.currentTarget.value;
																handleEstablishmentCostChange(
																	speciesId,
																	val === "" ? undefined : parseFloat(val) || 0,
																);
															}}
															class="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-right dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 placeholder:text-gray-400"
															min="0"
															step="1"
															aria-label={`Establishment cost per tree for ${entry.species.nameCommon || "species"}`}
														/>
													</div>
												</td>
												<td class="py-2 px-2 text-right">
													<div class="flex items-center justify-end gap-1">
														<span class="text-gray-500">{currency()}</span>
														<input
															type="number"
															value={
																localMgmtCost !== undefined ? localMgmtCost : ""
															}
															placeholder={defaultMgmtCost.toString()}
															onInput={(e) => {
																const val = e.currentTarget.value;
																handleManagementCostChange(
																	speciesId,
																	val === "" ? undefined : parseFloat(val) || 0,
																);
															}}
															class="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-right dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 placeholder:text-gray-400"
															min="0"
															step="1"
															aria-label={`Management cost per tree per year for ${entry.species.nameCommon || "species"}`}
														/>
													</div>
												</td>
												<td class="py-2 px-2 text-right">
													<div class="flex items-center justify-end gap-1">
														<span class="text-gray-500">{currency()}</span>
														<input
															type="number"
															value={incomePerTree}
															onInput={(e) =>
																handleIncomeChange(
																	speciesId,
																	parseFloat(e.currentTarget.value) || 0,
																)
															}
															class="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-right dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
															min="0"
															step="1"
															aria-label={`Income per tree for ${entry.species.nameCommon || "species"}`}
														/>
													</div>
												</td>
												<td class="py-2 px-2 text-right text-green-600 dark:text-green-400 font-medium">
													{formatCurrency(annualIncome)}
												</td>
											</tr>
										);
									}}
								</For>
							</tbody>
						</table>
					</div>
				</div>

				{/* Save Button */}
				<Show when={hasUnsavedChanges()}>
					<div class="flex justify-end">
						<Button
							onClick={handleSaveChanges}
							disabled={isSaving()}
							class="bg-blue-600 hover:bg-blue-700"
						>
							{isSaving() ? "Saving..." : "Save Changes"}
						</Button>
					</div>
				</Show>

				{/* Financial Summary */}
				<Show when={financials()}>
					{(fin) => (
						<>
							<div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4">
								<h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3">
									Summary ({fin().parameters.period} years)
								</h3>
								<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
									<div class="bg-white dark:bg-neutral-900 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
										<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
											Total Income
										</div>
										<div class="text-lg font-semibold text-green-600 dark:text-green-400">
											{formatCurrency(fin().summary.totalIncomeOverPeriod)}
										</div>
									</div>
									<div class="bg-white dark:bg-neutral-900 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
										<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
											Total Costs
										</div>
										<div class="text-lg font-semibold text-red-600 dark:text-red-400">
											{formatCurrency(fin().summary.totalCostsOverPeriod)}
										</div>
									</div>
									<div class="bg-white dark:bg-neutral-900 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
										<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
											Total Profit
										</div>
										<div
											class={`text-lg font-semibold ${fin().summary.totalProfitOverPeriod >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
										>
											{formatCurrency(fin().summary.totalProfitOverPeriod)}
										</div>
									</div>
								</div>
								<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
									<div class="bg-white dark:bg-neutral-900 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
										<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
											Establishment Cost
										</div>
										<div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
											{formatCurrency(fin().summary.totalEstablishmentCost)}
										</div>
									</div>
									<div class="bg-white dark:bg-neutral-900 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
										<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
											Annual Management
										</div>
										<div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
											{formatCurrency(fin().summary.totalAnnualManagementCost)}
										</div>
									</div>
									<div class="bg-white dark:bg-neutral-900 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
										<div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
											Annual Income
										</div>
										<div class="text-lg font-semibold text-green-600 dark:text-green-400">
											{formatCurrency(fin().summary.annualIncomeAtMaturity)}/yr
										</div>
									</div>
								</div>
							</div>

							{/* Cash Flow Chart */}
							<div class="bg-white dark:bg-neutral-900 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
								<h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3">
									Cumulative Cash Flow
								</h3>
								<div class="h-80">
									<canvas ref={chartCanvas} />
								</div>
							</div>

							{/* Field Breakdown */}
							<Show when={fin().fieldSummary.length > 0}>
								<div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4">
									<h3 class="font-semibold text-gray-700 dark:text-gray-300 mb-3">
										Field Breakdown
									</h3>
									<div class="overflow-x-auto">
										<table class="w-full text-sm">
											<thead>
												<tr class="border-b border-neutral-300 dark:border-neutral-600">
													<th class="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
														Field
													</th>
													<th class="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
														Area (ha)
													</th>
													<th class="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
														Trees
													</th>
													<th class="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
														Est. Cost
													</th>
													<th class="text-right py-2 px-2 font-medium text-gray-600 dark:text-gray-400">
														Annual Income
													</th>
												</tr>
											</thead>
											<tbody>
												<For each={fin().fieldSummary}>
													{(field) => (
														<tr class="border-b border-neutral-300 dark:border-neutral-600">
															<td class="py-2 px-2 text-gray-900 dark:text-gray-100">
																{field.field.name}
															</td>
															<td class="py-2 px-2 text-right text-gray-700 dark:text-gray-300">
																{field.area.toFixed(2)}
															</td>
															<td class="py-2 px-2 text-right text-gray-700 dark:text-gray-300">
																{field.treeCount.toLocaleString()}
															</td>
															<td class="py-2 px-2 text-right text-gray-700 dark:text-gray-300">
																{formatCurrency(field.establishmentCost)}
															</td>
															<td class="py-2 px-2 text-right text-green-600 dark:text-green-400">
																{formatCurrency(field.annualIncomeAtMaturity)}
															</td>
														</tr>
													)}
												</For>
											</tbody>
										</table>
									</div>
								</div>
							</Show>

							{/* Export */}
							<div class="flex justify-end">
								<Button
									onClick={handleExportCSV}
									class="bg-gray-600 hover:bg-gray-700"
								>
									Export CSV
								</Button>
							</div>
						</>
					)}
				</Show>
			</Show>
		</div>
	);
};

export default FarmFinancialsTab;
