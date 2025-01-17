import { useAuth } from "@solid-mediakit/auth/client";
import { A } from "@solidjs/router";
import { NavBar } from "~/components/NavBar.tsx";
// import { useAuth0 } from "~/auth";

export default function NewUser() {
	// const auth0: any = useAuth0();
	const auth = useAuth()

	return (
		<>
			<NavBar />
			<div class="container" style="text-align: center; margin-top: 80px;">
				<button
					type="submit"
					class="rounded-sm p-4 m-1 btn-default text-base"
					onClick={() => auth.signIn("auth0", { redirectTo: "/" })}
				>
					Log in or create new user
				</button>{" "}
				<p class="mt-4 dark:text-zinc-200 text-xs leading-4">
					
						
							By creating a user you agree to our <br />
							<A class="underline-offset-2 underline" href="/terms">Terms of Service</A> and{" "}
							<A class="underline-offset-2 underline" href="/privacy">Privacy Policy</A>.
						
					
				</p>
			</div>
		</>
	);
}
