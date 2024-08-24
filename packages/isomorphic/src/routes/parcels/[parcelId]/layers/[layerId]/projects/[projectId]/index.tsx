import { useLocation, useNavigate } from "@solidjs/router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	For,
	Show,
} from "solid-js";

//@ts-ignore
import { action } from "@solidjs/router";
import { A, useParams } from "@solidjs/router";
import { getMongoDBUser } from "~/auth/useAuth.tsx";
import type { LayerDocument } from "@rw/db/schemas/layer.ts";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { Row } from "~/components/row/Row";

export default function view() {
	const params = useParams();

	const [data, { refetch }] = createResource<{
		layer: LayerDocument;
		project: ProjectDocument;
		years: number;
		roi: number;
		irr: number;
		labels: string;
		dataset: string;
		sum: string;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/layers/${params.layerId}/projects/${
				params.projectId
			}`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	createMemo(() => {
		refetch();
		return useLocation().pathname;
	});

	const navigate = useNavigate();

	// navigate(
	// 	`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}/designer`,
	// );

	let deleteModal: HTMLDivElement;

	createEffect(() => {
		// var labels = data()?.labels;
		// // var correctlabels = JSON.parse(labels!.replace(/&#34;/g, '"'));
		// var dataset = data()?.dataset;
		// // var correctdataset = JSON.parse(dataset!.replace(/&#34;/g, '"'));
		// var sum = data()?.sum;
		// var correctsum = JSON.parse(sum!.replace(/&#34;/g, '"'));
		// @ts-ignore
		// var myChart = new Chart(
		// 	document.getElementById("lineChart")?.getContext("2d"),
		// 	{
		// 		// The type of chart we want to create
		// 		type: "line",
		// 		// The data for our dataset
		// 		data: {
		// 			labels: correctlabels,
		// 			datasets: [
		// 				{
		// 					label: "Income",
		// 					backgroundColor: "rgb(255, 255, 255)",
		// 					borderColor: "rgb(0, 0, 255)",
		// 					data: correctdataset,
		// 				},
		// 				{
		// 					label: "Cumulative cash flow",
		// 					backgroundColor: "rgb(255, 255, 255)",
		// 					borderColor: "rgb(77, 131, 51)",
		// 					data: correctsum,
		// 				},
		// 			],
		// 		},
		// 		// Configuration options go here
		// 		options: {},
		// 	},
		// );
	});

	const DeleteForm = action(async (formData: FormData) => {
		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}`,
			{
				body: JSON.stringify({}),
				method: "delete",
				...apiFetchOptions(),
			},
		);

		// console.log(await response.json());

		navigate("/projects");
	});

	const StartImplementationForm = action(async (formData: FormData) => {
		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/implement`,
			{
				body: JSON.stringify({}),
				method: "put",
				...apiFetchOptions(),
			},
		);
	});

	const CompleteProjectForm = action(async (formData: FormData) => {
		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/complete`,
			{
				body: JSON.stringify({}),
				method: "put",
				...apiFetchOptions(),
			},
		);
	});

	const RetireProjectForm = action(async (formData: FormData) => {
		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/retire`,
			{
				body: JSON.stringify({}),
				method: "put",
				...apiFetchOptions(),
			},
		);

		refetch();
	});

	const GenerateAssetsForm = action(async (formData: FormData) => {
		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/generateassets`,
			{
				body: JSON.stringify({}),
				method: "put",
				...apiFetchOptions(),
			},
		);

		refetch();
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

	const [settingSystem, setSettingSystem] = createSignal(false);

	const [exportingKML, setExportingKML] = createSignal(false);

	async function exportKML() {
		setExportingKML(true);
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/design-preview`,
			apiFetchOptions(),
		);

		const result: {
			treeRowLines: any;
			groundCoverAreas: any;
			headlandSides: any;
			marginPolygon: any;
			headlandPolygon: any;
			sidesCloseToBearing: any;
			intersectionPoints: any;
			treeMarkerArray: any;
			speciesCountArray: any;
		} = await response.json();

		// const treeRowLines = featureCollection(
		//   result.treeRowLines?.map((tree: any) => tree.line)
		// );
		// const groundCoverAreas = result.groundCoverAreas;
		// const headlandSides = result.headlandSides;
		// const headlandPolygon = result.headlandPolygon;
		// const marginPolygon = result.marginPolygon;
		// const sidesCloseToBearing = result.sidesCloseToBearing;
		// const intersectionPoints = result.intersectionPoints;

		const treeMarkerArray: any[] = result.treeMarkerArray;

		let kmlDoc = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
`;

		// const treeCircles = featureCollection(
		//   treeMarkerArray?.map((tree: any) => tree.circle)
		// );

		console.log(treeMarkerArray);
		for (const entry of treeMarkerArray) {
			console.log(entry);

			if (entry.species?.nameCommon) {
				kmlDoc += `<Placemark>
          <name>${entry.species.nameCommon}</name>
          <description>${entry.species.species}</description>
          <Point>
            <coordinates>${entry.point.geometry.coordinates[0]},${entry.point.geometry.coordinates[1]},0</coordinates>
          </Point>
        </Placemark>`;
			}

			// entry.point.species = entry.species;
			// return entry;
		}

		kmlDoc += `
    </Document>
    </kml>`;

		// console.log(kmlDoc);

		const element = document.createElement("a");

		element.setAttribute(
			"href",
			`data:text/plain;charset=utf-8,${encodeURIComponent(kmlDoc)}`,
		);
		element.setAttribute(
			"download",
			`${data()?.project.layer.name} - ${data()?.project.name}.kml`,
		);

		element.style.display = "none";
		document.body.appendChild(element);

		element.click();

		document.body.removeChild(element);
		setExportingKML(false);
	}

	return (
		<>
			{/* <ScenarioSideBar> */}
			<div style={{ padding: "20px" }}>
				<Show when={data()}>
					{/* <h1 class="h1">Scenario dashboard </h1> */}
					<Row>	
						<div class="w-full">
							<Tabs defaultValue="info">

								<TabsList class="grid w-fit grid-cols-2">
									<TabsTrigger class="border" value="info">Info</TabsTrigger>
									{data()?.project.systemdesign ?<TabsTrigger class="border" value="generateassets">KML</TabsTrigger>:<></>}
									{/* <TabsTrigger value="systems">System</TabsTrigger>
									<TabsTrigger value="layout">Layout</TabsTrigger>
									<TabsTrigger value="financials">Financials</TabsTrigger>
									<TabsTrigger value="assets">Assets</TabsTrigger>
									<TabsTrigger value="implementation">Implementation</TabsTrigger> */}
								</TabsList>
								
								<TabsContent value="info" title="Info">
									<div class="card">
										<div class="card-body">
											<p>
												<strong>Title: </strong>
												{data()?.project.name}
											</p>

											{/* <p>
												<strong>Phase: </strong> {data()?.project.status}
											</p> */}
											{/* <p>
												<strong>Field: </strong> {data()?.project.layer.name}
											</p> */}
											<p>{data()?.project.description}</p>

											{/* <!--
            <a class="btn btn-dark" href="#">Duplicate this project (Coming soon)</a>
--> */}
											{data()?.project.status === "planning" ? (
												<>
													{/* <button
														type="button"
														class="btn btn-dark"
														data-bs-toggle="modal"
														data-bs-target="#implementProjectModal"
													>
														Start implementation
													</button>
													<button
														type="button"
														class="btn btn-dark"
														data-bs-toggle="modal"
														data-bs-target="#retireProjectModal"
													>
														Retire scenario
													</button> */}
												</>
											) : (
												<></>
											)}

											<div
												class="modal fade"
												id="implementProjectModal"
												tabindex="-1"
												aria-labelledby="implementProjectModalLabel"
												aria-hidden="true"
											>
												<div class="modal-dialog">
													<div class="modal-content">
														<div class="modal-header">
															<h1
																class="modal-title"
																id="implementProjectModalLabel"
															>
																Start implementation phase
															</h1>
														</div>
														<div class="modal-body">
															<p>
																Once you change phase from planning to
																implementation phase, the layout of your
																scenario will be fixed and additional features
																wil be unlocked such as asset generation and
																implementation plans.
															</p>
														</div>
														<div class="modal-footer">
															<form
																method="post"
																action={StartImplementationForm}
															>
																<button
																	type="submit"
																	class="btn btn-dark"
																	data-bs-dismiss="modal"
																>
																	Confirm implementation start
																</button>
															</form>
															<button
																type="button"
																class="btn btn-default"
																data-bs-dismiss="modal"
															>
																Cancel
															</button>
														</div>
													</div>
												</div>
											</div>

											<div
												class="modal fade"
												id="retireProjectModal"
												tabindex="-1"
												aria-labelledby="retireProjectModalLabel"
												aria-hidden="true"
											>
												<div class="modal-dialog">
													<div class="modal-content">
														<div class="modal-header">
															<h1
																class="modal-title"
																id="retireProjectModalLabel"
															>
																Retire scenario
															</h1>
														</div>
														<div class="modal-body">
															<p>
																Retire your scenario if you want to stop
																planning of the scenario. This can be relevant
																if you want to try a different agroforestry
																system instead. Retired scenarios are still
																available on the field page.
															</p>
														</div>
														<div class="modal-footer">
															<form method="post" action={RetireProjectForm}>
																<button
																	class="btn btn-dark"
																	data-bs-dismiss="modal"
																>
																	Confirm retirement
																</button>
															</form>
															<button
																type="button"
																class="btn btn-default"
																data-bs-dismiss="modal"
															>
																Cancel
															</button>
														</div>
													</div>
												</div>
											</div>

											{/* <h2 class="h2">System design</h2> */}
											<A
												href={`/parcels/${params.parcelId}/layers/${
													params.layerId
												}/projects/${data()?.project._id}/designer`}
												class="btn btn-dark"
											>
												Edit system design
											</A>

											<br />
											<br />
											<div style={{ display: "flex", "align-items": "center" }}>
												Enable public preview of system design:
												<input
													style={{ margin: "0px 5px" }}
													type="checkbox"
													checked={data()?.project.isPublic}
													onChange={async (e) => {
														await fetch(
															`${import.meta.env.VITE_BACKEND_URL}/projects/${
																params.projectId
															}/set-public`,
															{
																body: JSON.stringify({
																	isPublic: e.target.checked,
																}),
																method: "put",
																...apiFetchOptions(),
															},
														);
														refetch();
													}}
												/>
											</div>

											{data()?.project.isPublic ? (
												<>
													<A
														target="_blank"
														href={`/scenario-preview/${params.projectId}`}
													>
														<div class="btn btn-dark">See preview</div>
													</A>
												</>
											) : (
												""
											)}
											<br />
											<br />

											{getMongoDBUser() &&
											data()?.project.owner.id === getMongoDBUser()._id ? (
												<>
													<button
														type="button"
														class="btn btn-danger"
														data-bs-toggle="modal"
														data-bs-target="#deleteProjectModal"
													>
														Delete scenario
													</button>

													<div
														class="modal fade"
														id="deleteProjectModal"
														tabindex="-1"
														aria-labelledby="deleteProjectModalLabel"
														aria-hidden="true"
													>
														<div class="modal-dialog">
															<div class="modal-content">
																<div class="modal-header">
																	<h1
																		class="modal-title"
																		id="deleteProjectModalLabel"
																	>
																		Confirm deletion of scenario
																	</h1>
																</div>
																<div class="modal-body">
																	<p>
																		When you delete your scenario, all
																		information connected to it like budgets and
																		activities will be permanently deleted and
																		we will not be able to recreate it.
																	</p>
																</div>
																<div class="modal-footer">
																	<form
																		method="post"
																		action={DeleteForm}
																		class="delete-form"
																	>
																		<button
																			class="btn btn-danger"
																			data-bs-dismiss="modal"
																		>
																			Delete scenario
																		</button>
																	</form>
																	<button
																		type="button"
																		class="btn btn-default"
																		data-bs-dismiss="modal"
																	>
																		Cancel
																	</button>
																</div>
															</div>
														</div>
													</div>
												</>
											) : (
												<></>
											)}
										</div>
									</div>
								</TabsContent>

								{false ? (
									<TabsContent value="systems" title="System">
										<div class="card">
											<div class="card-body">
												<Row>
													<div class="col-md-6">
														<div class="card">
															<div class="card-body">
																<p class="card-text">
																	<Show
																		when={data()?.project.system}
																		fallback={
																			<>
																				<strong>Active system:</strong> None
																				chosen
																			</>
																		}
																	>
																		<strong>Active system:</strong>{" "}
																		{data()?.project.system.name}
																		<A
																			class="btn btn-dark"
																			href={`/parcels/${
																				params.parcelId
																			}/layers/${params.layerId}/projects/${
																				params.projectId
																			}/systems/${
																				data()?.project.system._id
																			}/edit`}
																		>
																			Edit system
																		</A>
																	</Show>
																</p>
																{/* {data()?.project.status === "planning" ? (
															<A
																class='btn btn-dark'
																href={`/systems/${data()?.project.system._id
																	}/edit`}
															>
																Edit system
															</A>
														) : (
															<></>
														)} */}
															</div>
														</div>
													</div>
													{data()?.project.edgesystem ? (
														<div class="col-md-6">
															<div class="card">
																<div class="card-body">
																	<p class="card-text">
																		<strong>Edge System:</strong>{" "}
																		{data()?.project.edgesystem.name}
																	</p>
																	{data()?.project.status === "planning" ? (
																		<A
																			class="btn btn-dark"
																			href={`/systems/${
																				data()?.project.edgesystem._id
																			}/edit`}
																		>
																			Edit edge system
																		</A>
																	) : (
																		<></>
																	)}
																</div>
															</div>
														</div>
													) : (
														/* <!--<% if(data()?.project.status === "planning"){ }
																				<div class="col-md-6">
																						<div class="card">
																								<div class="card-body">
																										<a class="btn btn-dark" href="/projects/${ data()?.project._id }/addedgesystem">Add edge system</a>
																								</div>
																						</div>
																				</div>
																		<% } }--> */
														<></>
													)}
												</Row>
												<hr />

												<Show when={data()?.layer.systems.future}>
													<For each={data()?.layer.systems.future}>
														{(system, i) => (
															<div class="card">
																<div class="card-body">
																	<p class="card-text">
																		<strong>System name: </strong>
																		{system.name}
																	</p>
																	<A
																		class="btn btn-dark"
																		href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}/systems/${system._id}`}
																	>
																		View more details
																	</A>

																	<button
																		disabled={settingSystem()}
																		class="btn btn-dark"
																		onclick={async () => {
																			setSettingSystem(true);

																			const fetchUrl = `${
																				import.meta.env.VITE_BACKEND_URL
																			}/parcels/${params.parcelId}/layers/${
																				params.layerId
																			}/projects/${params.projectId}/systems/${
																				system._id
																			}/pick`;

																			const result = await fetch(fetchUrl, {
																				method: "PUT",
																				...apiFetchOptions(),
																			});

																			const json = await result.json();
																			console.log("json", json);
																			refetch();

																			setSettingSystem(false);
																		}}
																	>
																		Use this system in scenario
																	</button>

																	{/* <Show
                              when={
                                mongoDBDBUser() &&
                                system.owner.id === mongoDBDBUser()._id
                              }
                            >
                              <button class="btn btn-danger"
                                
                                data-bs-toggle='modal'
                                data-bs-target='#deleteSystemModal'
                              >
                                Delete <i class='far fa-trash-alt' />
                              </button>
                            </Show> */}

																	{/* <!-- Delete system Modal -->  */}
																	
																	<div
																		class="modal fade"
																		id="deleteSystemModal"
																		tabindex="-1"
																		aria-labelledby="deleteSystemModalLabel"
																		aria-hidden="true"
																	>
																		<div class="modal-dialog">
																			<div class="modal-content">
																				<div class="modal-header">
																					<h1
																						class="modal-title"
																						id="deleteSystemModalLabel"
																					>
																						Confirm deletion of system
																					</h1>
																				</div>
																				<div class="modal-body">
																					<p>
																						Confirm deletion of system: "
																						{system.name}
																						". This will delete the system and
																						it will not be possible to retrieve.
																						Please check that you are not using
																						the system in any projects before
																						you delete it.{" "}
																					</p>
																				</div>
																				<div class="modal-footer">
																					<button class="btn btn-danger"
																						data-bs-dismiss="modal"
																						
																						onClick={deleteSystem(system)}
																					>
																						Delete system{" "}
																						<i class="far fa-trash-alt" />
																					</button>
																					<button class="btn btn-dark"
																						data-bs-dismiss="modal"
																						
																					>
																						Cancel
																					</button>
																				</div>
																			</div>
																		</div>
																	</div>
																	{/* <!-- Delete system Modal --> */}
																</div>
															</div>
														)}
													</For>
													{/* <Show
														when={!(data()?.layer.systems!.future!.length! > 1)}
													> */}
													{/* // TODO: Add route Jan 27 2023
                          // <A
                          // 	class='btn btn-dark mt-2'
                          // 	href={`/layers/${
                          // 		data()?.layer._id
                          // 	}/systems/compare`}
                          // >
                          // 	Compare future systems
                          // </A>
                          //  */}
													{/* </Show> */}
												</Show>

												<A
													class="btn btn-dark mt-2"
													href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}/designer`}
												>
													Define new agroforestry system
												</A>
												{/* <A
                      class='btn btn-dark mt-2'
                      href={`/parcels/${params.parcelId}/layers/${
                        data()?.layer._id
                      }/analysis`}
                    >
                      Explore systems in the RegenWorks database
                    </A> */}
												{/* <A
                          class='btn btn-dark mt-2'
                          href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}/mysystems`}
                        >
                          My systems
                        </A> */}
											</div>
										</div>
									</TabsContent>
								) : (
									<></>
								)}

								{false ? (
									<TabsContent value="layout" title="Layout">
										<div class="card">
											<div class="card-body">
												<h2 class="h2">Layout</h2>
												{data()?.project.status === "planning" ? (
													<A
														href={`/parcels/${params.parcelId}/layers/${
															params.layerId
														}/projects/${data()?.project._id}/layout`}
														class="btn btn-dark"
													>
														View layout map <i class="far fa-map" />
													</A>
												) : data()?.project.assets &&
													data()?.project.assets.length! > 0 ? (
													<p>
														Layout has been fixed and digital tree assets have
														already been created for this scenario. Go to
														"Assets" tab to view asset map.
													</p>
												) : (
													<button
														type="button"
														class="btn btn-dark"

														// data-bs-toggle="modal"
														// data-bs-target="#generateAssetsModal"
													>
														Generate trees assets
													</button>
												)}

												<div
													class="modal fade"
													id="generateAssetsModal"
													tabindex="-1"
													aria-labelledby="generateAssetsModalLabel"
													aria-hidden="true"
												>
													<div class="modal-dialog">
														<div class="modal-content">
															<div class="modal-header">
																<h1
																	class="modal-title"
																	id="generateAssetsModalLabel"
																>
																	Confirm generation of tree assets
																</h1>
															</div>
															<div class="modal-body">
																<p>
																	Confirm creation of tree assets. This will
																	automatically generate tree assets for the
																	current scenario.{" "}
																</p>
															</div>
															<div class="modal-footer">
																<form method="post" action={GenerateAssetsForm}>
																	<button
																		class="btn btn-dark"
																		data-bs-dismiss="modal"
																	>
																		Generate tree assets
																	</button>
																</form>
																<button
																	type="button"
																	class="btn btn-default"
																	data-bs-dismiss="modal"
																>
																	Cancel
																</button>
															</div>
														</div>
													</div>
												</div>
											</div>
										</div>
									</TabsContent>
								) : (
									<></>
								)}

								{/* {data()?.project.systemdesign?(
<TabsContent value="financials" title='Financials'> */}
								{/* <div class='card'>
									<div class='card-body'>
										<h2 class='card-title'>Project budgets</h2>
										<Row>
											<div class='col-md-6'>
												<div class='card'>
													<div class='card-body'>
														<p class='card-text'>Establishment budget</p>
														{data()?.project.budgets?.establishment ? (
															<A
																href={`/budgets/${data()?.project.budgets.establishment._id
																	}`}
																class='btn btn-dark'
															>
																Show establishment budget
															</A>
														) : (
															<A
																href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${data()?.project._id
																	}/generateestablishment`}
																class='btn btn-dark'
															>
																Generate establishment budget
															</A>
														)}
													</div>
												</div>
											</div>
											<div class='col-md-6'>
												<div class='card'>
													<div class='card-body'>
														<p class='card-text'>
															Management and cash-flow budget
														</p>
														{data()?.project.budgets?.management ? (
															<A
																href={`/budgets/${data()?.project.budgets?.management._id
																	}`}
																class='btn btn-dark'
															>
																Show management budget
															</A>
														) : (
															<A
																href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${data()?.project._id
																	}/generatemanagement`}
																class='btn btn-dark'
															>
																Generate cash-flow budget
															</A>
														)}
													</div>
												</div>
											</div>
										</Row>
									</div>
								</div> */}
								{/* <div class='card'>
                        <div class='card-body'>
                          <h2 class='card-title'>Financial analysis</h2>

                          <A
                            href={`/parcels/${params.parcelId}/layers/${
                              params.layerId
                            }/projects/${data()?.project._id}/financials`}
                            class='btn btn-dark'
                          >
                            Financial analysis
                          </A> */}

								{/* {data()?.project.budgets?.management &&
										data()?.project.budgets?.establishment ? (
											<Row>
												<div class='col-sm-8'>
													<canvas id='lineChart' />
												</div>
												<div class='col-sm-4'>
													<p>
														<strong>IRR: {data()?.irr}</strong>
													</p>
													<p>
														Discount rate:{" "}
														{data()?.project.financial.discountRate! * 100} %
													</p>
													{data()?.years && data()?.years! > 0 ? (
														<p>Time period: {data()?.years} years</p>
													) : (
														<></>
													)}
												</div>
											</Row>
										) : (
											<p>
												-- Financial analysis will show when establishement and
												cash-flow budget has been generated --
											</p>
										)} */}
								{/* </div>
                      </div>
                    </TabsContent>

                    ):<></>} */}

								{data()?.project.systemdesign ? (
									<>
										<TabsContent value="generateassets" title="Export KML">
											<div class="card">
												<div class="card-body">
													
													{data()?.project.assets &&
													data()?.project.assets.length! > 0 ? (
														<p>
															Layout has been fixed and digital tree assets have
															already been created for this scenario. Go to
															"Assets" tab to view asset map.
														</p>
													) : (
														<button
															type="button"
															class="btn btn-dark"
															// data-bs-toggle="modal"
															// data-bs-target="#generateAssetsModal"
															onClick={exportKML}
															disabled={exportingKML()}
														>
															Export trees from system design as KML
														</button>
													)}

													<div
														class="modal fade"
														id="generateAssetsModal"
														tabindex="-1"
														aria-labelledby="generateAssetsModalLabel"
														aria-hidden="true"
													>
														<div class="modal-dialog">
															<div class="modal-content">
																<div class="modal-header">
																	<h1
																		class="modal-title"
																		id="generateAssetsModalLabel"
																	>
																		Confirm generation of tree assets
																	</h1>
																</div>
																<div class="modal-body">
																	<p>
																		Confirm creation of tree assets. This will
																		automatically generate tree assets for the
																		current scenario.{" "}
																	</p>
																</div>
																<div class="modal-footer">
																	<form
																		method="post"
																		action={GenerateAssetsForm}
																	>
																		<button
																			class="btn btn-dark"
																			data-bs-dismiss="modal"
																		>
																			Generate trees assets
																		</button>
																	</form>
																	<button
																		type="button"
																		class="btn btn-default"
																		data-bs-dismiss="modal"
																	>
																		Cancel
																	</button>
																</div>
															</div>
														</div>
													</div>
												</div>
											</div>
										</TabsContent>
									</>
								) : (
									<></>
								)}

								{data()?.project.status === "Implementation" ? (
									<>
										<TabsContent value="assets" title="Assets">
											<div class="card">
												<div class="card-body">
													<h2 class="h2 card-title">Assets</h2>
													<p>
														{" "}
														Tree asset count: {
															data()?.project.assets.length
														}{" "}
													</p>
													<A
														class="btn btn-dark"
														href={`/parcels/${params.parcelId}/layers/${
															params.layerId
														}/projects/${data()?.project._id}/assets`}
													>
														View asset map
													</A>

													{/* {data()?.project.assets.map((asset) => (
													<div class='card bg-light'>
														<div class='card-body'>
															<p class='card-text'>
																<strong>Name:</strong> {asset.name},{" "}
																<strong>Georef:</strong> {asset.lat},{" "}
																{asset.lng}, <strong>id:</strong> {asset.id}
															</p> */}
													{/* <!--<a class="btn btn-dark" href="/assets/${ asset._id }/edit">Edit asset <i class="far fa-edit" /></a>
                                    <form class="delete-asset-form" action="/assets/${ asset._id }?_method=DELETE" method="POST">
                                        <button class="btn btn-danger">Delete asset <i class="far fa-trash-alt" /></button>
                                    </form>--> */}
													{/* </div>
													</div>
												))} */}

													<form
														class="delete-asset-form"
														action={`/parcels/${params.parcelId}/layers/${
															params.layerId
														}/projects/${
															data()?.project._id
														}/allassets?_method=DELETE`}
														method="post"
													>
														<button class="btn btn-danger">
															Delete all digital assets
														</button>
													</form>
												</div>
											</div>
										</TabsContent>
										<TabsContent value="implementation" title="Implementation">
											<div class="card">
												<div class="card-body">
													<h2 class="h2 card-title">Implementation</h2>
													{data()?.project.activities &&
													data()?.project.activities.length! > 0 ? (
														<div class="card">
															<div class="card-body">
																<h2 class="h2">Activity plan</h2>
																<table class="table small">
																	<tbody>
																		<tr class="table-secondary">
																			<td>Activity</td>
																			<td>Status</td>
																			<td />
																		</tr>
																		<For each={data()?.project.activities}>
																			{(activity: any, i) => (
																				<>
																					<tr>
																						<td>{activity.name}</td>
																						{data()?.project.activities[i()]
																							.status === true ? (
																							<td>Completed</td>
																						) : data()?.project.activities[i()]
																								.status === false ? (
																							<td>Active</td>
																						) : (
																							<td>N/A</td>
																						)}
																						<td>
																							<A
																								href={`/parcels/${
																									params.parcelId
																								}/layers/${
																									params.layerId
																								}/projects/${
																									data()?.project._id
																								}/activities/${
																									data()?.project.activities[
																										i()
																									]._id
																								}/edit`}
																								class="btn btn-sm btn-dark"
																							>
																								<i class="far fa-edit" />
																							</A>
																							<button
																								type="button"
																								class="btn btn-sm btn-danger"
																								data-bs-toggle="modal"
																								data-bs-target={`#deleteActivityModal_${activity._id}`}
																							>
																								<i class="far fa-trash-alt" />
																							</button>
																						</td>
																					</tr>
																					{/* // <!-- Modal --> */}
																					<div
																						class="modal fade"
																						id={`deleteActivityModal_${activity._id}`}
																						tabindex="-1"
																						aria-labelledby={`deleteActivityModalLabel_${activity._id}`}
																						aria-hidden="true"
																					>
																						<div class="modal-dialog">
																							<div class="modal-content">
																								<div class="modal-header">
																									<h1
																										class="modal-title"
																										id={`deleteActivityModalLabel_${activity._id}`}
																									>
																										Confirm deletion of activity
																									</h1>
																								</div>
																								<div class="modal-body">
																									<p>
																										Confirm deletion of
																										activity: "
																										{
																											data()?.project
																												.activities[i()].name
																										}
																										"
																									</p>
																								</div>
																								<div class="modal-footer">
																									<form
																										class="delete-form"
																										action={`/parcels/${
																											params.parcelId
																										}/layers/${
																											params.layerId
																										}/projects/${
																											data()?.project._id
																										}/activities/${
																											data()?.project
																												.activities[i()]._id
																										}?_method=DELETE`}
																										method="post"
																									>
																										<button
																											class="btn btn-sm btn-danger"
																											data-bs-dismiss="modal"
																										>
																											Delete activity{" "}
																											<i class="far fa-trash-alt" />
																										</button>
																									</form>
																									<button
																										type="button"
																										class="btn btn-default"
																										data-bs-dismiss="modal"
																									>
																										Cancel
																									</button>
																								</div>
																							</div>
																						</div>
																					</div>
																				</>
																			)}
																		</For>
																	</tbody>
																</table>
															</div>
														</div>
													) : (
														<></>
													)}
													{data()?.project.status === "Implementation" ? (
														<button
															type="button"
															class="btn btn-dark"
															data-bs-toggle="modal"
															data-bs-target="#completeProjectModal"
														>
															Complete scenario
														</button>
													) : (
														<></>
													)}
													{/* <!-- Modal --> */}
													<div
														class="modal fade"
														id="completeProjectModal"
														tabindex="-1"
														aria-labelledby="completeProjectModalLabel"
														aria-hidden="true"
													>
														<div class="modal-dialog">
															<div class="modal-content">
																<div class="modal-header">
																	<div
																		class="modal-title"
																		id="completeProjectModalLabel"
																	>
																		Complete scenario
																	</div>
																</div>
																<div class="modal-body">
																	<p>
																		NOTICE: Once you complete the scenario, the
																		current system of the field will be updated
																		to reflect the system specified in this
																		scenario and the scenario will be marked as
																		completed.
																	</p>
																</div>
																<div class="modal-footer">
																	<form
																		method="post"
																		action={CompleteProjectForm}
																	>
																		<button
																			class="btn btn-dark"
																			data-bs-dismiss="modal"
																		>
																			Confirm scenario completion
																		</button>
																	</form>
																	<button
																		type="button"
																		class="btn btn-default"
																		data-bs-dismiss="modal"
																	>
																		Cancel
																	</button>
																</div>
															</div>
														</div>
													</div>
												</div>
											</div>
										</TabsContent>
									</>
								) : (
									<></>
								)}
							</Tabs>

							{/* <div class='tab-content' id='myTabContent'>
							<div
								class='tab-pane fade show active'
								id='layout'
								role='tabpanel'
								aria-labelledby='layout-tab'
							></div>
							<div
								class='tab-pane fade'
								id='financials'
								role='tabpanel'
								aria-labelledby='financials-tab'
							></div>
							<div
								class='tab-pane fade'
								id='assets'
								role='tabpanel'
								aria-labelledby='assets-tab'
							></div>
							<div
								class='tab-pane fade'
								id='implementation'
								role='tabpanel'
								aria-labelledby='implementation-tab'
							></div>
						</div> */}
							<div>
								{/*                 <!--<div class="card">
                    <div class="card-body">
                        <h2 class="h2 card-title">Project planning and activities</h2>
                        <% if(data()?.project.activities.length > 0){ }
                        <table class="table table-striped small">
                            <tr>
                                <td><strong>Activity</strong></td>
                                <td><strong>Date</strong></td>
                            </tr>
                            <% data()?.project.activities.forEach(function(activity){ }
                            <tr>
                                <td>{ activity.name }</td>
                                <td>{ activity.start.date }</td>
                            </tr>
                            <% }); }
                        </table>
                        <% } }
                        <a href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${ data()?.project._id }/activities/new`} class="btn btn-dark">Add new activity</a>
                        <p class="card-text"></p>
                    </div>
                </div>--> */}
							</div>
						</div>
					</Row>
				</Show>
			</div>
			{/* </ScenarioSideBar> */}
		</>
	);
}
