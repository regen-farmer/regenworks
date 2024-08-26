import { createMemo, createResource, For, Show } from "solid-js";
import { action } from "@solidjs/router";
import { A, useParams } from "@solidjs/router";
import type { AnimalDocument } from "@rw/db/schemas/animal.ts";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import MPObj from "multipart-object";
import { useLocation, useNavigate } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { Row } from "~/components/row/Row";

export default function view() {
	const location = useLocation();
	const params = useParams<{
		systemId: string;
	}>();

	const [data, { refetch }] = createResource(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/systems/${params.systemId}/edit?${
				location.query.row ? `row=${location.query.row}` : ""
			}`,
			apiFetchOptions(),
		);
		const returnval: {
			system: SystemDocument;
			species: SpeciesDocument[];
			animals: AnimalDocument[];
			rows: {
				row: number;
				array: {
					species: SpeciesDocument;
					position: number[];
					width: number;
				}[];
			}[];
			distance: number;
			length: number;
			newrow: number;
		} = await response.json();

		return returnval;
	});

	const navigate = useNavigate();

	const Form = action(async (formData: FormData) => {
		//
		// console.log('formdata: ', formData)
		const formDataObj = {};
		// @ts-ignore
		formData.forEach((value, key) => {
			formDataObj[key] = value;

			return formDataObj;
		});
		console.log("test1", formDataObj);
		const parser = new MPObj.NestedParser(formDataObj, {
			separator: "bracket",
		});
		console.log("test2", parser.isValid());
		// console.log('isvalid', parser.isValid())
		// console.log('validatedata', parser.validateData)

		// console.log(formDataObj)

		const payload = parser.validateData;

		console.log(payload);

		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/systems/${params.systemId}`,
			{
				body: JSON.stringify(payload),
				method: "put",
				...apiFetchOptions(),
			},
		);

		console.log(await response.json());

		navigate(`/systems/${params.systemId}`);
	});

	const rowAfter = createMemo(() => {
		const rowAfter: number[] = [];
		data()?.rows.forEach((row, j) => {
			if (j + 1 <= data()?.newrow! || data()?.newrow === -1) {
				rowAfter[j] = 0;
			} else {
				rowAfter[j] = 1;
			}
		});
		return rowAfter;
	}, []);

	const xPosition = createMemo(() => {
		const xPosition: number[] = [];
		data()?.rows.forEach((row, j) => {
			if (j === 0) {
				xPosition[j] = data()?.rows[j].array[0].position[0]!;
			} else {
				xPosition[j] =
					data()?.rows[j].array[0].position[0]! -
					data()?.rows[j - 1].array[0].position[0]!;
			}
		});
		return xPosition;
	}, []);

	const extentrows = createMemo(() => (data()?.newrow! > -1 ? 1 : 0), 0);

	return (
		<>
			<Show when={data()}>
				<Row>
					<div class="col-lg-12">
						<h1 class="h1">Update agroforestry system model "{data()?.system.name}"</h1>
						<p>This page lets you update your agroforestry system model.</p>
						<form method="post" action={Form}>
							<div class="form-group">
								<label for="system[name]">System name</label>
								<input
									type="text"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="system[name]"
									value={data()?.system.name}
									required
								/>
							</div>
							<div class="form-group">
								<label for="system[description]">Description</label>
								<input
									type="text"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="system[description]"
									value={data()?.system.description}
								/>
							</div>
							<div />
							<div class="form-group">
								<label for="system[animals][0]">
									Animals in system (If any)
								</label>
								<select name="system[animals][0]">
									<option value="">none</option>
									<For each={data()?.system.animals}>
										{(animal) => (
											<option value={animal._id.toString()} selected>
												{animal.name} (existing)
											</option>
										)}
									</For>
								</select>
							</div>
							<div class="form-check">
								{data()?.system.shared === true ? (
									<input
										type="checkbox"
										name="system[shared]"
										id="exampleRadios1"
										class="form-check-input"
										checked
										autocomplete="off"
									/>
								) : (
									<input
										type="checkbox"
										name="system[shared]"
										id="exampleRadios1"
										class="form-check-input"
										autocomplete="off"
									/>
								)}
								<label class="form-check-label" for="exampleRadios1">
									Share this system with other farmers
								</label>
							</div>
							<h3 class="h3">System model</h3>
							<Row>
								<Show when={data()?.newrow === 0}>
									<div
										class={`col-lg-${Math.floor(
											12 / (data()?.rows.length! + extentrows()),
										)}`}
									>
										<h5>Row {1}</h5>
										<div class="form-group">
											<label for={`system[model][${data()?.newrow}][width]`}>
												Row width
											</label>
											<input
												type="number"
												step=".01"
												class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
												name={`system[model][${data()?.newrow}][width]`}
												value={1}
												required
											/>
										</div>
										<div class="form-group">
											<label for={`system[model][${data()?.newrow}][distance]`}>
												Distance to next row
											</label>
											<input
												type="number"
												step=".01"
												class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
												name={`system[model][${data()?.newrow}][distance]`}
												value={1}
												required
											/>
										</div>
										<For
											each={[
												...Array(data()?.length! / data()?.distance!).keys(),
											]}
										>
											{(i) => (
												<div class="card">
													<div class="card-body">
														<select
															name={`system[model][${
																data()?.newrow
															}][species][id]`}
															style="width:100%;max-width:100%;"
														>
															<option value="">none</option>
															<For each={data()?.species}>
																{(species) => (
																	<option value={species._id}>
																		{species.nameCommon}
																	</option>
																)}
															</For>
														</select>
														<input
															type="hidden"
															name={`system[model][${
																data()?.newrow
															}][species][y]`}
															value={data()?.length! - i * data()?.distance!}
														/>
														<p>
															Row position:{" "}
															{data()?.length! - i * data()?.distance!} m
														</p>
													</div>
												</div>
											)}
										</For>
									</div>
								</Show>
								<For each={data()?.rows}>
									{(row, j) => (
										<>
											<div
												class={`col-lg-${Math.floor(
													12 / (data()?.rows.length! + extentrows()),
												)}`}
											>
												<h5>Row {j() + 1 + rowAfter()[j()]}</h5>
												<div class="form-group">
													<label
														for={`system[model][${
															j() + rowAfter()[j()]
														}][width]`}
													>
														Row width
													</label>
													<input
														type="number"
														step=".01"
														class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
														name={`system[model][${
															j() + rowAfter()[j()]
														}][width]`}
														value={data()?.rows[j()].array[0].width}
														required
													/>
												</div>
												<div class="form-group">
													<label
														for={`system[model][${
															j() + rowAfter()[j()]
														}][distance]`}
													>
														Distance to next row
													</label>
													<input
														type="number"
														step=".01"
														class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
														name={`system[model][${
															j() + rowAfter()[j()]
														}][distance]`}
														value={xPosition()[j()] + rowAfter()[j()]}
														required
													/>
												</div>
												<For
													each={[
														...Array(
															data()?.length! / data()?.distance!,
														).keys(),
													]}
												>
													{(i) => (
														<div class="card">
															<div class="card-body">
																<select
																	name={`system[model][${
																		j() + rowAfter()[j()]
																	}][species][${i}][id]`}
																	style="width:100%;max-width:100%;"
																>
																	<option value="">none</option>
																	<For each={data()?.species}>
																		{(species, s) => (
																			<option
																				value={species._id}
																				selected={data()
																					?.rows[j()].array.map(
																						(currentArrayEl) =>
																							currentArrayEl.position[1] ===
																								data()?.length! -
																									i * data()?.distance! &&
																							currentArrayEl.species
																								.nameCommon ===
																								species.nameCommon,
																					)
																					.includes(true)}
																			>
																				{species.nameCommon}
																			</option>
																		)}
																	</For>
																</select>
																<input
																	type="hidden"
																	name={`system[model][${
																		j() + rowAfter()[j()]
																	}][species][${i}][y]`}
																	value={
																		data()?.length! - i * data()?.distance!
																	}
																/>
																<p>
																	Row position:{" "}
																	{data()?.length! - i * data()?.distance!} m
																</p>
															</div>
														</div>
													)}
												</For>
												<Show when={data()?.newrow! < 0}>
													<>
														<Show when={j() === 0}>
															<A
																class="rounded-sm p-1 my-2 btn-default"
																href={`/systems/${
																	data()?.system._id
																}/edit?row=0`}
															>
																{"<-- new row"}
															</A>
														</Show>
														<A
															class="rounded-sm p-1 my-2 btn-default"
															href={`/systems/${data()?.system._id}/edit?row=${
																j() + 1
															}`}
														>
															{"new row -->"}
														</A>
													</>
												</Show>
											</div>
											<Show when={j() + 1 === data()?.newrow}>
												<div
													class={`col-lg-${Math.floor(
														12 / (data()?.rows.length! + extentrows()),
													)}`}
												>
													<h5>Row {data()?.newrow! + 1}</h5>
													<div class="form-group">
														<label
															for={`system[model][${data()?.newrow}][width]`}
														>
															Row width
														</label>
														<input
															type="number"
															step=".01"
															class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
															name={`system[model][${data()?.newrow}][width]`}
															value={1}
															required
														/>
													</div>
													<div class="form-group">
														<label
															for={`system[model][${data()?.newrow}][distance]`}
														>
															Distance to next row
														</label>
														<input
															type="number"
															step=".01"
															class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
															name={`system[model][${
																data()?.newrow
															}][distance]`}
															value={1}
															required
														/>
													</div>
													<For
														each={[
															...Array(
																data()?.length! / data()?.distance!,
															).keys(),
														]}
													>
														{(i) => (
															<div class="card">
																<div class="card-body">
																	<select
																		name={`system[model][${
																			data()?.newrow
																		}][species][id]`}
																		style="width:100%;max-width:100%;"
																	>
																		<option value="">none</option>
																		<For each={data()?.species}>
																			{(species) => (
																				<option value={species._id}>
																					{species.nameCommon}
																				</option>
																			)}
																		</For>
																	</select>
																	<input
																		type="hidden"
																		name={`system[model][${
																			data()?.newrow
																		}][species][y]`}
																		value={
																			data()?.length! - i * data()?.distance!
																		}
																	/>
																	<p>
																		Row position:{" "}
																		{data()?.length! - i * data()?.distance!} m
																	</p>
																</div>
															</div>
														)}
													</For>
												</div>
											</Show>
										</>
									)}
								</For>
							</Row>
							<Show
								when={
									data()?.distance! >= 1 && Number.isInteger(data()?.distance)
								}
							>
								<div class="card">
									<div class="card-body">
										<A
											class="rounded-sm p-1 my-2 btn-default"
											href={`/systems/${data()?.system._id}/edit?distance=2`}
										>
											Change inter-row spacing to {data()?.distance! / 2}
										</A>
									</div>
								</div>
							</Show>
							<div class="form-group">
								<button type="submit" class="rounded-sm p-1 my-2 btn-default mt-3">
									Update system
								</button>
							</div>
						</form>
					</div>
				</Row>
			</Show>
		</>
	);
}
