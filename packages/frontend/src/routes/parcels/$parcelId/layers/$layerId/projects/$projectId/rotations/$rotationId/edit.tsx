import { createResource } from "solid-js";
import { useParams, useNavigate, createFileRoute } from "@tanstack/solid-router";

import type { ProjectDocument } from "@rw/db/schemas/project.ts";
import type { RotationDocument } from "@rw/db/schemas/rotation.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export const Route = createFileRoute(
  "/parcels/$parcelId/layers/$layerId/projects/$projectId/rotations/$rotationId/edit",
)({
  component: RotationEditView,
});

function RotationEditView() {
  const params = useParams({ strict: false });

  const [data, { refetch }] = createResource<{
    project: ProjectDocument;
    rotation: RotationDocument;
  }>(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${
        params().projectId
      }/rotations/${params().rotationId}/edit`,
      apiFetchOptions(),
    );
    return await response.json();
  });

  const navigate = useNavigate();
  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const payload = {
      rotation: {
        name: formData.get("rotation[name]")?.toString()!,
      },
    };
    await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/projects/${
        params().projectId
      }/rotations/${params().rotationId}`,
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
      <div class="row">
        <div class="col-lg-12">
          <h1 class="h1">Update crop rotation</h1>
          <p>This page lets you update an existing crop rotation. </p>
          <form onSubmit={handleSubmit}>
            <div class="form-group">
              <label for="rotation[name]">Rotation name</label>
              <input
                type="text"
                class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                name="rotation[name]"
                value={data()?.rotation.name}
                required
              />
            </div>
            <div class="form-group">
              <button type="submit" class="rounded-sm p-1 my-2 btn-default mt-3">
                Update Crop Rotation
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
