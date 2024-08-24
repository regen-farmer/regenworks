import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	For,
	Show,
} from "solid-js";
import maplibregl from "maplibre-gl";
import type { LayerDocument } from "@rw/db/schemas/layer";
import { action, useLocation } from "@solidjs/router";
import { A, useParams } from "@solidjs/router";
import { getMongoDBUser } from "~/auth/useAuth.tsx";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import { useNavigate } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { CreateNewScenarioModal } from "~/components/CreateNewScenarioModal.tsx";
import { GoogleSatStyle } from "~/util/map_styles/google-sat-style.ts";
import DuplicateScenarioModal from "~/components/DuplicateScenarioModal.tsx";
import { useMeasureControl } from "~/util/map_controls/useMeasureControl.ts";

export default function view() {
	const params = useParams<{ layerId: string; parcelId: string }>();
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
			`${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}`,
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

	const deleteForm = action(async (formData: FormData) => {
		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}`,
			{
				body: "",
				method: "delete",
				...apiFetchOptions(),
			},
		);
		navigate(`/parcels/${params.parcelId}`);
	});

	const [mapContainer, setMapContainer] = createSignal<HTMLDivElement>();

	createEffect(() => {
		// console.log('mapcontainer', mapContainer(), 'data', data())
		if (data() && mapContainer()) {
			const areaLat = data()?.layer.lat;
			const areaLng = data()?.layer.lng;
			const escapedGeometry = data()?.layer.geometry;

			const correctgeometry = JSON.parse(escapedGeometry!);

			const map = new maplibregl.Map({
				//@ts-ignore
				container: "layerMapShow",
				attributionControl: false,
				style: GoogleSatStyle,
				center: [areaLng!, areaLat!],
				zoom: 15,
				maxZoom: 20,
			});

			map.on("load", () => {
				useMeasureControl(map);

				// map.addControl(new maplibregl.FullscreenControl({}));

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
		}
	});

	function deleteSystem(system: SystemDocument): () => void {
		return async () => {
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/parcels/${
					params.parcelId
				}/layers/${params.layerId}/systems/${system._id}`,
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

	return (
		<>
			<div
				class="modal fade"
				id="deleteFieldModal"
				tabindex="-1"
				aria-labelledby="deleteFieldModalLabel"
				aria-hidden="true"
			>
				<div class="modal-dialog">
					<div class="modal-content">
						<div class="modal-header">
							<h1 class="h1 modal-title" id="deleteFieldModalLabel">
								Confirm deletion of field
							</h1>
						</div>
						<div class="modal-body">
							<p>
								When you delete your field, all information connected to it like
								saved systems, projects and budgets will be permanently deleted
								and it will not be able to be restored.
							</p>
						</div>
						<div class="modal-footer">
							<form action={deleteForm} method="post" class="delete-form">
								<button class="rounded-sm p-1 m-1 btn-danger" data-bs-dismiss="modal">
									Delete field
								</button>
							</form>
							<button class="rounded-sm p-1 m-1 btn-default" data-bs-dismiss="modal">
								Cancel
							</button>
						</div>
					</div>
				</div>
			</div>

			<DuplicateScenarioModal
				activeScenario={activeScenario}
				modalOpen={modal2Open}
				setModalOpen={setModal2Open}
				refetchScenarios={refetch}
			/>

			<div>
				<Show when={data()}>
					<div id="layerMapShow" ref={setMapContainer} />

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
							<div class="list-group">
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
													<A
														href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${project._id}`}
														class={"overlay-list-link"}
													>
														{/* <div
																	style={{
																		display: "inline-block",
																		"min-width": "120px",
																	}}
																>
																	<span
																		class={`badge ${status[2]} rounded-pill`}
																	>
																		{status[1]}
																	</span>
																</div> */}

														<span>{project.name}</span>
													</A>

													<button
														title="Duplicate scenario"
														class={"rounded-sm p-1 m-1 btn-default menu-btn list-group-button rounded-sm"}
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
								<button class="rounded-sm p-1 m-1 btn-default">Create new scenario</button>
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
							Area size:{" "}
							{data()?.layer.size! > 5000
								? `${(data()?.layer.size! * 0.0001)
										.toFixed(2)
										.replace(".", ",")} ha`
								: `${data()?.layer.size.toFixed(0).replace(".", ",")} m2`}
						</p>

						<p>{data()?.layer.description ?? ""}</p>
						<hr />
						<Show
							when={
								getMongoDBUser() &&
								data()?.layer.owner.id === getMongoDBUser()._id
							}
						>
							<>
								<A
									class="rounded-sm p-1 m-1 btn-default"
									href={`/parcels/${params.parcelId}/layers/${
										data()?.layer._id
									}/edit`}
								>
									Edit field details
								</A>
								<button
									class="rounded-sm p-1 m-1 btn-danger"
									// onClick={() => setShowDeleteFieldModal(true)}
									data-bs-toggle="modal"
									data-bs-target="#deleteFieldModal"
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
