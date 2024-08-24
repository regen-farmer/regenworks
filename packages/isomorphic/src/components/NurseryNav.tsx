import { Row } from "~/components/row/Row";

// @ts-ignore
import { useAuth0 } from "~/auth";

export function simplenavbar(props: any) {
	const auth02: any = useAuth0();
	const currentUser = auth02.user();

	return (
		<>
			<nav class="navbar navbar-expand-lg navbar-dark bg-dark fixed-top">
				<div id="logotype" class="navbar-brand">
					Regen<span style="color: #88C762">Works</span>
				</div>

				<div class="collapse navbar-collapse" id="navbarText">
					<ul class="navbar-nav mr-auto" />
					<ul class="navbar-nav navbar-right">
						{!currentUser ? (
							<li>
								<A class="nav-link" href="/login">
									Sign in
								</A>
							</li>
						) : (
							<>
								<li>
									<A class="nav-link" href="/nurseries">
										<i class="fas fa-tree" /> My Nursery
									</A>
								</li>
								<li>
									<A class="nav-link" href="/logout">
										<i class="fas fa-arrow-circle-right" /> Logout
									</A>
								</li>
							</>
						)}
					</ul>
				</div>
			</nav>

			<Row>
				<div class="col-lg-12 ml-md-auto main">{props.children}</div>
			</Row>
		</>
	);
}
