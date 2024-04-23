import { createSession } from "@solid-mediakit/auth/client";
import { Show } from "solid-js";
import NewUser from "~/auth/signup";
import { ShowAfterAuth } from "./useAuth";

const SessionProvider = (props: any) => {
	const session = createSession();
	return (
		// <div class="flex flex-col items-center justify-center gap-4">
		<Show when={session()} fallback={<NewUser />}>
			{(session) => {
				return <ShowAfterAuth>{props.children}</ShowAfterAuth>;
			}}
		</Show>
		// </div>
	);
};

export { SessionProvider };
