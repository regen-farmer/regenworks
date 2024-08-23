import { createResource } from "solid-js";
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
		const payload = {
			activity: {
				name: formData.get("activity[name]")?.toString()!,
				activityType: formData.get("activity[activityType]")?.toString()!,
				price: formData.get("activity[price]")?.toString()!,
				time: {
					startMonth: formData.get("activity[time][startMonth]")?.toString()!,
					endMonth: formData.get("activity[time][endMonth]")?.toString()!,
				},
			},
		};

		await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/species/${
				params.speciesId
			}/activities`,
			{
				body: JSON.stringify(payload),
				method: "post",
				...apiFetchOptions(),
			},
		);

		navigate(`/species/${params.speciesId}`);
	});

	return (
		<div class="container">
			<div class="row">
				<div class="col-sm-3" />
				<div class="col-sm-6">
					<h1 class="h1">Add new activity to species</h1>
					<p>
						Use this page to create activity templates for species that are used
						to auto-generate activities for projects.
					</p>
					<form method="post" action={Form}>
						<div class="form-group">
							<label for="activity[name]">Activity name</label>
							<input
								type="text"
								class="form-control"
								name="activity[name]"
								placeholder="Give the activity a name"
								required
							/>
						</div>
						<div class="form-group">
							<label for="activity[activityType]">Activity type</label>
							<select name="activity[activityType]" id="activity[activityType]">
								<option value="establish bed">Establishment - Bed prep</option>
								<option value="establish plant">
									Establishment - Planting material
								</option>
								<option value="establish method">
									Establishment - Planting method
								</option>
								<option value="manage compost">Management - Compost</option>
								<option value="manage pruning">
									Management - Pruning method
								</option>
								<option value="manage weedcontrol">
									Management - Weed control
								</option>
								<option value="manage animalcontrol">
									Management - Animal control
								</option>
								<option value="manage harvest">
									Management - Harvest method
								</option>
							</select>
						</div>
						<div class="form-group">
							<label for="activity[time][startMonth]">
								Earliest performed month
							</label>
							<input
								type="number"
								class="form-control"
								name="activity[time][startMonth]"
								min="1"
								max="12"
								required
							/>
						</div>
						<div class="form-group">
							<label for="activity[time][endMonth]">
								Latest performed month
							</label>
							<input
								type="number"
								class="form-control"
								name="activity[time][endMonth]"
								min="1"
								max="12"
								required
							/>
						</div>
						<div class="form-group">
							<label for="activity[price]">Price in USD</label>
							<input
								type="number"
								step=".01"
								class="form-control"
								name="activity[price]"
							/>
						</div>
						<div class="form-group">
							<button type="submit" class="btn btn-dark">
								Create new species activity
							</button>
						</div>
					</form>
				</div>
				<div class="col-sm-3" />
			</div>
		</div>
	);
}
