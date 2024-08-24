import { useNavigate, useParams } from "@solidjs/router";
import MPObj from "multipart-object";
import { action } from "@solidjs/router";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
	const navigate = useNavigate();
	const params = useParams();

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

		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/species`,
			{
				body: JSON.stringify(payload),
				method: "post",
				...apiFetchOptions(),
			},
		);

		const species: SpeciesDocument = await response.json();

		navigate(`/species/${species._id}`);
	});

	return (
		<div class="container">
			<div class="row">
				<div class="col-lg-3" />
				<div class="col-lg-6">
					<h1 class="h1">Create new species</h1>
					<form method="post" action={Form}>
						<div class="form-group">
							<label for="species[nameCommon]">Species common name</label>
							<input
								type="text"
								class="form-control"
								name="species[nameCommon]"
								placeholder="Common name is species"
								required
							/>
						</div>
						<div class="form-group">
							<label for="species[genus]">Genus</label>
							<input
								type="text"
								class="form-control"
								name="species[genus]"
								required
							/>
						</div>
						<div class="form-group">
							<label for="species[species]">Species</label>
							<input
								type="text"
								class="form-control"
								name="species[species]"
								required
							/>
						</div>
						<div class="form-group">
							<label for="species[family]">Family</label>
							<input
								type="text"
								class="form-control"
								name="species[family]"
								required
							/>
						</div>
						<div class="form-group">
							<label for="species[climate]">Climate</label>
							<select class="form-control" name="species[climate]">
								<option value="boreal">Boreal</option>
								<option value="temperate">Temperate</option>
								<option value="subtropic">Subtropic</option>
								<option value="tropic">Tropic</option>
							</select>
						</div>
						<div class="form-group">
							<label for="species[humidity]">Humidity</label>
							<select class="form-control" name="species[humidity]">
								<option value="arid">Arid</option>
								<option value="semiarid">Semi-arid</option>
								<option value="humid">Humid</option>
							</select>
						</div>
						<div class="form-group">
							<label for="species[form]">Form</label>
							<select class="form-control" name="species[form]">
								<option value="bamboo">Bamboo</option>
								<option value="cactus">Cactus</option>
								<option value="cycad">Cycad</option>
								<option value="giantherb">Giant Herb</option>
								<option value="grass">Grass</option>
								<option value="herb">Herb</option>
								<option value="palm">Palm</option>
								<option value="shrub">Shrub</option>
								<option value="succulent">Succulent</option>
								<option value="tree">Tree</option>
								<option value="vine">Vine</option>
							</select>
						</div>
						<div class="form-group">
							<label for="species[precipitation][min]">Min precipitation</label>
							<input
								type="number"
								class="form-control"
								name="species[precipitation][min]"
							/>
						</div>
						<div class="form-group">
							<label for="species[precipitation][max]">Max precipitation</label>
							<input
								type="number"
								class="form-control"
								name="species[precipitation][max]"
							/>
						</div>
						<div class="form-group">
							<label for="species[temperature][min]">Min temp</label>
							<input
								type="number"
								class="form-control"
								name="species[temperature][min]"
							/>
						</div>
						<div class="form-group">
							<label for="species[temperature][max]">Max temp</label>
							<input
								type="number"
								class="form-control"
								name="species[temperature][max]"
							/>
						</div>
						<div class="form-group">
							<label for="species[height]">Mature height</label>
							<input
								type="number"
								step=".01"
								class="form-control"
								name="species[height]"
							/>
						</div>
						<div class="form-group">
							<label for="species[classsyntropic][strata]">
								Syntropic strata
							</label>
							<select
								class="form-control"
								name="species[classsyntropic][strata]"
							>
								<option value="emergent">Emergent</option>
								<option value="high">High</option>
								<option value="medium">Medium</option>
								<option value="low">Low</option>
							</select>
						</div>
						<div class="form-group">
							<label for="species[classsyntropic][lifecycle]">
								Syntropic lifecycle
							</label>
							<select
								class="form-control"
								name="species[classsyntropic][lifecycle]"
							>
								<option value="placenta">Placenta</option>
								<option value="secondary">Secondary</option>
								<option value="climax">Climax</option>
							</select>
						</div>
						<div class="form-group">
							<label for="species[lifespan]">Species lifespan</label>
							<input
								type="number"
								class="form-control"
								name="species[lifespan]"
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
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="timber"
											autocomplete="off"
										/>{" "}
										Timber
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="food"
											autocomplete="off"
										/>{" "}
										Food
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="biomass"
											autocomplete="off"
										/>{" "}
										Biomass
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="fodder"
											autocomplete="off"
										/>{" "}
										Fodder
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="nitrogen"
											autocomplete="off"
										/>{" "}
										Nitrogen
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="shade"
											autocomplete="off"
										/>{" "}
										Shade
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="fiber"
											autocomplete="off"
										/>{" "}
										Fiber
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="spice"
											autocomplete="off"
										/>{" "}
										Spice/Scent
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="medicinal"
											autocomplete="off"
										/>{" "}
										Medicinal
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="oil"
											autocomplete="off"
										/>{" "}
										Oil
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="wax"
											autocomplete="off"
										/>{" "}
										Wax
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="gum"
											autocomplete="off"
										/>{" "}
										Gum
									</label>
									<label class="btn btn-dark">
										<input
											type="checkbox"
											name="species[utilities]"
											value="pesticide"
											autocomplete="off"
										/>{" "}
										Pesticide
									</label>
								</div>
							</div>
						</div>
						<div class="form-group">
							<label for="species[price]">Price</label>
							<input type="number" class="form-control" name="species[price]" />
						</div>
						<div class="form-group">
							<button type="submit" class="btn btn-dark">
								Create new species
							</button>
						</div>
					</form>
				</div>
				<div class="col-lg-3" />
			</div>
		</div>
	);
}
