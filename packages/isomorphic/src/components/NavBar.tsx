import { Show, createMemo } from "solid-js";
import { getMongoDBUser, subscriptions } from "~/auth/useAuth.tsx";
import { ThemeSelect } from "./select/theme-select.tsx";
import { FarmSelect } from "./select/farm-select.tsx";
import { FieldSelect } from "./select/field-select.tsx";
import { ProjectSelect } from "./select/project-select.tsx";
import { A, useNavigate, useLocation } from "@solidjs/router";
// import { ModeToggle } from "./ui/mode-toggle.tsx";

export function NavBar() {
	const navigate = useNavigate();
	// const params = useParams()

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

	const getProjectId = createMemo(() => {
		const pathSections = location.pathname.split("/");
		const projectsIndex = pathSections.findIndex(
			(value) => value === "projects",
		);

		const projcetId: string = pathSections[projectsIndex + 1];

		// console.log('ProjectId', projcetId)
		return projcetId;
	});

	return (
		<nav class="navbar navbar-expand">
			<div
				id="logotype"
				class="navbar-brand mx-3"
				onclick={() => {
					navigate("/");
				}}
			>
				<div class="logo-icon" />
			</div>

			<div class="navbar-collapse" id="navbarText">
				<ul class="navbar-nav me-auto">
					<Show when={getMongoDBUser() && subscriptions() && getParcelId()}>
						<li
							style={{
								display: "flex",
								"justify-content": "center",
								"align-items": "center",
							}}
						>
							<FarmSelect />
							<A
								title="Go to farm"
								style={{ "margin-left": "5px" }}
								href={getParcelId() ? `/parcels/${getParcelId()}` : ""}
								end={true}
							>
								<i class="fa-solid fa-house" />
							</A>
						</li>

						<Show when={getLayerId()}>
							<li
								style={{
									display: "flex",
									"justify-content": "center",
									"align-items": "center",
								}}
							>
								<div class="breadcrumb-divider" />

								<FieldSelect />
								<A
									title="Go to field"
									style={{ "margin-left": "5px" }}
									href={
										getLayerId()
											? `/parcels/${getParcelId()}/layers/${getLayerId()}`
											: `/parcels/${getParcelId()}`
									}
									end={true}
								>
									<i class="fa-solid fa-layer-group" />
								</A>
							</li>

							<Show when={getProjectId()}>
								<li
									style={{
										display: "flex",
										"justify-content": "center",
										"align-items": "center",
									}}
								>
									<div class="breadcrumb-divider" />

									<ProjectSelect />
									<A
										title="Go to scenario"
										style={{ "margin-left": "5px" }}
										href={
											getProjectId()
												? `/parcels/${getParcelId()}/layers/${getLayerId()}/projects/${getProjectId()}`
												: `/parcels/${getParcelId()}/layers/${getLayerId()}`
										}
										end={true}
									>
										<i class="fa-solid fa-lightbulb" />
									</A>
								</li>
							</Show>
						</Show>
					</Show>
				</ul>
				<ul
					class="navbar-nav navbar-right mx-3"
					style={{ display: "flex", "align-items": "center" }}
				>
					<Show when={getMongoDBUser()}>
						<li class="nav-item">
							<A class="nav-link" href={"/settings"}>
								<i class="fas fa-gear" /> Settings
							</A>
						</li>

						<li class="nav-item">
							<A
								title="Support"
								class="nav-link"
								target="_blank"
								href={"https://discord.gg/DqUZU7QNF5"}
							>
								<i class="fas fa-circle-info" /> Support
							</A>
						</li>
					</Show>
					<li>
						<span style={{ color: "white !important" }}>
							<ThemeSelect />
						</span>
					</li>
				</ul>
			</div>
		</nav>
	);
}
