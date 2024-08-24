import { A, useParams } from "@solidjs/router";
import { For, Show, createResource } from "solid-js";
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

	return (
		<Show when={data()}>
			<div class="container">
				<h1 class="h1">{data()?.species.nameCommon}</h1>
				<A class="rounded-sm p-1 m-1 btn-dark" href="/species/">
					Species index
				</A>
				<div class="row">
					<div class="col-sm-2">
						<img
							class="img-responsive"
							src={`/images/${data()?.species.form}.svg`}
						/>
						<A
							class="rounded-sm p-1 m-1 btn-dark"
							href={`/species/${data()?.species._id}/edit`}
						>
							Edit species details
						</A>
						<form
							class="delete-form"
							action={`/species/${data()?.species._id}?_method=DELETE`}
							method="post"
						>
							<button type="button" class="rounded-sm p-1 m-1 btn-danger">
								Delete species
							</button>
						</form>
						<A
							class="rounded-sm p-1 m-1 btn-dark"
							href={`/species/${data()?.species._id}/activities/new`}
						>
							Add new activity to species
						</A>
						<A
							class="rounded-sm p-1 m-1 btn-dark"
							href={`/species/${data()?.species._id}/nutrients/new`}
						>
							Update nutrients profile
						</A>
					</div>
					<div class="col-sm-2">
						<p>
							Name: {data()?.species.genus} {data()?.species.species}
						</p>
						<p>Type: {data()?.species.form}</p>
						<p>Mature height: {data()?.species.height} m</p>
						<Show when={data()?.species.flows}>
							<p>{data()?.species.flows[0]?.data}</p>
						</Show>
					</div>
					{/* <div class="col-sm-2">
            <h2 class="h2">Yield</h2>
            <p>Yield type: Nuts</p>
        </div> */}
					<div class="col-sm-8 card">
						<h2 class="h2">Activities</h2>
						<Show when={data()?.species.activities}>
							<>
								<p>
									<strong>Activity amounts:</strong>{" "}
									{data()?.species.activities.length}{" "}
								</p>

								<For each={data()?.species.activities}>
									{(spec, i) => (
										<div class="card-body">
											<p class="card-text">
												{data()?.species.activities[i()].name}{" "}
												{data()?.species.activities[i()].activityType} +{" "}
												{data()?.species.activities[i()].subtype}
											</p>
											<A
												class="rounded-sm p-1 m-1 btn-sm btn-dark"
												href={`/species/${
													data()?.species._id
												}/activities/edit?index=${i}`}
											>
												Edit activity
											</A>
										</div>
									)}
								</For>
							</>
						</Show>
					</div>

					{/* <div class="col-sm-6"><canvas id="lineChart"></canvas></div> */}

					{/* </div>
    <div class="row">
        <div class="col-sm-2">
        </div>
        <div class="col-sm-2">
        </div>
        <div class="col-sm-2">
            <h2 class="h2">Carbon</h2>
            <p>Metric: co2</p>
        </div>
        <div class="col-sm-6"><canvas id="lineChartCarbon"></canvas></div>
    </div>
    <h2 class="h2">Annual yield profile for species</h2>
    <p>The annual yield profile makes it possible to assess labor peaks and plan systems where labor is spread out accross the year. Furthermore, it can help to assess and optimize early cash flows. More diverse and spread out yields can help to mitigate market votality etc. </p> */}
				</div>
			</div>
		</Show>
	);
}
