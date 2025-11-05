
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

			<div
			class="bg-customdark1"
				style={{
					"border-radius": "10px",
					position: "fixed",
					"z-index": 10,
					
					right: "10px",
					bottom: "10px",
					padding: "10px",
				}}
			>
				<strong class="text-white">
					<span>Fields</span>
				</strong>
				<div
					class="list-group rounded-md"
					style={{
						"max-height": "500px",
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
											console.log(
												"JSON.parse(layer.geometry)",
												JSON.parse(layer.geometry),
											);

											// Go to location of layer
											getMap().flyTo({
												speed: 2,
												center: JSON.parse(layer.geometry).geometry
													.coordinates[0][0],
												zoom: 15,
											});

											// setCoordinates([Number(parcel.lng), Number(parcel.lat)]);
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
					class="rounded-sm p-1 mt-2 btn-default w-full"
					onClick={() => addField()}
				>
					Add new field
				</button>
			</div>
		</>
	);
}

export default DefaultMode;
