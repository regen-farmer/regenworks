import { createAsync } from "@solidjs/router";
import { apiFetchOptions } from "./apiFetchOptions.ts";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";

export function getScenario(projectId: any, callback?: any) {
	return createAsync(async () => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${projectId}/layout`,
			apiFetchOptions(),
		);

		const result: {
			project: ProjectDocument;
		} = await response.json();

		if (callback) callback(result);

		return result;
	});
}
