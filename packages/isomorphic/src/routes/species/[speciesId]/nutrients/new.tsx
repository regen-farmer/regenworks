import MPObj from "multipart-object";
import { Show, createResource } from "solid-js";
import { action } from "@solidjs/router";
import { useParams, useNavigate } from "@solidjs/router";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
	const params = useParams<{
		speciesId: string;
	}>();

	const [data, { refetch }] = createResource<{
		species: SpeciesDocument;
	}>(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/species/${params.speciesId}`,
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

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/species/${
				params.speciesId
			}/nutrients`,
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
					<div class="col-sm-3" />
					<div class="col-sm-6">
						<h1 class="h1">Add nutrient profile for species</h1>
						<p>
							Use this page to create activity templates for species that are
							used to auto-generate activities for projects.
						</p>
						<form method="post" action={Form}>
							<div class="form-group">
								<label for="nutrients[protein]">Protein</label>
								<input
									type="number"
									value={data()?.species.nutrients?.protein}
									class="form-control"
									name="nutrients[protein]"
									min="0"
									max="100"
									required
								/>
							</div>
							<div class="form-group">
								<label for="nutrients[fat]">Fat</label>
								<input
									type="number"
									value={data()?.species.nutrients?.fat}
									class="form-control"
									name="nutrients[fat]"
									min="0"
									max="100"
									required
								/>
							</div>
							<div class="form-group">
								<label for="nutrients[carb]">Carbs</label>
								<input
									type="number"
									value={data()?.species.nutrients?.carb}
									class="form-control"
									name="nutrients[carb]"
									min="0"
									max="100"
									required
								/>
							</div>
							<div class="form-group">
								<button type="submit" class="rounded-sm p-1 m-1 btn-default">
									Add nutrient profile
								</button>
							</div>
						</form>
					</div>
					<div class="col-sm-3" />
				</div>
			</div>
		</Show>
	);
}
