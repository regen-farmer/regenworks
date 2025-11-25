import { A } from "@solidjs/router";
import { NavBar } from "~/components/NavBar.tsx";

export default function NewUser() {
	return (
		<>
			<NavBar />
			<div class="container" style="text-align: center; margin-top: 80px;">
				<a
					rel="external"
					href="/api/auth/signin"
					class="rounded-sm p-4 m-1 btn-default text-base inline-block"
				>
					Log in or create new user
				</a>
				<p class="mt-4 dark:text-zinc-200 text-xs leading-4">


							By creating a user you agree to our <br />
							<A class="underline-offset-2 underline" href="/terms">Terms of Service</A> and{" "}
							<A class="underline-offset-2 underline" href="/privacy">Privacy Policy</A>.


				</p>
			</div>
		</>
	);
}
