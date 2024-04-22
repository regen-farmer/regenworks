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
import { mongoDBDBUser } from "~/auth/useAuth";
import type { SystemDocument } from "@rw/db/schemas/system";
import type { SpeciesDocument } from "@rw/db/schemas/species";
import "maplibre-gl/dist/maplibre-gl.css";
import { useNavigate } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { Button } from "solid-bootstrap";
import { CreateNewScenarioModal } from "~/components/CreateNewScenarioModal";

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
	
	createMemo(()=>{
		refetch()
		return useLocation().pathname
	})

	const [modalOpen, setModalOpen] = createSignal(false);

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
				style: {
					version: 8,
					sources: {
						"raster-tiles": {
							type: "raster",
							tiles: [
								"https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
								"https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
								"https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
								"https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
							],
							tileSize: 256,
						},
					},
					layers: [
						{
							id: "simple-tiles",
							type: "raster",
							source: "raster-tiles",
							minzoom: 0,
							maxzoom: 21,
						},
					],
				},
				center: [areaLng!, areaLat!],
				zoom: 15,
				maxZoom: 20,
			});

			map.on("load", () => {
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
			<CreateNewScenarioModal
				modalOpen={modalOpen}
				setModalOpen={setModalOpen}
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
												<A
													href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${project._id}`}
													class={`list-group-item list-group-item-action ${status[3]}`}
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
											</>
										);
									}}
								</For>
							</div>
							<button class="btn btn-dark" onClick={() => setModalOpen(true)}>
								Create new scenario
							</button>
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
								? `${(data()?.layer.size! * 0.0001).toFixed(2)} hectare(s)`
								: `${data()?.layer.size.toFixed(0)} m2`}
						</p>

						<p>{data()?.layer.description ?? ""}</p>
						<hr />
						<Show
							when={
								mongoDBDBUser() &&
								data()?.layer.owner.id === mongoDBDBUser()._id
							}
						>
							<>
								<A
									class="btn btn-dark"
									href={`/parcels/${params.parcelId}/layers/${
										data()?.layer._id
									}/edit`}
								>
									Edit field details
								</A>
								<Button
									variant="danger"
									// onClick={() => setShowDeleteFieldModal(true)}
									data-bs-toggle="modal"
									data-bs-target="#deleteFieldModal"
								>
									Delete Field
								</Button>
								{/* // <!-- Modal --> */}
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
												<h1 class="modal-title" id="deleteFieldModalLabel">
													Confirm deletion of field
												</h1>
											</div>
											<div class="modal-body">
												<p>
													When you delete your field, all information connected
													to it like saved systems, projects and budgets will be
													permanently deleted and it will not be able to be
													restored.
												</p>
											</div>
											<div class="modal-footer">
												<form
													action={deleteForm}
													method="post"
													class="delete-form"
												>
													<button
														class="btn btn-danger"
														data-bs-dismiss="modal"
													>
														Delete field
													</button>
												</form>
												<Button variant="default" data-bs-dismiss="modal">
													Cancel
												</Button>
											</div>
										</div>
									</div>
								</div>
							</>
						</Show>
					</div>
				</Show>
			</div>
		</>
	);
}
