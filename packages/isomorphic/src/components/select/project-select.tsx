import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui/select";
import { Show, createMemo, createResource, createSignal } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

import type { ProjectDocument } from "@rw/db/schemas/project.ts";
// import { breadcrumb } from '~/breadcrumb'

export const [reloadSignal, setReloadSignal] = createSignal(1);

export function ProjectSelect() {
	const location = useLocation();

	const getParcelId = createMemo(() => {
		const pathSections = location.pathname.split("/");
		const parcelsIndex = pathSections.findIndex((value) => value === "parcels");
		const parcelId: string = pathSections[parcelsIndex + 1];
		return parcelId;
	});

	const getLayerId = createMemo(() => {
		const pathSections = location.pathname.split("/");
		const layersIndex = pathSections.findIndex((value) => value === "layers");
		const layerId: string = pathSections[layersIndex + 1];
		return layerId;
	});

	const getProjectId = createMemo(() => {
		const pathSections = location.pathname.split("/");
		const projectsIndex = pathSections.findIndex((value) => value === "projects");
		const projectId: string = pathSections[projectsIndex + 1];
		return projectId;
	});

	const [fieldData, { refetch }] = createResource(
		reloadSignal,
		async (reloader) => {
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/layers/${getLayerId()}`,
				apiFetchOptions(),
			);
			const answer = await response.json();
			return answer;
		},
	);

	const navigate = useNavigate();

	function projectDisplay(projectId: string): string {
		return fieldData()?.layer.projects.find(
			(project: ProjectDocument) => project._id.toString() === projectId.toString(),
		)?.name!;
	}

	const projects = createMemo(() => {
		if (!fieldData()?.error) {
			const projects = fieldData()?.layer.projects.map(
				(project: ProjectDocument) => project._id.toString(),
			)!;
			return projects;
		}
		return [];
	});

	return (
		<Show when={projects()}>
			<Select
				value={getProjectId()}
				onChange={(val) => {
					if (val) {
						navigate(`/parcels/${getParcelId()}/layers/${getLayerId()}/projects/${val}`);
					}
				}}
				options={projects()}
				placeholder="Select project"
				itemComponent={(props) => (
					<SelectItem item={props.item}>
						{props.item ? projectDisplay(props.item.rawValue) : ""}
					</SelectItem>
				)}
			>
				<SelectTrigger aria-label="Project" class="select__trigger">
					<SelectValue<string>>
						{(state) => (
							state.selectedOption()
								? projectDisplay(state.selectedOption())
								: ""
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent class="select__content" />
			</Select>
		</Show>
	);
}
