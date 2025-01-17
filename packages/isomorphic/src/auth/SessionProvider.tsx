import { useAuth } from "@solid-mediakit/auth/client";
import { Show } from "solid-js";
import NewUser from "~/auth/signup.tsx";
import { ShowAfterAuth } from "./useAuth.tsx";

const SessionProvider = (props: any) => {
	const auth = useAuth()
	return (
		// <div class="flex flex-col items-center justify-center gap-4">
		<Show when={auth.session()} fallback={<NewUser />}>
			{(session) => {
				return <ShowAfterAuth>{props.children}</ShowAfterAuth>;
			}}
		</Show>
		// </div>
	);
};

export { SessionProvider };
