import { Select } from "@kobalte/core/select";
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

		// console.log('LayerId', layerId)
		return layerId;
	});

	const projectStatusList = [
		["planning", "Planning", "bg-primary", "list-group-item-primary"],
		["Implementation", "Implementing", "bg-info", "list-group-item-info"],
		["Completed", "Completed", "bg-success", "list-group-item-success"],
		["Retired", "Retired", "bg-secondary", "list-group-item-secondary"],
		["No status", "No status", "bg-secondary", "list-group-item-secondary"],
	];

	const getProjectId = createMemo(() => {
		const pathSections = location.pathname.split("/");
		const projectsIndex = pathSections.findIndex(
			(value) => value === "projects",
		);

		const projcetId: string = pathSections[projectsIndex + 1];

		// console.log('ProjectId', projcetId)
		return projcetId;
	});

	const [fieldData, { refetch }] = createResource(
		reloadSignal,
		async (reloader) => {
			// console.log('farm', getParcelId())

			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/layers/${getLayerId()}`,
				apiFetchOptions(),
			);
			const answer = await response.json();
			return answer;
		},
	);

	const navigate = useNavigate();

	function projectDisplay(projectId: string) {
		const project = fieldData()?.layer.projects.find(
			(project: ProjectDocument) =>
				project._id.toString() === projectId.toString(),
		);

		// let status = projectStatusList.find((el) => el[0] === project.status)!;

		// if (!status) {
		// 	status = projectStatusList[4];
		// }

		return (
			<>
				{/* <div
					style={{
						display: "inline-block",
						"margin-right": "5px",
						// 'min-width': '120px',
					}}
				>
					<span class={`badge ${status[2]} rounded-pill`}>{status[1]}</span>
				</div> */}
				<span>{project.name}</span>
			</>
		);
		// return project.name!;
	}

	const projects = createMemo(() => {
		const projects = fieldData()?.layer.projects.map(
			(project: ProjectDocument) => project._id.toString(),
		)!;
		return projects;
	});

	return (
		<Show when={projects()}>
			<Select
				options={projects()}
				placeholder="Select scenario"
				value={getProjectId()}
				onChange={(val) => {
					if (val) {
						navigate(
							`/parcels/${getParcelId()}/layers/${getLayerId()}/projects/${val}`,
						);
					}
				}}
				// valueComponent={(props: any) => {
				//   return props.item ? fieldDisplay(props.item.rawValue) : ''
				// }}
				itemComponent={(props: any) => (
					<Select.Item item={props.item} class="select__item">
						<Select.ItemLabel>
							{props.item ? projectDisplay(props.item.rawValue) : ""}
						</Select.ItemLabel>

						<Select.ItemIndicator class="select__item-indicator">
							<i class="fas fa-check" />
						</Select.ItemIndicator>
					</Select.Item>
				)}
			>
				<Select.Trigger class="select__trigger" aria-label="Fruit">
					<Select.Value<string> class="select__value">
						{(state) => {
							return state.selectedOption()
								? projectDisplay(state.selectedOption())
								: "";
						}}
					</Select.Value>
					{/* <Select.Icon class='select__icon'>
            <i class='fas fa-sort' />
          </Select.Icon> */}
				</Select.Trigger>
				<Select.Portal>
					<Select.Content class="select__content">
						<Select.Listbox class="select__listbox" />
					</Select.Content>
				</Select.Portal>
			</Select>
		</Show>
	);
}
