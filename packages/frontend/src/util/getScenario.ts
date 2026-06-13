import { createResource } from "solid-js";
import { apiFetch } from "~/util/apiFetch.ts";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";

export function getScenario(projectId: any, callback?: any) {
  const [data] = createResource(async () => {
    const result: {
      project: ProjectDocument;
    } = await apiFetch(`/projects/${projectId}/layout`);

    if (callback) callback(result);

    return result;
  });
  return data;
}
