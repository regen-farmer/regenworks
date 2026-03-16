import { useNavigate, useParams, createFileRoute } from "@tanstack/solid-router";
import { Row } from "~/components/row/Row";
import { Show, createResource } from "solid-js";
import type { LayerDocument } from "@rw/db/schemas/layer.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";

export const Route = createFileRoute("/parcels/$parcelId/layers/$layerId/edit")({
  component: LayerEditView,
});

function LayerEditView() {
  const params = useParams({ strict: false });
  const [data] = createResource<{
    layer: LayerDocument;
  }>(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/layers/${params().layerId}/edit`,
      apiFetchOptions(),
    );
    return await response.json();
  });

  const navigate = useNavigate();

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    console.log(formData.get("parcel[name]"));
    const payload = {
      layer: {
        name: formData.get("layer[name]")?.toString()!,
        description: formData.get("layer[description]")?.toString()!,
      },
    };

    await fetch(`${import.meta.env.VITE_BACKEND_URL}/layers/${params().layerId}`, {
      body: JSON.stringify(payload),
      method: "put",
      ...apiFetchOptions(),
    });

    navigate({ to: `/parcels/${params().parcelId}/layers/${params().layerId}` });
  };

  return (
    <>
      <div style={{ padding: "20px" }}>
        <Show when={data()}>
          <Row>
            <div class="col-lg-3" />
            <div class="col-lg-6">
              <h2 class="h2">Edit field</h2>
              <div>
                <form onSubmit={handleSubmit}>
                  <TextField>
                    <TextFieldLabel for="layer[name]">Field name</TextFieldLabel>
                    <TextFieldInput
                      type="text"
                      class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                      name="layer[name]"
                      value={data()?.layer.name}
                      required
                      placeholder="Field name"
                    />
                  </TextField>

                  <TextField>
                    <TextFieldLabel for="layer[description]">Description</TextFieldLabel>
                    <TextFieldInput
                      type="text"
                      class="form-control p-1 rounded-sm border border-zinc-300 dark:border-slate-600"
                      name="layer[description]"
                      value={data()?.layer.description}
                      placeholder="Description"
                    />
                  </TextField>
                  <div class="btn-group">
                    <button type="submit" class="rounded-sm p-1 my-2 btn-default center-block">
                      Update field
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Row>
        </Show>
      </div>
    </>
  );
}
