import { For, createResource, createSignal } from "solid-js";
import { action } from "@solidjs/router";
import { useParams, useNavigate } from "@solidjs/router";

import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
  const params = useParams<{
    projectId: string;
    parcelId: string;
    layerId: string;
  }>();

  const [data, { refetch }] = createResource<{
    project: ProjectDocument;
    species: SpeciesDocument[];
  }>(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/rotations/new`,
      apiFetchOptions(),
    );
    return await response.json();
  });

  const [steps, setSteps] = createSignal(1);

  const navigate = useNavigate();
  const Form = action(async (formData: FormData) => {
    const model: {
      speciesmix: [
        {
          species: any;
          amount: number;
        },
      ];
      planting: {
        year: number;
        month: number;
      };
      harvest: {
        year: number;
        month: number;
      };
    }[] = [];

    for (let i = 0; i < steps(); i++) {
      model.push({
        speciesmix: [
          {
            species: formData.get(`model[${i}][speciesmix][species]`)?.toString()!,
            amount: 0,
          },
        ],
        planting: {
          year: Number.parseInt(formData.get(`model[${i}][planting][year]`)?.toString()!),
          month: Number.parseInt(formData.get(`model[${i}][planting][month]`)?.toString()!),
        },
        harvest: {
          year: Number.parseInt(formData.get(`model[${i}][harvest][year]`)?.toString()!),
          month: Number.parseInt(formData.get(`model[${i}][harvest][month]`)?.toString()!),
        },
      });
    }

    const payload = {
      rotation: {
        model,
        name: formData.get("rotation[name]")?.toString()!,
        description: formData.get("rotation[description]")?.toString()!,
      },
    };

    await fetch(`${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/rotations`, {
      body: JSON.stringify(payload),
      method: "post",
      ...apiFetchOptions(),
    });

    navigate(
      `/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}/layout`,
    );
  });

  return (
    <>
      <div class="row">
        <div class="col-lg-2" />
        <div class="col-lg-8">
          <h1 class="h1">New crop rotation</h1>

          <div class="form-group">
            <label for="steps">Choose number of steps in rotation</label>
            <input
              type="number"
              value={steps()}
              onChange={(el) => {
                //@ts-ignore

                setSteps(Number.parseInt(el.target.value));
                console.log(typeof steps());
              }}
              max="20"
              class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
              name={"steps"}
              required
            />
          </div>
        </div>
        <div class="col-lg-2" />
      </div>

      <div class="row">
        <div class="col-lg-12">
          <h1 class="h1">Create new crop rotation plan</h1>
          <p>This page lets you create a new crop rotation. </p>
          <form method="post" action={Form}>
            <div class="form-group">
              <label for="rotation[name]">Rotation name/reference</label>
              <input
                type="text"
                class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                name={"rotation[name]"}
                required
              />
            </div>
            <div class="form-group">
              <label for="rotation[description]">Description</label>
              <input
                type="text"
                class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                name={"rotation[description]"}
              />
            </div>
            <h3 class="h3">Crop rotation pattern</h3>
            <p>
              Select individual crop and specify planting time and harvest relative in the rotation
              cycle.
            </p>
            <For each={[...Array(steps()).keys()]}>
              {(step, i) => (
                <div class="card">
                  <div class="card-body">
                    <p>Step {i() + 1} </p>
                    <select
                      name={`model[${i}][speciesmix][species]`}
                      style="width:100%;max-width:100%;"
                    >
                      <option value="">none</option>
                      <For each={data()?.species}>
                        {(species) => (
                          <option value={species._id}>
                            {species.genus} {species.species} ({species.nameCommon})
                          </option>
                        )}
                      </For>
                    </select>
                    <div class="row">
                      <div class="col-lg-3">
                        <div class="form-group">
                          <label for={`model[${i}][planting][year]`}>
                            Planting year [1 = first year]
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="25"
                            class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                            name={`model[${i}][planting][year]`}
                            required
                          />
                        </div>
                      </div>
                      <div class="col-lg-3">
                        <div class="form-group">
                          <label for={`model[${i}][planting][month]`}>Planting month [1-12]</label>
                          <input
                            type="number"
                            min="1"
                            max="12"
                            class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                            name={`model[${i}][planting][month]`}
                            required
                          />
                        </div>
                      </div>
                      <div class="col-lg-3">
                        <div class="form-group">
                          <label for={`model[${i}][harvest][year]`}>Harvest year</label>
                          <input
                            type="number"
                            min="1"
                            max="25"
                            class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                            name={`model[${i}][harvest][year]`}
                            required
                          />
                        </div>
                      </div>
                      <div class="col-lg-3">
                        <div class="form-group">
                          <label for={`model[${i}][harvest][month]`}>Harvest month [1-12]</label>
                          <input
                            type="number"
                            min="1"
                            max="12"
                            class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                            name={`model[${i}][harvest][month]`}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </For>
            <div class="form-group">
              <input
                type="submit"
                class="rounded-sm p-1 my-2 btn-default mt-3"
                value={"Create the new crop rotation"}
              />
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
