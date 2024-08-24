import { A, useParams } from "@solidjs/router";

export function ScenarioSideBar(props: any) {
	const params = useParams();

	// const navigate = useNavigate()

	return (
		<div
			class="d-flex"
			style={{
				"flex-grow": 1,
				overflow: "hidden",
			}}
		>
			<nav class="sidebar-nav">
				<div
					style={{
						"padding-left": "15px",
					}}
				>
					<br />
					<h4 class="h4">Scenario</h4>
					<ul class="navbar-nav sidebar">
						<li class="nav-item">
							{/* <A class='nav-link' href={`/users/${ currentUser._id }`}> */}
							<A
								class="nav-link"
								end={true}
								href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}`}
							>
								Info
							</A>
						</li>

						<li class="nav-item">
							{/* <A class='nav-link' href={`/users/${ currentUser._id }`}> */}
							<A
								class="nav-link"
								href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}/financials`}
							>
								Financials
							</A>
						</li>

						<li class="nav-item">
							{/* <A class='nav-link' href={`/users/${ currentUser._id }`}> */}
							<A
								class="nav-link"
								href={`/parcels/${params.parcelId}/layers/${params.layerId}/projects/${params.projectId}/layout`}
							>
								Layout
							</A>
						</li>
					</ul>
				</div>
			</nav>

			<div
				style={{
					"overflow-y": "auto",
					"overflow-x": "hidden",
					width: "100%",
				}}
			>
				{props.children}
			</div>
		</div>
	);
}
