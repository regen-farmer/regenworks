import {
	createEffect,
	createResource,
	createSignal,
	For,
	Show,
} from "solid-js";
import { useParams } from "@solidjs/router";
import { GiantHerbTop } from "~/components/graphics/giantherbtop.tsx";
import { PalmTop } from "~/components/graphics/palmtop.tsx";
import { ShrubTop } from "~/components/graphics/shrubtop.tsx";
import { SocculentTop } from "~/components/graphics/succulenttop.tsx";
import { TreeTop } from "~/components/graphics/treetop.tsx";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import "./index.css";

export default function view() {
	const params = useParams<{
		systemId: string;
	}>();

	const [data, { refetch }] = createResource<{
		system: SystemDocument;
		species: SpeciesDocument[];
		rows: {
			row: number;
			array: {
				species: SpeciesDocument;
				position: number[];
				width: number;
			}[];
		}[];
		systemwidth: number;
		systemlength: number;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/systems/${params.systemId}`,
			apiFetchOptions(),
		);
		return await response.json();
	});
	const [widths, setWidths] = createSignal<number[]>([]);

	createEffect(async () => {
		// var ctx = document.getElementById('lineChartAnnual').getContext('2d');
		// var myChartAnnual = new Chart(ctx, {
		//     // The type of chart we want to create
		//     type: 'line',

		//     // The data for our dataset
		//     data: {
		//         labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
		//         datasets: [{
		//             label: 'Apple trees',
		//             backgroundColor: 'rgb(110, 188, 74)',
		//             borderColor: 'rgb(77, 131, 51)',
		//             data: [0, 0, 0, 0, 0, 0, 0, 3.2, 4.5, 1.3, 0, 0]
		//         },
		//             {
		//                 label: 'Wheat',
		//                 backgroundColor: 'rgb(208, 106, 4)',
		//                 borderColor: 'rgb(135, 68, 1)',
		//                 data: [0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0]
		//             }
		//         ]
		//     },

		//     // Configuration options go here
		//     options: {}
		// });

		// var ctx = document.getElementById('lineChart').getContext('2d');
		// var myChart = new Chart(ctx, {
		//     // The type of chart we want to create
		//     type: 'line',

		//     // The data for our dataset
		//     data: {
		//         labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'],
		//         datasets: [{
		//             label: 'Apple trees',
		//             backgroundColor: 'rgb(110, 188, 74)',
		//             borderColor: 'rgb(77, 131, 51)',
		//             data: [0, 0, 0.2, 0.5, 1, 1.2, 1.6, 2, 2.5, 2.9, 3.3, 4, 4.5, 5]
		//         },
		//             {
		//                 label: 'Wheat',
		//                 backgroundColor: 'rgb(208, 106, 4)',
		//                 borderColor: 'rgb(135, 68, 1)',
		//                 data: [1, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.7, 0.7, 0.7, 0.7]
		//             }
		//         ]
		//     },

		//     // Configuration options go here
		//     options: {}
		// });

		// var ctx = document.getElementById('lineChartCarbon').getContext('2d');
		// var myChartCarbon = new Chart(ctx, {
		//     // The type of chart we want to create
		//     type: 'line',

		//     // The data for our dataset
		//     data: {
		//         labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'],
		//         datasets: [{
		//             label: 'System LER (wheat baseline = 1)',
		//             backgroundColor: 'rgb(35, 88, 147)',
		//             borderColor: 'rgb(11, 51, 95)',
		//             data: [0.8, 0.8, 0.9, 1, 1.1, 1.1, 1.2, 1.2, 1.2, 1.3, 1.3, 1.3, 1.3, 1.3]
		//         }]
		//     },

		//     // Configuration options go here
		//     options: {}
		// });

		console.log("calc widths");

		setWidths([]);
		const width: number[] = [];
		data()?.rows.forEach((row, i) => {
			if (i < 1) {
				width[i] = data()?.rows[i].array[0].width! / 2;
			} else {
				width[i] =
					width[i - 1] +
					data()?.rows[i].array[0].width! / 2 +
					data()?.rows[i - 1].array[0].width! / 2;
			}
		});
		setWidths(width);
		console.log("widths", widths());
	});

	function calculateAlleyWidth(i: number) {
		return (
			data()?.rows[i].array[0].width! / 2 +
			data()?.rows[i - 1].array[0].width! / 2
		);
	}

	return (
		<>
			<div style={{ padding: "20px" }}>
				<Show when={data() && widths().length > 0}>
					<h1 class="h1">System: {data()?.system.name}</h1>
					<div class="row">
						<div class="col-sm-6">
							<h2 class="h2">System layout</h2>
							<div class="row">
								<Show when={data()?.rows}>
									<For each={data()?.rows}>
										{(row, i) => (
											<>
												{row.array[0].species.form === "tree" ? (
													<>
														{row.array[0].species.height > 12 ? (
															<div class="col-sm-3">
																<img
																	class="img-fluid"
																	src="/images/treehigh.svg"
																/>
																<p class="text-center">Row {i() + 1}</p>
															</div>
														) : (
															<div class="col-sm-3">
																<img
																	class="img-fluid"
																	src="/images/treelow.svg"
																/>
																<p class="text-center">Row {i() + 1}</p>
															</div>
														)}
													</>
												) : (
													<div class="col-sm-3">
														<img
															class="img-fluid"
															src={`/images/${row.array[0].species.form}.svg`}
														/>
														<p class="text-center">Row {i() + 1}</p>
													</div>
												)}
											</>
										)}
									</For>
								</Show>
							</div>

							<svg
								viewBox={`0 0 ${data()?.systemwidth! + 2} ${
									data()?.systemlength! + 2
								}`}
							>
								<Show when={data()?.rows}>
									<For each={data()?.rows}>
										{(row, i) => {
											console.log("rows", data()?.rows);
											console.log("i", i);

											return (
												<>
													{/* <Show when={i() >= 1 && data() && data()?.rows[i()] && data()?.rows[i()-1]&& data()?.rows[i()].array && data()?.rows[i() - 1].array && data()?.rows[i()].array[0].width && data()?.rows[i() - 1].array[0].width}> */}
													<Show when={i()}>
														<text
															x={
																widths()[i()] - calculateAlleyWidth(i()) / 2 + 1
															}
															y="0.5"
															class="smallspeciesname"
														>
															{`-- ${calculateAlleyWidth(i())} --`}
														</text>
													</Show>
													{JSON.stringify(widths())}
													<line
														x1={widths()[i()] + 1}
														y1="1"
														x2={widths()[i()] + 1}
														y2={data()?.systemlength! + 1}
														style="stroke:rgb(150,150,150);stroke-width:0.02"
													/>

													<For each={data()?.rows[i()].array}>
														{(arrayEl, j) => (
															<Show
																when={
																	!(
																		data()?.rows[i()].array[j()].species
																			.form === "grass" ||
																		data()?.rows[i()].array[j()].species
																			.form === "herb"
																	)
																}
															>
																<>
																	<svg
																		version="1.1"
																		id="Layer_1"
																		xmlns="http://www.w3.org/2000/svg"
																		// @ts-ignore
																		xmlns:xlink="http://www.w3.org/1999/xlink"
																		x={`${widths()[i()]}px`}
																		y={`${
																			data()?.systemlength! -
																			data()?.rows[i()].array[j()].position[1]!
																		}px`}
																		width="2px"
																		height="2px"
																		viewBox="89 89 2 2"
																		enable-background="new 89 89 2 2"
																		xml:space="preserve"
																	>
																		{data()?.rows[i()].array[j()].species
																			.form === "palm" ? (
																			<PalmTop />
																		) : data()?.rows[i()].array[j()].species
																				.form === "giantherb" ? (
																			<GiantHerbTop />
																		) : data()?.rows[i()].array[j()].species
																				.form === "succulent" ? (
																			<SocculentTop />
																		) : data()?.rows[i()].array[j()].species
																				.form === "tree" ? (
																			<TreeTop />
																		) : data()?.rows[i()].array[j()].species
																				.form === "shrub" ? (
																			<ShrubTop />
																		) : (
																			<TreeTop />
																		)}
																	</svg>
																	<text
																		x={widths()[i()] + 1}
																		y={
																			data()?.systemlength! -
																			(data()?.rows[i()].array[j()]
																				.position[1]! -
																				1)
																		}
																		class="smallspeciesname"
																	>
																		{
																			data()?.rows[i()].array[j()].species
																				.nameCommon
																		}
																	</text>
																</>
															</Show>
														)}
													</For>
												</>
											);
										}}
									</For>
								</Show>
								<style>
									{/*
                    circle { fill: #6EBC4A; }
                                    */}
									{/* .smallspeciesname { font: 0.2px sans-serif; font-family: 'Open Sans', sans-serif; text-anchor: middle; } */}
								</style>
							</svg>

							{/* <!--<h2 class="h2">System layout</h2>
            <div class="row">
                <% if(system.rows){ %>
                    <% system.rows.forEach(function(row, i){ %>
                        <% if(row.sequense[0].form === "tree"){ %>
                            <% if(row.sequense[0].height > 12){ %>
                                <div class="col-sm-3">
                                    <img class="img-fluid" src="/images/treehigh.svg">
                                    <p class="text-center">Row <%= i + 1 %></p>
                                    <p class="text-center"><%= row.width %> m wide</p>
                                </div>
                            <% } else { %>
                                <div class="col-sm-3">
                                    <img class="img-fluid" src="/images/treelow.svg">
                                    <p class="text-center">Row <%= i + 1 %></p>
                                    <p class="text-center"><%= row.width %> m wide</p>
                                </div>
                            <% } %>
                        <% } else { %>
                            <div class="col-sm-3">
                                <img class="img-fluid" src="/images/<%= row.sequense[0].form %>.svg">
                                <p class="text-center">Row <%= i + 1 %></p>
                                <p class="text-center"><%= row.width %> m wide</p>
                            </div>
                        <% } %>
                    <% }); %>
                <% } %>
            </div>
            <div class="row">
                <% if(system.rows){ %>
                    <% system.rows.forEach(function(row){ %>
                    <div class="col-sm-3">
                        <% row.sequense.reverse().forEach(function(sequense){ %>
                        <img class="img-fluid" src="/images/<%= sequense.form %>top.svg">
                        <p class="text-center"><%= sequense.nameCommon %></p>
                        <% }); %>
                    </div>
                    <% }); %>
                <% } %>
            </div>--> */}
						</div>
						<div class="col-sm-4">
							<h2 class="h2">System specifications</h2>
							<p>{data()?.system.description}</p>
							<div class="thumbnail">
								<div class="caption">
									<table class="table table-striped small">
										<tbody>
											<tr>
												<td>
													<strong>Layer</strong>
												</td>
												<td>
													<strong>Species</strong>
												</td>
											</tr>
											<tr>
												<td>Canopy</td>
												<td>
													<For each={data()?.species}>
														{(species) => (
															<Show
																when={
																	species.form === "tree" ||
																	species.form === "palm"
																}
															>
																species.nameCommon
															</Show>
														)}
													</For>
												</td>
											</tr>
											<tr>
												<td>Sub-Canopy</td>
												<td>
													<For each={data()?.species}>
														{(species) => (
															<Show
																when={
																	species.form === "shrub" ||
																	species.form === "giantherb"
																}
															>
																species.nameCommon
															</Show>
														)}
													</For>
												</td>
											</tr>
											<tr>
												<td>Climbers</td>
												<td>
													<For each={data()?.species}>
														{(species) => (
															<Show when={species.form === "vine"}>
																species.nameCommon
															</Show>
														)}
													</For>
												</td>
											</tr>
											<tr>
												<td>Ground</td>
												<td>
													<For each={data()?.species}>
														{(species) => (
															<Show
																when={
																	species.form === "herb" ||
																	species.form === "grass"
																}
															>
																species.nameCommon
															</Show>
														)}
													</For>
												</td>
											</tr>
											<tr>
												<td>Animals</td>
												<td>
													<Show when={data()?.system.animals.length! > 0}>
														<p> {data()?.system.animals[0].name}</p>
													</Show>
												</td>
											</tr>
										</tbody>
									</table>
									{/* TODO: Add route - Jan 27 2023 
									<A
										class="rounded-sm p-1 m-1 btn-default"
										href={`/systems/${params.systemId}/composition`}
									>
										Analyse system composition
									</A> */}
									{/* <A
										class="rounded-sm p-1 m-1 btn-default"
										href={`/systems/${params.systemId}/edit`}
									>
										Edit system
									</A> */}
								</div>
							</div>
							<p>System tree count: N/A</p>
							<p>System dimensions: N/A</p>
						</div>
					</div>
					<h2 class="h2">System lifetime productivity</h2>
					<p>Assess projected lifetime productivity of system.</p>
					<table class="table table-striped small">
						<tbody>
							<tr>
								<td />
								<td class="text-right">Year</td>
								<td>1</td>
								<td>2</td>
								<td>3</td>
								<td>4</td>
								<td>5</td>
								<td>6</td>
								<td>7</td>
								<td>8</td>
								<td>9</td>
								<td>10</td>
								<td>11</td>
								<td>12</td>
								<td>13</td>
								<td>14</td>
								<td>15</td>
							</tr>
							<For each={data()?.species}>
								{(species) => (
									<tr>
										<td>
											<strong>{species.nameCommon}</strong> -{" "}
											<i>
												{species.genus} {species.species}
											</i>
										</td>
										{species.flows.length > 0 ? (
											<>
												<For each={species.flows}>
													{(flow, j) => (
														<Show
															when={species.flows[j()].timeframe === "year"}
														>
															<>
																<td class="text-right">
																	{species.flows[0].name}
																</td>
																<For each={[...Array(15).keys()]}>
																	{(i) => (
																		<>
																			{species.flows[j()].data[i] > 0 ? (
																				<td class="bg-success">
																					{species.flows[j()].data[i]}
																				</td>
																			) : (
																				<td>{species.flows[j()].data[i]}</td>
																			)}
																		</>
																	)}
																</For>
															</>
														</Show>
													)}
												</For>
											</>
										) : (
											<td>---</td>
										)}
									</tr>
								)}
							</For>
						</tbody>
					</table>
					<h2 class="h2">Seasonal activities</h2>
					<p>
						Assess system labor loads and complementarity of species management
						activities in system.
					</p>
					<table class="table table-striped small">
						<tbody>
							<tr>
								<td />
								<td>Activity</td>
								<td>Jan</td>
								<td>Feb</td>
								<td>Mar</td>
								<td>Apr</td>
								<td>May</td>
								<td>Jun</td>
								<td>Jul</td>
								<td>Aug</td>
								<td>Sep</td>
								<td>Oct</td>
								<td>Nov</td>
								<td>Dec</td>
							</tr>
							<For each={data()?.species}>
								{(species) => (
									<>
										{species.activities.length > 0 ? (
											<>
												<For each={species.activities}>
													{(activity) => (
														<Show when={activity.activityType === "manage"}>
															<tr>
																<td>
																	<strong>{species.nameCommon}</strong> -{" "}
																	<i>
																		{species.genus} {species.species}
																	</i>
																</td>
																<td>{activity.name}</td>
																<For each={[...Array(12).keys()]}>
																	{(i) => (
																		<Show
																			when={
																				activity.time.startMonth <= i + 1 &&
																				activity.time.endMonth >= i + 1
																			}
																			fallback={<td />}
																		>
																			<td class="bg-success" />
																		</Show>
																	)}
																</For>
															</tr>
														</Show>
													)}
												</For>
											</>
										) : (
											<tr>
												<td>
													<strong>{species.nameCommon}</strong> -{" "}
													<i>
														{species.genus} {species.species}
													</i>
												</td>
												<td>-N/A-</td>
											</tr>
										)}
									</>
								)}
							</For>
						</tbody>
					</table>
					<p>
						- Not showing location/context based data. Production systems
						associated with a particular geographical area have higher accuracy
						of yield profile. -
					</p>
					<hr />

					{/* <!--
    <div class="row">
        <div class="col-sm-2">
            <img class="img-responsive" src="/images/shrub.svg">
        </div>
        <div class="col-sm-2">
            <p></p>
        </div>
        <div class="col-sm-2">
            <h2 class="h2">Yields</h2>
            <p>Yield type 1: Fruit</p>
            <p>Yield type 2: Cereal</p>
        </div>
        <div class="col-sm-6"><canvas id="lineChartAnnual"></canvas></div>
    </div>
    <h2 class="h2">System lifetime productivity profile</h2>
    <div class="row">
        <div class="col-sm-2">
            <img class="img-responsive" src="/images/shrub.svg">
        </div>
        <div class="col-sm-2">
            <p></p>
        </div>
        <div class="col-sm-2">
            <h2 class="h2">Yields</h2>
            <p>Yield type 1: Fruit</p>
            <p>Yield type 2: Cereal</p>
        </div>
        <div class="col-sm-6"><canvas id="lineChart"></canvas></div>
    </div>
    <div class="row">
        <div class="col-sm-2">
        </div>
        <div class="col-sm-2">
        </div>
        <div class="col-sm-2">
            <h2 class="h2">Carbon</h2>
            <p>LER over time (Land equavelant ratio)</p>
        </div>
        <div class="col-sm-6"><canvas id="lineChartCarbon"></canvas></div>
    </div>
    --> */}
				</Show>
			</div>
		</>
	);
}
