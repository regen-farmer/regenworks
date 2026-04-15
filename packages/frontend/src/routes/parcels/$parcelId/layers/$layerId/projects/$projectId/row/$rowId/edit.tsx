import { Row } from "~/components/row/Row";
import { For, Show, createResource } from "solid-js";
import { useParams, useNavigate, createFileRoute } from "@tanstack/solid-router";

import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import type { RowDocument } from "@rw/db/schemas/row.ts";
import type { SequenceDocument } from "@rw/db/schemas/sequence.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export const Route = createFileRoute(
  "/parcels/$parcelId/layers/$layerId/projects/$projectId/row/$rowId/edit",
)({
  component: ProjectRowEditView,
});

function ProjectRowEditView() {
  const params = useParams({ strict: false });

  const [data, { refetch }] = createResource<{
    sequences: SequenceDocument[];
    project: ProjectDocument;
    row: RowDocument;
  }>(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${params().projectId}/row/${params().rowId}/edit`,
      apiFetchOptions(),
    );
    return await response.json();
  });

  const navigate = useNavigate();
  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const payload = {
      row: {
        name: formData.get("row[name]")?.toString()!,
      },
      sequenceid: formData.get("sequenceid")?.toString()!,
    };
    await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${params().projectId}/row/${params().rowId}`,
      {
        body: JSON.stringify(payload),
        method: "put",
        ...apiFetchOptions(),
      },
    );

    navigate(
      `/parcels/${params().parcelId}/layers/${params().layerId}/projects/${params().projectId}/layout`,
    );
  };

  return (
    <>
      <Row>
        <div class="col-lg-6">
          <h2 class="h2">Edit row</h2>
          <div>
            <form onSubmit={handleSubmit}>
              <div class="form-group">
                <label for="row[name]">Row name/ref</label>
                <input
                  type="text"
                  class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                  name="row[name]"
                  value={data()?.row.name}
                  required
                />
              </div>
              <Show when={data()?.sequences && data()?.sequences.length! > 0}>
                <div class="form-group">
                  <label for="sequenceid">Select row sequence pattern: </label>
                  <select name="sequenceid" id="sequenceid">
                    <option value="none">None</option>
                    <For each={data()?.sequences}>
                      {(sequence: SequenceDocument) => (
                        <>
                          {data()?.row.sequence && sequence.name === data()?.row.sequence.name ? (
                            <option value={sequence._id.toString()} selected>
                              {sequence.name}
                            </option>
                          ) : (
                            <option value={sequence._id.toString()}>{sequence.name}</option>
                          )}
                        </>
                      )}
                    </For>
                  </select>
                </div>
              </Show>
              {/* <!--   <div class="form-group">
                    <label for="[rowCoordinates]">Row geometry</label>
                    <p>Please draw the outline of your new row. Press first point or "Finish" to close the shape.</p>
                </div>
                <div id="rowMapNew"></div>
                <input type="hidden" id="geometry" name="geometry" />
                <input type="hidden" id="layersize" name="layersize" />
                <div id="coordinates"></div>
                <hr>--> */}
              <div class="form-group">
                <button type="submit" class="rounded-sm p-1 my-2 btn-default center-block">
                  Update row
                </button>
              </div>
            </form>
          </div>
        </div>
      </Row>
    </>
  );
}
