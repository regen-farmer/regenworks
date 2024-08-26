import {
	createEffect,
	createMemo,
	createSignal,
	onMount,
	Show,
} from "solid-js";
// import { isServer } from "solid-js/web";
import { useLocation, useNavigate } from "@solidjs/router";
import NewUser from "~/auth/signup.tsx";
// import { useAuth0 } from ".";
import { NavBar } from "~/components/NavBar.tsx";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { paymentPlan } from "~/util/paymentPlan.ts";
import { signOut } from "@solid-mediakit/auth/client";

export const [getAuth0User, setAuth0User]: [any, any] = createSignal();
export const [getAuth0Token, setAuth0Token]: [any, any] = createSignal();
export const [getMongoDBUser, setMongoDBDBUser]: [any, any] = createSignal();
export const [getStripeCustomer, setStripeCustomer]: [any, any] =
	createSignal();

export const subscriptions = createMemo(() => {
	if (getStripeCustomer()?.subscriptions) {
		if (
			getStripeCustomer()?.subscriptions.find((s: any) => s.status === "active")
		) {
			return getStripeCustomer()?.subscriptions[0];
		}
	} else {
		return [];
	}
});

export const allowFarmCreation = createMemo<boolean>(() => {
	if (getMongoDBUser) {
		return (
			getMongoDBUser()?.isAdmin ||
			(paymentPlan() === "farm" &&
				getMongoDBUser() &&
				getMongoDBUser().parcels?.length < 1) ||
			(paymentPlan() === "advisor" &&
				getMongoDBUser() &&
				getMongoDBUser().parcels?.length < 50)
		);
	}

	return false;
});

export const currentSubscription = createMemo(() => {
	if (getStripeCustomer()?.subscriptions) {
		return getStripeCustomer()?.subscriptions.filter((s: any) => {
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

			// Get MongoDB user from localStorage
			let mongodbUser = localStorage.getItem("mongodbUser");
			if (!mongodbUser) {
				const mongodbuserResponse = await fetch(
					`${import.meta.env.VITE_BACKEND_URL}/myuser`,
					{ method: "get", ...apiFetchOptions() },
				);
				const responsejson = await mongodbuserResponse.json();
				mongodbUser = JSON.stringify(responsejson.user);
				localStorage.setItem("mongodbUser", mongodbUser);
			}

			setMongoDBDBUser(JSON.parse(mongodbUser));

			// Get Stripe customer from localStorage
			let stripeCustomer = localStorage.getItem("stripeCustomer");
			if (!stripeCustomer) {
				const customerResponse = await fetch(
					`${import.meta.env.VITE_BACKEND_URL}/stripe/get_subscriptions`,
					{
						method: "POST",
						body: JSON.stringify({ user: mongodbUser }),
						...apiFetchOptions(),
					},
				);
				const customerData = await customerResponse.json();
				stripeCustomer = JSON.stringify(customerData);
				localStorage.setItem("stripeCustomer", stripeCustomer);
			}

			setStripeCustomer(JSON.parse(stripeCustomer));

			if (pathname() !== "/settings") {
				if (getStripeCustomer()) {
					if (getStripeCustomer()?.subscriptions?.length === 0) {
						navigate("/settings");
					}
				}
			}
		}
	});

	// createEffect(() => {

	// 	console.log("Im here checking", getStripeCustomer()?.subscriptions)
	// 	if (
	// 		getStripeCustomer() &&
	// 		getStripeCustomer()?.subscriptions?.length === 0 &&
	// 		pathname() !== "/settings"
	// 	) {
	// 		navigate("/settings");
	// 	}
	// });

	// if (!(auth0.isAuthenticated() || isServer)) {
	// 	auth0.login();
	// }

	return (
		<Show
			when={getAuth0User()}
			fallback={
				<>
					{/* <NavBar />*/}
					<NewUser />
				</>
			}
		>
			<Show
				when={getAuth0User()?.email_verified}
				fallback={
					<>
						{/* <NavBar /> */}
						<br />
						<p>
							We've sent you a link to verify your email address. Click it and
							sign in again.
						</p>
						<button
							class="rounded-sm p-1 my-1 btn-sm btn-default"
							onClick={() => {
								localStorage.removeItem("mongodbUser");
								localStorage.removeItem("stripeCustomer");
								signOut({ redirectTo: "/" });
							}}
						>
							Log out
						</button>
					</>
				}
			>
				<Show when={getMongoDBUser()} fallback={<p>Connecting...</p>}>
					<NavBar />
					{props.children}
				</Show>
			</Show>
		</Show>
	);
};
