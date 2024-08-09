import { createAsync } from "@solidjs/router";
import { apiFetchOptions } from "./apiFetchOptions.ts";
import type { ProjectDocument } from "@rw/db/schemas/project.ts";

export function getScenario(projectId: any, callback?: any) {
	return createAsync(async () => {
		console.log("Request to layoutData");
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/projects/${projectId}/layout`,
			apiFetchOptions(),
		);

		console.log("Response from layoutData");

		const result: {
			project: ProjectDocument;
		} = await response.json();

		if (callback) callback(result);

		return result;
	});
}
