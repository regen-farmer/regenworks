import { createAsync } from "@solidjs/router";
import { apiFetchOptions } from "./apiFetchOptions";
import { ProjectDocument } from "@rw/db/schemas/project";

export function getScenario(projectId, callback?){
  return createAsync(
		async () => {
			console.log("Request to layoutData");
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/projects/${
					projectId
				}/layout`,
				apiFetchOptions(),
			);

			console.log("Response from layoutData");

			const result: {
				project: ProjectDocument;
			} = await response.json();

      if (callback) callback(result)

			return result;
		},
	);
}