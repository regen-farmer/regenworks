import { Row } from "~/components/row/Row";
import { For, Show, createResource } from "solid-js";
import { action } from "@solidjs/router";
import { useParams, useNavigate } from "@solidjs/router";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export default function view() {
  const params = useParams();

  const [data] = createResource<{
    project: ProjectDocument;
    species: SpeciesDocument[];
    subtypes: string[];
  }>(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${params.projectId}/generateestablishment`,
      apiFetchOptions(),
    );
    return await response.json();
  });

  const navigate = useNavigate();
  const routeAction = action(async (formData: FormData) => {
    // TODO: Fix form data
    const payload = {
      budget: {
        currency: formData.get("budget[currency]")?.toString()!,
      },

      areapostings: formData.get("areapostings")?.toString()!,
      speciespostings: formData.get("speciespostings")?.toString()!,
    };

    const response = await fetch(
      `${
        import.meta.env.VITE_BACKEND_URL
      }/projects/${data()?.project.id.toString()}/generateestablishment`,
      {
        body: JSON.stringify(payload),
        method: "post",
        ...apiFetchOptions(),
      },
    );

    navigate(`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}`);
  });
  return (
    <>
      <Show when={data()}>
        <Row>
          <div class="col-lg-2" />
          <div class="col-lg-8">
            <h2 class="h2">Create establishment budget for project "{data()?.project.name}"</h2>
            <form method="post" action={routeAction}>
              <h2 class="h2">Budget specifications</h2>
              <div class="card">
                <div class="card-body">
                  <label for="budget[currency]">Currency</label>
                  <div class="form-group">
                    <select name="budget[currency]" id="budget[currency]">
                      <option value="usd">USD</option>
                      <option value="eur">EUR</option>
                    </select>
                  </div>
                </div>
              </div>
              <h2 class="h2">Area specific activities</h2>
              <div class="card">
                <div class="card-body">
                  <Row>
                    <div class="col-lg-4">
                      <label for="areapostings">Site prep</label>
                      <div class="form-group">
                        <select name="areapostings" id="areapostings">
                          <option value="none">None</option>
                          <option value="disc">Open ground - tillage and disking</option>
                        </select>
                      </div>
                    </div>
                    <div class="col-lg-4">
                      <label for="areapostings">Subsoil prep</label>
                      <div class="form-group">
                        <select name="areapostings" id="areapostings">
                          <option value="none">None</option>
                          <option value="ripping">Deep ripping</option>
                        </select>
                      </div>
                    </div>
                  </Row>
                </div>
              </div>
              <h2 class="h2">Species specific activities</h2>
              <For each={data()?.species}>
                {(species) => (
                  <div class="card">
                    <div class="card-body">
                      <p>
                        <strong>{species.nameCommon}</strong>
                      </p>
                      <Row>
                        <div class="col-lg-4">
                          <label for="speciespostings">Planting material type</label>
                          <div class="form-group">
                            <select name="speciespostings" id="speciespostings">
                              <option value="none">none</option>
                              <For each={species.activities}>
                                {(acticity, i) => (
                                  <>
                                    <Show when={species.activities[i()].subtype === "plant"}>
                                      <option value="{ species._id + ' ' + i }">
                                        {species.activities[i()].name}
                                      </option>
                                    </Show>
                                  </>
                                )}
                              </For>
                            </select>
                          </div>
                        </div>
                        <div class="col-lg-4">
                          <label for="speciespostings">Planting method type</label>
                          <div class="form-group">
                            <select name="speciespostings" id="speciespostings">
                              <option value="none">none</option>
                              <For each={species.activities}>
                                {(acticity, i) => (
                                  <Show when={species.activities[i()].subtype === "method"}>
                                    <option value="{ species._id + ' ' + i }">
                                      {species.activities[i()].name}
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
                )}
              </For>
              <div class="form-group">
                <button type="submit" class="rounded-sm p-1 my-2 btn-default">
                  Create establishment budget
                </button>
              </div>
            </form>
          </div>
          <div class="col-lg-2" />
        </Row>
      </Show>
    </>
  );
}
