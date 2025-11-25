import { createAsync } from "@solidjs/router";
import { Show } from "solid-js";
import NewUser from "~/auth/signup.tsx";
import { ShowAfterAuth } from "./useAuth.tsx";
import { getSessionData } from "~/app.tsx";

const SessionProvider = (props: any) => {
	const session = createAsync(() => getSessionData());
	return (
		<Show when={session()} fallback={<NewUser />}>
			<ShowAfterAuth>{props.children}</ShowAfterAuth>
		</Show>
	);
};

export { SessionProvider };
