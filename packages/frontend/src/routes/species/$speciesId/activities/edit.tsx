import { useLocation, useParams, useNavigate, createFileRoute } from "@tanstack/solid-router";
import { Show, createResource } from "solid-js";
import type { SpeciesDocument } from "@rw/db/schemas/species.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

function ActivitiesEdit() {
  const params = useParams({ strict: false });

  const location = useLocation();

  const [data, { refetch }] = createResource(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/species/${
        params().speciesId
      }/activities/edit?index=${location().search.index}`,
      apiFetchOptions(),
    );

    const returnval: {
      species: SpeciesDocument;
      activity: {
        activityType: string;
        subtype: string;
        name: string;
        time: {
          startMonth: number;
          endMonth: number;
        };
        price: number;
      };
      index: string;
    } = await response.json();

    return returnval;
  });

  const navigate = useNavigate();

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
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

    console.log("im here");
    console.log(payload);
    console.log("im definitely not here");

    //action={`/species/${data()?.species._id}/activities?_method=PUT&index=${data()?.index}`} method="post"

    await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/species/${
        params().speciesId
      }/activities?index=${data()?.index}`,
      {
        body: JSON.stringify(payload),
        method: "put",
        ...apiFetchOptions(),
      },
    );

    navigate({ to: `/species/${params().speciesId}` });
  };

  return (
    <Show when={data()}>
      <div class="container">
        <div class="row">
          <div class="col-sm-3" />
          <div class="col-sm-6">
            <h1 class="h1">Add new activity to species</h1>
            <p>
              Use this page to create activity templates for species that are used to auto-generate
              activities for projects.
            </p>
            <form onSubmit={handleSubmit}>
              <div class="form-group">
                <label for="activity[name]">Activity name</label>
                <input
                  type="text"
                  class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                  name="activity[name]"
                  value={data()?.activity?.name}
                  required
                />
              </div>
              <div class="form-group">
                <label for="activity[activityType]">Activity type</label>
                <select name="activity[activityType]" id="activity[activityType]">
                  {data()?.activity?.activityType === "establish" &&
                  data()?.activity?.subtype === "bed" ? (
                    <option value="establish bed" selected>
                      Establishment - Bed prep
                    </option>
                  ) : (
                    <option value="establish bed">Establishment - Bed prep</option>
                  )}
                  {data()?.activity?.activityType === "establish" &&
                  data()?.activity?.subtype === "plant" ? (
                    <option value="establish plant" selected>
                      Establishment - Planting material
                    </option>
                  ) : (
                    <option value="establish plant">Establishment - Planting material</option>
                  )}
                  {data()?.activity?.activityType === "establish" &&
                  data()?.activity?.subtype === "method" ? (
                    <option value="establish method" selected>
                      Establishment - Planting method
                    </option>
                  ) : (
                    <option value="establish method">Establishment - Planting method</option>
                  )}
                  {data()?.activity?.activityType === "manage" &&
                  data()?.activity?.subtype === "compost" ? (
                    <option value="manage compost" selected>
                      Management - Compost
                    </option>
                  ) : (
                    <option value="manage compost">Management - Compost</option>
                  )}
                  {data()?.activity?.activityType === "manage" &&
                  data()?.activity?.subtype === "pruning" ? (
                    <option value="manage pruning" selected>
                      Management - Pruning method
                    </option>
                  ) : (
                    <option value="manage pruning">Management - Pruning method</option>
                  )}
                  {data()?.activity?.activityType === "manage" &&
                  data()?.activity?.subtype === "weedcontrol" ? (
                    <option value="manage weedcontrol" selected>
                      Management - Weed control
                    </option>
                  ) : (
                    <option value="manage weedcontrol">Management - Weed control</option>
                  )}
                  {data()?.activity?.activityType === "manage" &&
                  data()?.activity?.subtype === "animalcontrol" ? (
                    <option value="manage animalcontrol" selected>
                      Management - Animal control
                    </option>
                  ) : (
                    <option value="manage animalcontrol">Management - Animal control</option>
                  )}
                  {data()?.activity?.activityType === "manage" &&
                  data()?.activity?.subtype === "harvest" ? (
                    <option value="manage harvest" selected>
                      Management - Harvest method
                    </option>
                  ) : (
                    <option value="manage harvest">Management - Harvest method</option>
                  )}
                  {/* <option value="establish bed">Establishment - Bed prep</option>
                <option value="establish plant">Establishment - Planting material</option>
                <option value="establish method">Establishment - Planting method</option>
                <option value="manage compost">Management - Compost</option>
                <option value="manage pruning">Management - Pruning method</option>
                <option value="manage weedcontrol">Management - Weed control</option>
                <option value="manage animalcontrol">Management - Animal control</option>
                <option value="manage harvest">Management - Harvest method</option> */}
                </select>
              </div>
              <div class="form-group">
                <label for="activity[time][startMonth]">Earliest performed month</label>
                <input
                  type="number"
                  class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                  name="activity[time][startMonth]"
                  min="1"
                  max="12"
                  value={data()?.activity?.time.startMonth}
                  required
                />
              </div>
              <div class="form-group">
                <label for="activity[time][endMonth]">Latest performed month</label>
                <input
                  type="number"
                  class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                  name="activity[time][endMonth]"
                  min="1"
                  max="12"
                  value={data()?.activity?.time.endMonth}
                  required
                />
              </div>
              <div class="form-group">
                <label for="activity[price]">Price in USD</label>
                <input
                  type="number"
                  step=".01"
                  class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                  name="activity[price]"
                  value={data()?.activity?.price}
                />
              </div>
              <div class="form-group">
                <button type="submit" class="rounded-sm p-1 my-2 btn-default">
                  Update species activity
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

export const Route = createFileRoute("/species/$speciesId/activities/edit")({
  component: ActivitiesEdit,
});
