import {
	createEffect,
	createMemo,
	createSignal,
	onMount,
	Show,
} from "solid-js";
// import { isServer } from "solid-js/web";
import { useLocation, useNavigate } from "@solidjs/router";
import NewUser from "~/auth/signup";
// import { useAuth0 } from ".";
import { NavBar } from "~/components/NavBar";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { paymentPlan } from "~/util/paymentPlan";

export const [auth0User, setAuth0User]: [any, any] = createSignal();
export const [auth0Token, setAuth0Token]: [any, any] = createSignal();
export const [mongoDBDBUser, setMongoDBDBUser]: [any, any] = createSignal();
export const [stripeCustomer, setStripeCustomer]: [any, any] = createSignal();

export const subscriptions = createMemo(() => {
	if (stripeCustomer) {
		if (
			stripeCustomer()?.subscriptions.find((s: any) => s.status === "active")
		) {
			return stripeCustomer()?.subscriptions[0];
		}
	} else {
		return [];
	}
});

export const allowFarmCreation = createMemo<boolean>(() => {
	if (mongoDBDBUser) {
		return (
			mongoDBDBUser()?.isAdmin ||
			(paymentPlan() === "farm" &&
				mongoDBDBUser() &&
				mongoDBDBUser().parcels?.length < 1) ||
			(paymentPlan() === "advisor" &&
				mongoDBDBUser() &&
				mongoDBDBUser().parcels?.length < 50)
		);
	}

	return false;
});

export const currentSubscription = createMemo(() => {
	if (stripeCustomer) {
		return stripeCustomer()?.subscriptions.filter((s: any) => {
			return true;
		});
	}
});

export const ShowAfterAuth = (props: any) => {
	// const auth0: any = useAuth0();

	const locationSignal = useLocation();
	const pathname = createMemo(() => locationSignal.pathname);
	const navigate = useNavigate();

	onMount(async () => {
		// Get token cookie
		let auth0Token = document.cookie
			.split("; ")
			.find((row) => row.startsWith("auth0Token="));
		// Get value of cookie
		auth0Token = auth0Token?.split("=")[1];
		auth0Token = decodeURIComponent(decodeURIComponent(auth0Token ?? ""));

		if (auth0Token) {
			// Trim double quotes;
			setAuth0Token(auth0Token);

			// Get token cookie
			let auth0User = document.cookie
				.split("; ")
				.find((row) => row.startsWith("auth0User="));
			// Get value of cookie
			auth0User = auth0User?.split("=")[1];

			auth0User = decodeURIComponent(decodeURIComponent(auth0User ?? ""));

			auth0User = JSON.parse(auth0User ?? "{}");
			setAuth0User(auth0User);

			const mongodbuserResponse = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/myuser`,
				{ method: "get", ...apiFetchOptions() },
			);
			const responsejson = await mongodbuserResponse.json();

			setMongoDBDBUser(responsejson.user);

			const customerResponse = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/stripe/get_subscriptions`,
				{
					method: "POST",
					body: JSON.stringify({ user: responsejson.user }),
					...apiFetchOptions(),
				},
			);

			const customerData = await customerResponse.json();

			setStripeCustomer(customerData);
		}
	});

	createEffect(() => {
		if (
			stripeCustomer() &&
			stripeCustomer().subscriptions.length === 0 &&
			pathname() !== "/settings"
		) {
			navigate("/settings");
		}
	});

	// if (!(auth0.isAuthenticated() || isServer)) {
	// 	auth0.login();
	// }

	return (
		<Show
			when={auth0User()}
			fallback={
				<>
					{/* <NavBar />*/}
					<NewUser />
				</>
			}
		>
			<Show
				when={auth0User()?.email_verified}
				fallback={
					<>
						{/* <NavBar /> */}
						<br />
						<p>
							We've sent you a link to verify your email address. Click it and
							sign in again. <a href="/api/auth/logout">Log out</a>.
						</p>
					</>
				}
			>
				<Show
					when={mongoDBDBUser() && stripeCustomer()}
					fallback={<p>Connecting...</p>}
				>
					<NavBar />
					{props.children}
				</Show>
			</Show>
		</Show>
	);
};
