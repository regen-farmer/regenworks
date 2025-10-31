
import { A, action, useNavigate, useParams } from "@solidjs/router";
import type { Map as MLMap } from "maplibre-gl";
import { createSignal, For, onMount, type Resource, createResource, Show } from "solid-js";

import type * as turf from "@turf/turf";
import type { IParcelSchema } from "@rw/db/schemas/parcel.ts";
import { removeLayers } from "~/util/removeLayers.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import {
	createFarmScenarioConfig,
	getFarmScenarioConfigs,
} from "~/util/api/farmScenarioConfig.ts";
import { showToast } from "~/components/ui/toast";
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

function DefaultMode({
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

	const [activeField, setActiveField] = createSignal<string | undefined>(
		undefined,
	);

	const navigate = useNavigate();
	
	// Fetch existing farm planting plan configurations
	const [farmConfigs, { refetch: refetchFarmConfigs }] = createResource(
		() => params.parcelId,
		async (parcelId) => {
			try {
				return await getFarmScenarioConfigs(parcelId);
			} catch (error) {
				console.error("Failed to fetch farm configs:", error);
				return [];
			}
		}
	);
	
	const [createScenarioModalOpen, setCreateScenarioModalOpen] = createSignal(false);
	const [newScenarioName, setNewScenarioName] = createSignal("");
	const [newScenarioDescription, setNewScenarioDescription] = createSignal("");
	const [isCreatingScenario, setIsCreatingScenario] = createSignal(false);
	const [activeListingPanel, setActiveListingPanel] = createSignal<"fields" | "scenarios" | null>("fields");

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
				parcel: params.parcelId,
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
				navigate(`/parcels/${params.parcelId}/farm-scenario/${created._id}`);
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

	function drawFields() {
		cleanupLayers();

		getMap().addLayer({
			id: "field-fills",
			type: "fill",
			//@ts-ignore
			source: {
				type: "geojson",
				data: data()?.collection,
			},
			layout: {},
			paint: {
				"fill-color": "rgba(127,34,192,0.6)",
			},
		});

		getMap().addLayer({
			id: "field-outlines",
			type: "line",
			//@ts-ignore
			source: {
				type: "geojson",
				data: data()?.collection,
			},
			layout: {},
			paint: {
				"line-color": "rgba(255,255,255,0.5)",
				"line-width": 1,
			},
		});

		getMap().addLayer({
			id: "field-labels",
			type: "symbol",
			//@ts-ignore
			source: {
				type: "geojson",
				data: data()?.places,
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

		getMap().on("click", "field-labels", moveMapToField);

		getMap().on("click", "field-fills", navigateToField);
	}
	function navigateToField(e: any) {
		navigate(
			`/parcels/${params.parcelId}/layers/${e.features[0].properties.id}`,
		);
	}
	function moveMapToField(e: any) {
		// navigate(`/parcels/${params.parcelId}/layers/${e.features[0].properties.id}`);
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

	const deleteForm = action(async (formData: FormData) => {
		await fetch(`${import.meta.env.VITE_BACKEND_URL}/layers/${activeField()}`, {
			body: "",
			method: "delete",
			...apiFetchOptions(),
		});

		setActiveField(undefined);
		await refetch();
		drawFields();
	});

	const [deleteFieldModalOpen, setDeleteFieldModalOpen] = createSignal(false);

	const [newFieldModalOpen, setNewFieldModalOpen] = createSignal(false);

	return (
		<>
			<Dialog
				open={deleteFieldModalOpen()}
				onOpenChange={setDeleteFieldModalOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle id="deleteFieldModalLabel">
							Confirm deletion of field
						</DialogTitle>
					</DialogHeader>
					<DialogDescription>
						<p>
							When you delete your field, all information connected to it like
							saved systems, projects and budgets will be permanently deleted
							and it will not be able to be restored.
						</p>
					</DialogDescription>
					<DialogFooter>
						<form action={deleteForm} method="post" class="delete-form">
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
							Give the scenario a name and optional description. All current fields will be included by default.
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

			<div
				class="bg-customdark1"
				style={{
					"border-radius": "10px",
					position: "fixed",
					"z-index": 10,
					right: "10px",
					bottom: "10px",
					padding: "10px",
					width: "300px",
				}}
			>
				<div class="space-y-2">
					<div class="overflow-hidden rounded-lg border border-white/10 bg-white/5">
						<button
							type="button"
							class="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
							onClick={() =>
								setActiveListingPanel((current) =>
									current === "fields" ? null : "fields",
								)
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
												<A
													class="overlay-list-link"
													href={`/parcels/${params.parcelId}/layers/${layer._id}`}
												>
													{layer.name}
												</A>
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
															center: JSON.parse(layer.geometry).geometry
																.coordinates[0][0],
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
															center: JSON.parse(layer.geometry).geometry
																.coordinates[0][0],
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
									class="w-full rounded-sm bg-white/10 p-2 text-sm font-semibold text-white transition hover:bg-white/20"
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
									setActiveListingPanel((current) =>
										current === "scenarios" ? null : "scenarios",
									)
							}
								aria-expanded={activeListingPanel() === "scenarios"}
							>
								<span>Farm Planting Plan</span>
								<i
									class="fa-solid fa-chevron-down transition-transform"
									classList={{ "rotate-180": activeListingPanel() === "scenarios" }}
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
														<div class="list-group-item list-group-item-action list-group-item-primary overlay-list-div py-2">
														<div class="flex w-full items-center gap-3 text-xs text-gray-100">
															<div
																class="text-sm font-semibold max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap"
																title={config.name || "Unnamed scenario"}
															>
																{config.name || "Unnamed scenario"}
															</div>
															<button
																class="ml-auto rounded-sm px-2 py-1 btn-default text-xs"
																	onClick={() => navigate(`/parcels/${params.parcelId}/farm-scenario/${config._id}`)}
																>
																	View
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
				</div>
			</div>
		</>
	);
}

export default DefaultMode;
