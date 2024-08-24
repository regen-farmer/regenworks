import { signIn } from "@solid-mediakit/auth/client";
import { A } from "@solidjs/router";
import { NavBar } from "~/components/NavBar.tsx";
// import { useAuth0 } from "~/auth";

export default function NewUser() {
	// const auth0: any = useAuth0();

	return (
		<>
			<NavBar />
			<div class="container" style="text-align: center; margin-top: 80px;">
				<button
					type="submit"
					class="rounded-sm p-1 m-1 btn-dark"
					onClick={() => signIn("auth0", { redirectTo: "/" })}
				>
					Log in or create new user
				</button>{" "}
				<br />
				<br />
				<p>
					<em>
						<small>
							By creating a user you agree to our <br />
							<A href="/terms">Terms of Service</A> and{" "}
							<A href="/privacy">Privacy Policy</A>.
						</small>
					</em>
				</p>
			</div>
		</>
	);
}
