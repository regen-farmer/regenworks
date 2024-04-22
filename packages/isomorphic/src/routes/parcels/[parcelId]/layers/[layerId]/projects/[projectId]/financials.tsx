import { Row, Spinner } from "solid-bootstrap";
import {
	createEffect,
	createResource,
	createSignal,
	For,
	Show,
} from "solid-js";
import { action } from "@solidjs/router";
import type { ProjectDocument } from "@rw/db/schemas/project";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import Chart from "chart.js/auto";
import type { SpeciesDocument } from "@rw/db/schemas/species";
import type { SequenceDocument } from "@rw/db/schemas/sequence";
import { A, useParams } from "@solidjs/router";

export default function view() {
	const params = useParams<{
		projectId: string;
		parcelId: string;
		layerId: string;
	}>();

	const [data] = createResource<{
		species: SpeciesDocument[];
		project: ProjectDocument;
		labels: any[];
		dataset: string;
		sum: number[];
		npv: number;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/financials`,
			apiFetchOptions(),
		);
		return await response.json();
	});

	const [lineChart, setLineChart] = createSignal();
	const [showChart, setShowChart] = createSignal(true);

	let myChart: any;

	createEffect(() => {
		console.log("RUN UPDATE");
		if (data() && lineChart() && data.state === "ready") {
			console.log("UNIQUESPECIES: ", data()?.project.system.uniqueSpecies);

			const labels = data()?.labels;
			const dataset = data()?.dataset;
			const sum = data()?.sum;

			// @ts-ignore
			const ctx = lineChart().getContext("2d");

			myChart = new Chart(ctx, {
				// The type of chart we want to create
				type: "line",
				options: {
					plugins: {
						legend: {
							labels: {
								color: "rgba(255,255,255,0.8)",
							},
						},
					},
					scales: {
						y: {
							ticks: {
								color: "rgba(255,255,255,0.8)",
							},
							grid: {
								color: "rgba(255,255,255,0.2)",
								tickColor: "rgba(255,255,255,0.8)",
							},
						},
						x: {
							ticks: {
								color: "rgba(255,255,255,0.8)",
							},
							grid: {
								color: "rgba(255,255,255,0.2)",
								tickColor: "rgba(255,255,255,0.8)",
							},
						},
					},
				},

				// The data for our dataset
				data: {
					labels: labels,
					datasets: [
						{
							label: "Income",
							backgroundColor: "rgb(255, 255, 255)",
							borderColor: "rgb(0, 0, 255)",
							data: dataset,
						},
						{
							label: "Cumulative cash flow",
							backgroundColor: "rgb(255, 255, 255)",
							borderColor: "rgb(77, 131, 51)",
							//@ts-ignore
							data: sum!,
						},
					],
				},

				// Configuration options go here
			});

			setShowChart(true);
		}
	});

	const KeyParameterForm = action(async (formData: FormData) => {
		setShowChart(false);

		const payload = {
			discountrate:
				Number.parseFloat(formData.get("discountrate")?.toString()!) / 100,
			timeperiod: Number.parseFloat(formData.get("timeperiod")?.toString()!),
		};

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${
				params.projectId
			}/financials`,
			{
				body: JSON.stringify(payload),
				method: "PATCH",
				...apiFetchOptions(),
			},
		);

		myChart.destroy();
	});

	const SequenceActivitiesForm = action(async (formData: FormData) => {
		setShowChart(false);

		const payload: any[] = [];

		const sequence: SequenceDocument = JSON.parse(
			formData.get("sequence")?.toString()!,
		);

		sequence.uniqueSpecies.forEach((species, idx) => {
			payload.push({
				id: species.id,
				activities: [
					formData.get(`speciespostings_planting_material[${idx}]`),
					formData.get(`speciespostings_planting_method[${idx}]`),
					formData.get(`speciespostings_pruning_cutting[${idx}]`),
					formData.get(`speciespostings_harvest_method[${idx}]`),
				],
			});
		});
		// console.log(payload)

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/sequence/${
				sequence._id
			}/financials/activities`,
			{
				body: JSON.stringify(payload),
				method: "PATCH",
				...apiFetchOptions(),
			},
		);

		myChart.destroy();
	});

	const SystemActivitiesForm = action(async (formData: FormData) => {
		setShowChart(false);

		const payload: any[] = [];

		data()?.species.forEach((species, idx) => {
			payload.push({
				id: species._id,
				activities: [
					formData.get(`speciespostings_planting_material[${idx}]`),
					formData.get(`speciespostings_planting_method[${idx}]`),
					formData.get(`speciespostings_pruning_cutting[${idx}]`),
					formData.get(`speciespostings_harvest_method[${idx}]`),
				],
			});
		});
		// console.log(payload)

		await fetch(`/api/projects/${params.projectId}/financials/activities`, {
			body: JSON.stringify(payload),
			method: "PATCH",
			...apiFetchOptions(),
		});

		myChart.destroy();
	});

	function getInitialValue(
		uniqueSpeciesArray: any[],
		species: SpeciesDocument,
		subtype: string,
	) {
		// const uniqueSpeciesArray = data()?.project.system.uniqueSpecies;

		const relevantUniqueSpecies = uniqueSpeciesArray?.find(
			(us) => us.id === species._id,
		);

		if (relevantUniqueSpecies) {
			const thisActivity = relevantUniqueSpecies.activities.find(
				(act: any) => act.subtype === subtype,
			);

			if (thisActivity) {
				const jsonTranformedActivity = JSON.parse(
					JSON.stringify(thisActivity, Object.keys(thisActivity).sort()),
				);

				if (!jsonTranformedActivity.time) {
					jsonTranformedActivity.time = {};
				}

				const stringifiedActivity = JSON.stringify(
					jsonTranformedActivity,
					Object.keys(jsonTranformedActivity).sort(),
				);

				return stringifiedActivity;
			}

			return "none";
		}
		return "none";
	}

	const removeEmptyObject = (() => {
		//@ts-ignore
		const isNotObject = (v) => v === null || typeof v !== "object";
		//@ts-ignore
		const isEmpty = (o) => Object.keys(o).length === 0;
		//@ts-ignore
		return (obj) => {
			if (isNotObject(obj)) return obj;
			if (Array.isArray(obj)) {
				for (let i = 0; i < obj.length; i += 1) {
					if (isNotObject(obj[i])) continue;
					if (isEmpty(obj[i])) obj.splice(i--, 1);
					else obj[i] = removeEmptyObject(obj[i]);
				}
			} else {
				for (const p in obj) {
					if (isNotObject(obj[p])) continue;
					if (!isEmpty(obj[p])) obj[p] = removeEmptyObject(obj[p]);
					if (isEmpty(obj[p])) delete obj[p];
				}
			}
			return obj;
		};
	})();

	return (
		<>
			{/* <ScenarioSideBar> */}
			{/* <div class='card'>
        <div class='card-body'> */}
			<div class="paper" style={{ padding: "20px" }}>
				<div class="container" style={{ "max-width": "unset" }}>
					<div style={{ padding: "20px" }}>
						<div class="row">
							<div class="col-sm-8">
								<Show
									when={showChart()}
									fallback={
										<div
											style={{
												display: "flex",
												"justify-content": "center",
												"align-items": "center",
												height: "400px",
											}}
										>
											<Spinner animation="grow" />
										</div>
									}
								>
									<canvas class="financials-graph" ref={setLineChart} />
								</Show>
							</div>
							<div class="col-sm-4">
								<form method="post" action={KeyParameterForm}>
									<h2>Financial Analysis</h2>
									<p>
										<strong>Parameters</strong>
									</p>
									<br />
									<span>
										Discount rate:{" "}
										<input
											type="number"
											name="discountrate"
											value={data()?.project.financial.discountRate! * 100}
										/>{" "}
										%
									</span>
									<br />
									<br />
									<span>
										Time period:{" "}
										<input
											type="number"
											name="timeperiod"
											value={data()?.project.financial.period}
										/>{" "}
										years
									</span>
									<br />
									<br />
									<button type="submit" class="btn btn-dark">
										Refresh
									</button>
								</form>
								<br />
								<br />

								<p>
									<strong>Financial Indicators</strong>
								</p>
								<p>IRR: </p>
								<p>NPV: {Math.round(data()?.npv!)}</p>
								<p>MIRR?: </p>
							</div>
						</div>
						<Show
							when={data()?.project.rows.length! > 0}
							fallback={
								<form method="post" action={SystemActivitiesForm}>
									<div>
										<For each={data()?.species}>
											{(uniquespecies: SpeciesDocument, speciesIndex) => (
												<>
													{uniquespecies.nameCommon}
													{/* {[correctspecies().filter((species:SpeciesDocument)=>species.id === uniquespecies.id)].map((species2) => ( */}
													<div class="card">
														<div class="card-body">
															<p>
																{/* <strong>{species.nameCommon}</strong> */}
															</p>
															<Row>
																<div class="col-lg-3">
																	<label
																		for={`speciespostings_planting_material[${speciesIndex}]`}
																	>
																		Planting material type
																	</label>
																	<div class="form-group">
																		<select
																			value={getInitialValue(
																				data()?.project.system.uniqueSpecies!,
																				uniquespecies,
																				"plant",
																			)}
																			name={`speciespostings_planting_material[${speciesIndex}]`}
																			id={`speciespostings_planting_material[${speciesIndex}]`}
																		>
																			<option value="none">none</option>
																			<For each={uniquespecies.activities}>
																				{(acticity, i) => (
																					<Show
																						when={
																							uniquespecies.activities[i()]
																								.subtype === "plant"
																						}
																					>
																						<option
																							value={JSON.stringify(
																								acticity,
																								Object.keys(acticity).sort(),
																							)}
																						>
																							{
																								uniquespecies.activities[i()]
																									.name
																							}
																						</option>
																					</Show>
																				)}
																			</For>
																		</select>
																	</div>
																</div>
																<div class="col-lg-3">
																	<label
																		for={`speciespostings_planting_method[${speciesIndex}]`}
																	>
																		Planting method type
																	</label>
																	<div class="form-group">
																		<select
																			value={getInitialValue(
																				data()?.project.system.uniqueSpecies!,
																				uniquespecies,
																				"method",
																			)}
																			name={`speciespostings_planting_method[${speciesIndex}]`}
																			id={`speciespostings_planting_method[${speciesIndex}]`}
																		>
																			<option value="none">none</option>
																			<For each={uniquespecies.activities}>
																				{(acticity, i) => (
																					<Show
																						when={
																							uniquespecies.activities[i()]
																								.subtype === "method"
																						}
																					>
																						<option
																							value={JSON.stringify(
																								acticity,
																								Object.keys(acticity).sort(),
																							)}
																						>
																							{
																								uniquespecies.activities[i()]
																									.name
																							}
																						</option>
																					</Show>
																				)}
																			</For>
																		</select>
																	</div>
																</div>

																<div class="col-lg-3">
																	<label
																		for={`speciespostings_pruning_cutting[${speciesIndex}]`}
																	>
																		Pruning/cutting
																	</label>
																	<div class="form-group">
																		<select
																			value={getInitialValue(
																				data()?.project.system.uniqueSpecies!,
																				uniquespecies,
																				"pruning",
																			)}
																			name={`speciespostings_pruning_cutting[${speciesIndex}]`}
																			id={`speciespostings_pruning_cutting[${speciesIndex}]`}
																		>
																			<option value="none">none</option>

																			<For each={uniquespecies.activities}>
																				{(acticity, i) => (
																					<Show
																						when={
																							uniquespecies.activities[i()]
																								.subtype === "pruning"
																						}
																					>
																						<>
																							{/*
																{console.log('Planting mat', JSON.stringify(acticity, Object.keys(acticity).sort()))}
																{console.log('Intiitial', getInitialValue(uniquespecies, 'pruning'))}
															*/}
																							<option
																								value={JSON.stringify(
																									acticity,
																									Object.keys(acticity).sort(),
																								)}
																							>
																								{
																									uniquespecies.activities[i()]
																										.name
																								}
																							</option>
																						</>
																					</Show>
																				)}
																			</For>
																		</select>
																	</div>
																</div>
																<div class="col-lg-3">
																	<label
																		for={`speciespostings_harvest_method[${speciesIndex}]`}
																	>
																		Harvest method type
																	</label>
																	<div class="form-group">
																		<select
																			value={getInitialValue(
																				data()?.project.system.uniqueSpecies!,
																				uniquespecies,
																				"harvest",
																			)}
																			name={`speciespostings_harvest_method[${speciesIndex}]`}
																			id={`speciespostings_harvest_method[${speciesIndex}]`}
																		>
																			<option value="none">none</option>

																			<For each={uniquespecies.activities}>
																				{(acticity, i) => (
																					<Show
																						when={
																							uniquespecies.activities[i()]
																								.subtype === "harvest"
																						}
																					>
																						<option
																							value={JSON.stringify(
																								acticity,
																								Object.keys(acticity).sort(),
																							)}
																						>
																							{
																								uniquespecies.activities[i()]
																									.name
																							}
																						</option>
																					</Show>
																				)}
																			</For>
																		</select>
																	</div>
																</div>
															</Row>
														</div>
													</div>
													{/* ))} */}
												</>
											)}
										</For>
									</div>

									<br />
									<A
										end={true}
										href={`/parcels/${params.parcelId}/layers/${
											params.layerId
										}/projects/${data()?.project._id}`}
										class="btn btn-dark"
									>
										<i class="fas fa-arrow-left" /> Back to scenario dashboard
									</A>
									<button type="submit" class="btn btn-dark">
										Save changes
									</button>
								</form>
							}
						>
							<For each={data()?.project.rows.filter((row) => row.sequence)}>
								{(row, rowIdx) => (
									<form method="post" action={SequenceActivitiesForm}>
										<input
											type="hidden"
											name="sequence"
											value={JSON.stringify(row.sequence)}
										/>
										<div>
											<p>
												<strong>{`${row.name} - ${row.sequence.name}`}</strong>
											</p>

											<div>
												<For each={row.sequence.uniqueSpecies}>
													{(uniqueSpeciesSequence) => (
														<>
															{/* {console.log('uniqueSpeciesSequence',uniqueSpeciesSequence)} */}
															{/* {[correctspecies().filter((species:SpeciesDocument)=>species.id === uniquespecies.id)].map((species2) => ( */}
															{/* {()=>{
											
											
										}()} */}
															<For
																each={[
																	data()?.species.find((species) => {
																		// console.log('test', species._id, uniqueSpeciesSequence.id)
																		return (species._id =
																			uniqueSpeciesSequence.id.toString());
																	}),
																]}
															>
																{(
																	uniquespecies: undefined | SpeciesDocument,
																	speciesIndex,
																) => (
																	<Show when={uniquespecies}>
																		<>
																			{uniquespecies.nameCommon}

																			<div class="card">
																				<div class="card-body">
																					<p>
																						{/* <strong>{species.nameCommon}</strong> */}
																					</p>
																					<Row>
																						<div class="col-lg-3">
																							<label
																								for={`speciespostings_planting_material[${speciesIndex}]`}
																							>
																								Planting material type
																							</label>
																							<div class="form-group">
																								<select
																									value={getInitialValue(
																										row.sequence.uniqueSpecies,
																										uniquespecies,
																										"plant",
																									)}
																									name={`speciespostings_planting_material[${speciesIndex}]`}
																									id={`speciespostings_planting_material[${speciesIndex}]`}
																								>
																									<option value="none">
																										none
																									</option>
																									<For
																										each={
																											uniquespecies.activities
																										}
																									>
																										{(acticity, i) => (
																											<>
																												<Show
																													when={
																														uniquespecies
																															.activities[i()]
																															.subtype ===
																														"plant"
																													}
																												>
																													<option
																														value={JSON.stringify(
																															acticity,
																															Object.keys(
																																acticity,
																															).sort(),
																														)}
																													>
																														{
																															uniquespecies
																																.activities[i()]
																																.name
																														}
																													</option>
																												</Show>
																											</>
																										)}
																									</For>
																								</select>
																							</div>
																						</div>
																						<div class="col-lg-3">
																							<label
																								for={`speciespostings_planting_method[${speciesIndex}]`}
																							>
																								Planting method type
																							</label>
																							<div class="form-group">
																								<select
																									value={getInitialValue(
																										row.sequence.uniqueSpecies,
																										uniquespecies,
																										"method",
																									)}
																									name={`speciespostings_planting_method[${speciesIndex}]`}
																									id={`speciespostings_planting_method[${speciesIndex}]`}
																								>
																									<option value="none">
																										none
																									</option>
																									<For
																										each={
																											uniquespecies.activities
																										}
																									>
																										{(acticity, i) => (
																											<Show
																												when={
																													uniquespecies
																														.activities[i()]
																														.subtype ===
																													"method"
																												}
																											>
																												<option
																													value={JSON.stringify(
																														acticity,
																														Object.keys(
																															acticity,
																														).sort(),
																													)}
																												>
																													{
																														uniquespecies
																															.activities[i()]
																															.name
																													}
																												</option>
																											</Show>
																										)}
																									</For>
																								</select>
																							</div>
																						</div>

																						<div class="col-lg-3">
																							<label
																								for={`speciespostings_pruning_cutting[${speciesIndex}]`}
																							>
																								Pruning/cutting
																							</label>
																							<div class="form-group">
																								<select
																									value={getInitialValue(
																										row.sequence.uniqueSpecies,
																										uniquespecies,
																										"pruning",
																									)}
																									name={`speciespostings_pruning_cutting[${speciesIndex}]`}
																									id={`speciespostings_pruning_cutting[${speciesIndex}]`}
																								>
																									<option value="none">
																										none
																									</option>

																									<For
																										each={
																											uniquespecies.activities
																										}
																									>
																										{(acticity, i) => (
																											<Show
																												when={
																													uniquespecies
																														.activities[i()]
																														.subtype ===
																													"pruning"
																												}
																											>
																												{" "}
																												? (
																												{/*
							{console.log('Planting mat', JSON.stringify(acticity, Object.keys(acticity).sort()))}
							{console.log('Intiitial', getInitialValue(uniquespecies, 'pruning'))}
						*/}
																												<option
																													value={JSON.stringify(
																														acticity,
																														Object.keys(
																															acticity,
																														).sort(),
																													)}
																												>
																													{
																														uniquespecies
																															.activities[i()]
																															.name
																													}
																												</option>
																											</Show>
																										)}
																									</For>
																								</select>
																							</div>
																						</div>
																						<div class="col-lg-3">
																							<label
																								for={`speciespostings_harvest_method[${speciesIndex}]`}
																							>
																								Harvest method type
																							</label>
																							<div class="form-group">
																								<select
																									value={getInitialValue(
																										row.sequence.uniqueSpecies,
																										uniquespecies,
																										"harvest",
																									)}
																									name={`speciespostings_harvest_method[${speciesIndex}]`}
																									id={`speciespostings_harvest_method[${speciesIndex}]`}
																								>
																									<option value="none">
																										none
																									</option>

																									<For
																										each={
																											uniquespecies.activities
																										}
																									>
																										{(acticity, i) => (
																											<Show
																												when={
																													uniquespecies
																														.activities[i()]
																														.subtype ===
																													"harvest"
																												}
																											>
																												<option
																													value={JSON.stringify(
																														acticity,
																														Object.keys(
																															acticity,
																														).sort(),
																													)}
																												>
																													{
																														uniquespecies
																															.activities[i()]
																															.name
																													}
																												</option>
																											</Show>
																										)}
																									</For>
																								</select>
																							</div>
																						</div>
																					</Row>
																				</div>
																			</div>
																		</>
																	</Show>
																)}
															</For>
														</>
													)}
												</For>
											</div>

											<br />
											<button type="submit" class="btn btn-dark">
												Save changes
											</button>
											<br />
											<br />
										</div>
									</form>
								)}
							</For>
						</Show>
					</div>
				</div>
			</div>
			{/* </div>
        </div> */}
			{/* </ScenarioSideBar> */}
		</>
	);
}
