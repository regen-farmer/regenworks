import { useLocation } from "@solidjs/router";
import MPObj from "multipart-object";
import { Show, createResource } from "solid-js";
import { action } from "@solidjs/router";
import { useParams, useNavigate } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
	const location = useLocation();
	const params = useParams<{
		speciesId: string;
	}>();

	const [data, { refetch }] = createResource(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/species/${params.speciesId}?index=${
				location.query.index
			}`,
			apiFetchOptions(),
		);
		return await response.json();
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

		const payload = parser.validateData;

		console.log(payload);

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/species/${params.speciesId}`,
			{
				body: JSON.stringify(payload),
				method: "put",
				...apiFetchOptions(),
			},
		);

		navigate(`/species/${params.speciesId}`);
	});

	return (
		<Show when={data()}>
			<div class="container">
				<div class="row">
					<div class="col-lg-3" />
					<div class="col-lg-6">
						<h1 class="h1">Update species {data()?.species.nameCommon}</h1>
						<form method="post" action={Form}>
							<div class="form-group">
								<label for="species[nameCommon]">Species common name</label>
								<input
									type="text"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[nameCommon]"
									value={data()?.species.nameCommon}
									required
								/>
							</div>
							<div class="form-group">
								<label for="species[genus]">Genus</label>
								<input
									type="text"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[genus]"
									value={data()?.species.genus}
									required
								/>
							</div>
							<div class="form-group">
								<label for="species[species]">Species</label>
								<input
									type="text"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[species]"
									value={data()?.species.species}
									required
								/>
							</div>
							<div class="form-group">
								<label for="species[family]">Family</label>
								<input
									type="text"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[family]"
									value={data()?.species.family}
									required
								/>
							</div>
							<div class="form-group">
								<label for="species[climate]">Climate</label>
								<select class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600" name="species[climate]">
									{data()?.species.climate === "boreal" ? (
										<option selected value="boreal">
											Boreal
										</option>
									) : (
										<option value="boreal">Boreal</option>
									)}
									{data()?.species.climate === "temperate" ? (
										<option selected value="temperate">
											Temperate
										</option>
									) : (
										<option value="temperate">Temperate</option>
									)}
									{data()?.species.climate === "subtropic" ? (
										<option selected value="subtropic">
											Subtropic
										</option>
									) : (
										<option value="subtropic">Subtropic</option>
									)}
									{data()?.species.climate === "tropic" ? (
										<option selected value="tropic">
											Tropic
										</option>
									) : (
										<option value="tropic">Tropic</option>
									)}
								</select>
							</div>
							<div class="form-group">
								<label for="species[humidity]">Humidity</label>
								<select class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600" name="species[humidity]">
									{data()?.species.humidity === "arid" ? (
										<option selected value="arid">
											Arid
										</option>
									) : (
										<option value="arid">Arid</option>
									)}
									{data()?.species.humidity === "semiarid" ? (
										<option selected value="semiarid">
											Semi-arid
										</option>
									) : (
										<option value="semiarid">Semi-arid</option>
									)}
									{data()?.species.humidity === "humid" ? (
										<option selected value="humid">
											Humid
										</option>
									) : (
										<option value="humid">Humid</option>
									)}
								</select>
							</div>
							<div class="form-group">
								<label for="species[form]">Form</label>
								<select class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600" name="species[form]">
									{data()?.species.form === "bamboo" ? (
										<option selected value="bamboo">
											Bamboo
										</option>
									) : (
										<option value="bamboo">Bamboo</option>
									)}
									{data()?.species.form === "cactus" ? (
										<option selected value="cactus">
											Cactus
										</option>
									) : (
										<option value="cactus">Cactus</option>
									)}
									{data()?.species.form === "cycad" ? (
										<option selected value="cycad">
											Cycad
										</option>
									) : (
										<option value="cycad">Cycad</option>
									)}
									{data()?.species.form === "giantherb" ? (
										<option selected value="giantherb">
											Giant herb
										</option>
									) : (
										<option value="giantherb">Giant Herb</option>
									)}
									{data()?.species.form === "grass" ? (
										<option selected value="grass">
											Grass
										</option>
									) : (
										<option value="grass">Grass</option>
									)}
									{data()?.species.form === "herb" ? (
										<option selected value="herb">
											Herb
										</option>
									) : (
										<option value="herb">Herb</option>
									)}
									{data()?.species.form === "palm" ? (
										<option selected value="palm">
											Palm
										</option>
									) : (
										<option value="palm">Palm</option>
									)}
									{data()?.species.form === "shrub" ? (
										<option selected value="shrub">
											Shrub
										</option>
									) : (
										<option value="shrub">Shrub</option>
									)}
									{data()?.species.form === "succulent" ? (
										<option selected value="succulent">
											Succulent
										</option>
									) : (
										<option value="succulent">Succulent</option>
									)}
									{data()?.species.form === "tree" ? (
										<option selected value="tree">
											Tree
										</option>
									) : (
										<option value="tree">Tree</option>
									)}
									{data()?.species.form === "vine" ? (
										<option selected value="vine">
											Vine
										</option>
									) : (
										<option value="vine">Vine</option>
									)}
								</select>
							</div>
							<div class="form-group">
								<label for="species[precipitation][min]">
									Min precipitation
								</label>
								<input
									type="number"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[precipitation][min]"
									value={data()?.species.precipitation.min}
								/>
							</div>
							<div class="form-group">
								<label for="species[precipitation][max]">
									Max precipitation
								</label>
								<input
									type="number"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[precipitation][max]"
									value={data()?.species.precipitation.max}
								/>
							</div>
							<div class="form-group">
								<label for="species[temperature][min]">Min temp</label>
								<input
									type="number"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[temperature][min]"
									value={data()?.species.temperature.min}
								/>
							</div>
							<div class="form-group">
								<label for="species[temperature][max]">Max temp</label>
								<input
									type="number"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[temperature][max]"
									value={data()?.species.temperature.max}
								/>
							</div>
							<div class="form-group">
								<label for="species[height]">Mature height</label>
								<input
									type="number"
									step=".01"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[height]"
									value={data()?.species.height}
								/>
							</div>
							<div class="form-group">
								<label for="species[classsyntropic][strata]">
									Syntropic strata
								</label>
								<select
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[classsyntropic][strata]"
								>
									{data()?.species.classsyntropic.strata === "emergent" ? (
										<option selected value="emergent">
											Emergent
										</option>
									) : (
										<option value="emergent">Emergent</option>
									)}
									{data()?.species.classsyntropic.strata === "high" ? (
										<option selected value="high">
											High
										</option>
									) : (
										<option value="high">High</option>
									)}
									{data()?.species.classsyntropic.strata === "medium" ? (
										<option selected value="medium">
											Medium
										</option>
									) : (
										<option value="medium">Medium</option>
									)}
									{data()?.species.classsyntropic.strata === "low" ? (
										<option selected value="low">
											Low
										</option>
									) : (
										<option value="low">Low</option>
									)}
								</select>
							</div>
							<div class="form-group">
								<label for="species[classsyntropic][lifecycle]">
									Syntropic lifecycle
								</label>
								<select
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[classsyntropic][lifecycle]"
								>
									{data()?.species.classsyntropic.lifecycle === "placenta" ? (
										<option selected value="placenta">
											Placenta
										</option>
									) : (
										<option value="placenta">Placenta</option>
									)}
									{data()?.species.classsyntropic.lifecycle === "secondary" ? (
										<option selected value="secondary">
											Secondary
										</option>
									) : (
										<option value="secondary">Secondary</option>
									)}
									{data()?.species.classsyntropic.lifecycle === "climax" ? (
										<option selected value="climax">
											Climax
										</option>
									) : (
										<option value="climax">Climax</option>
									)}
								</select>
							</div>
							<div class="form-group">
								<label for="species[lifespan]">Species lifespan</label>
								<input
									type="number"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[lifespan]"
									value={data()?.species.lifespan}
								/>
							</div>
							<label for="species[utilities]">Species utility</label>
							<p>Choose all that apply</p>
							<div
								class="form-check btn-group btn-group-toggle"
								data-toggle="buttons"
							>
								<div class="card">
									<div class="card-body">
										{data()?.species.utilities.indexOf("fodder")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="fodder"
													autocomplete="off"
												/>{" "}
												Fodder
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="fodder"
													autocomplete="off"
												/>{" "}
												Fodder
											</label>
										)}
										{data()?.species.utilities.indexOf("timber")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="timber"
													autocomplete="off"
												/>{" "}
												Timber
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="timber"
													autocomplete="off"
												/>{" "}
												Timber
											</label>
										)}
										{data()?.species.utilities.indexOf("food")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="food"
													autocomplete="off"
												/>{" "}
												Food
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="food"
													autocomplete="off"
												/>{" "}
												Food
											</label>
										)}
										{data()?.species.utilities.indexOf("biomass")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="biomass"
													autocomplete="off"
												/>{" "}
												Biomass
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="biomass"
													autocomplete="off"
												/>{" "}
												Biomass
											</label>
										)}
										{data()?.species.utilities.indexOf("nitrogen")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="nitrogen"
													autocomplete="off"
												/>{" "}
												Nitrogen
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="nitrogen"
													autocomplete="off"
												/>{" "}
												Nitrogen
											</label>
										)}
										{data()?.species.utilities.indexOf("shade")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="shade"
													autocomplete="off"
												/>{" "}
												Shade
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="shade"
													autocomplete="off"
												/>{" "}
												Shade
											</label>
										)}
										{data()?.species.utilities.indexOf("fiber")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="fiber"
													autocomplete="off"
												/>{" "}
												Fiber
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="fiber"
													autocomplete="off"
												/>{" "}
												Fiber
											</label>
										)}
										{data()?.species.utilities.indexOf("spice")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="spice"
													autocomplete="off"
												/>{" "}
												Spice/Scent
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="spice"
													autocomplete="off"
												/>{" "}
												Spice/Scent
											</label>
										)}
										{data()?.species.utilities.indexOf("medicinal")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="medicinal"
													autocomplete="off"
												/>{" "}
												Medicinal
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="medicinal"
													autocomplete="off"
												/>{" "}
												Medicinal
											</label>
										)}
										{data()?.species.utilities.indexOf("oil")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="oil"
													autocomplete="off"
												/>{" "}
												Oil
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="oil"
													autocomplete="off"
												/>{" "}
												Oil
											</label>
										)}
										{data()?.species.utilities.indexOf("wax")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="wax"
													autocomplete="off"
												/>{" "}
												Wax
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="wax"
													autocomplete="off"
												/>{" "}
												Wax
											</label>
										)}
										{data()?.species.utilities.indexOf("gum")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="gum"
													autocomplete="off"
												/>{" "}
												Gum
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="gum"
													autocomplete="off"
												/>{" "}
												Gum
											</label>
										)}
										{data()?.species.utilities.indexOf("pesticide")! > -1 ? (
											<label class="rounded-sm p-1 my-2 btn-default active">
												<input
													type="checkbox"
													name="species[utilities]"
													checked
													value="pesticide"
													autocomplete="off"
												/>{" "}
												Pesticide
											</label>
										) : (
											<label class="rounded-sm p-1 my-2 btn-default">
												<input
													type="checkbox"
													name="species[utilities]"
													value="pesticide"
													autocomplete="off"
												/>{" "}
												Pesticide
											</label>
										)}
									</div>
								</div>
							</div>
							<div class="form-group">
								<label for="species[price]">Price</label>
								<input
									type="number"
									class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
									name="species[price]"
									value={data()?.species.price}
								/>
							</div>
							<div class="form-group">
								<button type="submit" class="rounded-sm p-1 my-2 btn-default">
									Update species
								</button>
							</div>
						</form>
					</div>
					<div class="col-lg-3" />
				</div>
			</div>
		</Show>
	);
}
