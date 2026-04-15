import { useNavigate, useParams, createFileRoute } from "@tanstack/solid-router";
import { Row } from "~/components/row/Row";
import { For, createResource } from "solid-js";
import type { LayerDocument } from "@rw/db/schemas/layer.ts";
import type { SystemDocument } from "@rw/db/schemas/system.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export const Route = createFileRoute(
  "/parcels/$parcelId/layers/$layerId/projects/$projectId/mysystems",
)({
  component: MySystemsView,
});

function MySystemsView() {
  const params = useParams({ strict: false });

  const [data, { refetch }] = createResource<{
    layer: LayerDocument;
    systems: SystemDocument[];
  }>(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/layers/${params().layerId}/mysystems`,
      apiFetchOptions(),
    );
    const result = await response.json();
    console.log(result);
    return result;
  });
  const navigate = useNavigate();
  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const payload: any = {
      systemid: formData.get("systemid")?.toString()!,
    };

    // console.log(payload)

    await fetch(`${import.meta.env.VITE_BACKEND_URL}/layers/${params().layerId}/editfuture`, {
      body: JSON.stringify(payload),
      method: "post",
      ...apiFetchOptions(),
    });

    navigate({
      to: `/parcels/${params().parcelId}/layers/${params().layerId}/projects/${params().projectId}`,
    });
  };

  return (
    <>
      <div style={{ padding: "20px" }}>
        <h1 class="h1">My systems</h1>
        <p>Add one of your own systems as a future draft on area: "{data()?.layer.name}"</p>
        <Row>
          <For each={data()?.systems}>
            {(system, i) => (
              <div class="col-lg-4">
                <div class="card text-center">
                  {/* <!--<div class="row p-3 justify-content-center">
                <% systems[i].rows.forEach(function(row){ %>
                <div class="col-sm-3">
                    <% if(row.sequense[0].family === "pinaceae"){ %>
                    <img class="img-fluid" src="/images/conifer.svg">
                    <% } else if (row.sequense[0].form === "tree") { %>
                    <% if(row.sequense[0].height > 12){ %>
                    <img class="img-fluid" src="/images/treehigh.svg">
                    <% } else { %>
                    <img class="img-fluid" src="/images/treelow.svg">
                    <% } %>
                    <% } else { %>
                    <img class="img-fluid" src="/images/<%= row.sequense[0].form %>.svg">
                    <% } %>
                </div>
                <% }); %>
                <% if(systems[i].rows.length > 1 && systems[i].rows.length < 4){ %>
                <div class="col-sm-3">
                    <% if(systems[i].rows[0].sequense[0].family === "pinaceae"){ %>
                    <img class="img-fluid" src="/images/conifer.svg">
                    <% } else if (systems[i].rows[0].sequense[0].form === "tree") { %>
                    <% if(systems[i].rows[0].sequense[0].height > 12){ %>
                    <img class="img-fluid" src="/images/treehigh.svg">
                    <% } else { %>
                    <img class="img-fluid" src="/images/treelow.svg">
                    <% } %>
                    <% } else { %>
                    <img class="img-fluid" src="/images/<%= systems[i].rows[0].sequense[0].form %>.svg">
                    <% } %>
                </div>
                <% }; %>
            </div>--> */}
                  <div class="card-body">
                    <h5 class="body-title">{system.name}</h5>
                    {/* <!--<button class="rounded-sm p-1 my-2 btn-default" type="button" data-toggle="collapse" data-target="#collapseExample<%= systems[i]._id %>" aria-expanded="false" aria-controls="collapseExample">
                    More details
                </button>--> */}
                    <form onSubmit={handleSubmit}>
                      <input
                        type="hidden"
                        id="systemid"
                        name="systemid"
                        value={system._id.toString()}
                      />
                      <button class="rounded-sm p-1 my-2 btn-default" type="button">
                        Add system to future drafts
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </For>
        </Row>
      </div>
    </>
  );
}
