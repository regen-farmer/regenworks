import {
	currentSubscription,
	mongoDBDBUser,
	setMongoDBDBUser,
	subscriptions,
} from "~/auth/useAuth";
import { Button, Card } from "solid-bootstrap";
import { type Component, createEffect, createSignal, Show } from "solid-js";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import _ from "lodash";
import { action } from "@solidjs/router";
import { format, fromUnixTime } from "date-fns";
import { getDevProdStatus, StripeIds } from "~/util/paymentPlan";
import { Select } from "@kobalte/core/select";
import { countries } from "../util/countries";
import { signOut } from "@solid-mediakit/auth/client";
import { SessionProvider } from "~/auth/SessionProvider";
import "~/styling/paper.css";

interface StripePrice {
	currency_options: {
		dkk: {
			unit_amount: number;
			unit_amount_decimal: string;
		};
		gbp: {
			unit_amount: number;
			unit_amount_decimal: string;
		};
		usd: {
			unit_amount: number;
			unit_amount_decimal: string;
		};
		eur: {
			unit_amount: number;
			unit_amount_decimal: string;
		};
	};
}

const RouteViewAccount: Component = () => {
	const [currency, setCurrency] = createSignal<string>();
	const [prices, setPrices] = createSignal<{
		farmMonth: StripePrice;
		farm6Months: StripePrice;
		advisorMonth: StripePrice;
		advisor6Months: StripePrice;
	}>();

	createEffect(async () => {
		currentSubscription();

		// const ipdataResult = await fetch(
		// 	"https://geo.ipify.org/api/v2/country?apiKey=at_NNVBzRJyrUs0ZbdpNDDNPEJoFmnwq",
		// );
		// const ipdata = await ipdataResult.json();
		// const countryCode = ipdata.location.country;

		if (mongoDBDBUser().countryCode) {
			let currency: string;

			switch (mongoDBDBUser().countryCode) {
				case "DK":
					currency = "DKK";
					break;
				case "AT":
				//Austria
				case "BE":
				//Belgium
				case "HR":
				//Croatia
				case "CY":
				//Cyprus
				case "EE":
				//Estonia
				case "FI":
				//Finland
				case "FR":
				//France
				case "DE":
				//Germany
				case "GR":
				//Greece
				case "IE":
				//Ireland
				case "IT":
				//Italy
				case "LV":
				//Latvia
				case "LT":
				//Lithuania
				case "LU":
				//Luxembourg
				case "MT":
				//Malta
				case "NL":
				//the Netherlands
				case "PT":
				//Portugal
				case "SK":
				//Slovakia
				case "SI":
				//Slovenia
				case "ES": //Spain
					currency = "EUR";
					break;
				case "GB":
					currency = "GBP";
					break;
				// case "US":
				default:
					currency = "USD";
					break;
			}

			console.log("CC: ", mongoDBDBUser(), currency);

			const prices = await (
				await fetch(
					`${import.meta.env.VITE_BACKEND_URL}/stripe/get_prices`,
					apiFetchOptions(),
				)
			).json();

			console.log("prices", prices);

			setCurrency(currency);
			setPrices(prices);
		}
		// return { countryCode, currency, prices };
	});

	function formatProductId(productId: string) {
		switch (productId) {
			case "prod_NWwXNnohTfUG1d": // Dev
			case "prod_NWwk2Mifyen27e": // Prod
				return "Farm";
			case "prod_NWwalTyPADc6tF": // Dev
			case "prod_NWwmysZtzdvq2i": // Prod
				return "Advisor";
		}
	}

	function formatInterval(interval: number) {
		switch (interval) {
			case 1:
				return "monthly plan";
			case 6:
				return "6 months plan";
		}
	}

	function formatPrice(price: StripePrice) {
		return (
			_.get(
				price.currency_options,
				`${currency()?.toString().toLowerCase()!}.unit_amount`,
			)! / 100
		);
	}

	async function deleteSubscription(
		subscriptionId: string,
		cancel_at_period_end = true,
	) {
		console.log(subscriptionId, "cancel_at_period_end", cancel_at_period_end);
		await fetch(
			`${
				import.meta.env.VITE_BACKEND_URL
			}/stripe/cancel_subscription/${subscriptionId}/cancel_at_period_end/${cancel_at_period_end}`,
			{
				method: "PUT",
				body: JSON.stringify({
					cancel_at_period_end: cancel_at_period_end,
				}),
				...apiFetchOptions,
			},
		);

		document.location.reload();
	}

	async function resumeSubscription(subscriptionId: string) {
		console.log(subscriptionId);
		await fetch(
			`${
				import.meta.env.VITE_BACKEND_URL
			}/stripe/resume_subscription/${subscriptionId}`,
			{
				method: "PUT",
				...apiFetchOptions,
			},
		);

		document.location.reload();
	}

	const CreateSubscriptionForm = action(async (formData: FormData) => {
		const payload: any = {
			priceId: formData.get("priceId")?.toString()!,
			email: formData.get("email")?.toString()!,
			currency: formData.get("currency")?.toString()!,
			callbackUrl: `${import.meta.env.VITE_BASE_URL}/settings`,
			customer: mongoDBDBUser().stripeCustomerId,
		};

		const checkoutUrlRes = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/stripe/checkout_session`,
			{
				body: JSON.stringify(payload),
				method: "post",
				...apiFetchOptions(),
			},
		);

		const checkoutUrl = (await checkoutUrlRes.json()).checkoutUrl;

		location.href = checkoutUrl;
	});

	const [countryCode, setCountryCode] = createSignal<string>("");

	async function saveCountryCode() {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/users/${
				mongoDBDBUser()?._id
			}/countrycode`,
			{
				method: "PUT",
				body: JSON.stringify({
					countryCode: countryCode(),
				}),
				...apiFetchOptions(),
			},
		);

		if (response.status === 200) {
			setMongoDBDBUser(await response.json());
		}
	}

	function dispayCountry(country: any) {
		return `${country[0]} (${country[1]})`;
	}

	return (
		<>
			<main class="paper">
				<div>
					<div class="container">
						<h3>Profile</h3>

						<p>Email: {mongoDBDBUser()?.email}</p>
						<Show when={mongoDBDBUser()?.countryCode}>
							<p>
								Country:{" "}
								{
									countries.find(
										(cc) => cc[1] === mongoDBDBUser().countryCode,
									)![0]
								}
							</p>
						</Show>
						<button
							class="btn btn-sm btn-dark"
							onClick={() => {
								signOut({ redirectTo: "/" });
							}}
						>
							Log out
						</button>

						<br />

						{/* <ButtonGroup aria-label='Basic example'>
            <Button variant='secondary'>1 Month</Button>
            <Button variant='secondary'>6 Months</Button>
          </ButtonGroup> */}

						<Show
							when={mongoDBDBUser().countryCode}
							fallback={
								<>
									<hr />
									<div>Which country is this account associated with?</div>
									<br />
									<Select.Root
										options={countries.map((cc) => cc[1])}
										placeholder="Select country"
										value={countryCode()}
										onChange={(val) => {
											setCountryCode(val);
										}}
										itemComponent={(props: any) => (
											<Select.Item item={props.item} class="select__item">
												<Select.ItemLabel>
													{dispayCountry(
														countries.find(
															(cc) => cc[1] === props.item.rawValue,
														),
													)}
												</Select.ItemLabel>

												<Select.ItemIndicator class="select__item-indicator">
													<i class="fas fa-check" />
												</Select.ItemIndicator>
											</Select.Item>
										)}
									>
										<Select.Trigger class="select__trigger" aria-label="Fruit">
											<Select.Value<string> class="select__value">
												{(state) => {
													return dispayCountry(
														countries.find(
															(cc) => cc[1] === state.selectedOption(),
														)!,
													);
												}}
											</Select.Value>
										</Select.Trigger>
										<Select.Portal>
											<Select.Content class="select__content">
												<Select.Listbox class="select__listbox" />
											</Select.Content>
										</Select.Portal>
									</Select.Root>
									<Button onClick={saveCountryCode}>Save</Button>
								</>
							}
						>
							<hr />
							<>
								<Show
									when={subscriptions() || (currency() && prices())}
									fallback={<div>Loading subscriptions and prices...</div>}
								>
									<Show when={subscriptions()}>
										<h3>Plan</h3>

										{subscriptions()?.legacy ? (
											<>
												{subscriptions().plan} - Expires{" "}
												{subscriptions().expirationDate}
											</>
										) : (
											<div>
												{formatProductId(subscriptions().plan.product)} -{" "}
												{formatInterval(subscriptions().plan.interval_count)}.{" "}
												<br />
												{!subscriptions().cancel_at_period_end ? (
													<span>
														Renewing{" "}
														{format(
															fromUnixTime(
																Number.parseInt(
																	subscriptions().current_period_end,
																	10,
																),
															),
															"PPP",
														)}
														{" - "}
														<span
															style={{
																"text-decoration": "underline",
																cursor: "pointer",
															}}
															onClick={() => {
																deleteSubscription(subscriptions().id);
															}}
														>
															Disable renewal
														</span>
														{" - "}
														<span
															style={{
																"text-decoration": "underline",
																cursor: "pointer",
															}}
															onClick={() => {
																deleteSubscription(subscriptions().id, false);
															}}
														>
															Cancel subscription immediately
														</span>
													</span>
												) : (
													<>
														<span>
															Expires{" "}
															{format(
																fromUnixTime(
																	Number.parseInt(
																		subscriptions().current_period_end,
																		10,
																	),
																),
																"PPP",
															)}{" "}
															-{" "}
															<span
																style={{
																	"text-decoration": "underline",
																	cursor: "pointer",
																}}
																onClick={() => {
																	resumeSubscription(subscriptions().id);
																}}
															>
																Resume subscription
															</span>
														</span>
													</>
												)}
											</div>
										)}
									</Show>

									<Show when={!subscriptions() && currency() && prices()}>
										<h3>Plans</h3>
										<div
											style={{
												display: "flex",
											}}
										>
											<Card
												style={{
													width: "18rem",
													border: "1px solid rgb(57 58 75)",
													"margin-right": "10px",
												}}
											>
												{/* <Card.Img variant='top' src='/images/banner-regular.png' /> */}
												<Card.Body>
													<Card.Title>Farm</Card.Title>
													<Card.Text>Manage a single farm</Card.Text>
													<form method="post" action={CreateSubscriptionForm}>
														<input
															type="hidden"
															name="priceId"
															value={
																StripeIds.farm.prices.month[getDevProdStatus()]
															}
														/>
														<input
															type="hidden"
															name="currency"
															value={currency()}
														/>
														<input
															type="hidden"
															name="email"
															value={mongoDBDBUser()?.email}
														/>
														<Button type="submit" variant="primary">
															1 Month - {formatPrice(prices().farmMonth!)}{" "}
															{currency()}
														</Button>
													</form>

													<form method="post" action={CreateSubscriptionForm}>
														<input
															type="hidden"
															name="priceId"
															value={
																StripeIds.farm.prices.sixmonths[
																	getDevProdStatus()
																]
															}
														/>
														<input
															type="hidden"
															name="email"
															value={mongoDBDBUser()?.email}
														/>
														<input
															type="hidden"
															name="currency"
															value={currency()}
														/>
														<Button type="submit" variant="primary">
															6 Months - {formatPrice(prices().farm6Months!)}{" "}
															{currency()}
														</Button>
													</form>
												</Card.Body>
											</Card>

											<Card
												style={{
													width: "18rem",
													border: "1px solid rgb(57 58 75)",
												}}
											>
												{/* <Card.Img variant='top' src='/images/banner-regular.png' /> */}
												<Card.Body>
													<Card.Title>Advisor</Card.Title>
													<Card.Text>Manage up to 10 farms</Card.Text>
													<form method="post" action={CreateSubscriptionForm}>
														<input
															type="hidden"
															name="priceId"
															value={
																StripeIds.advisor.prices.month[
																	getDevProdStatus()
																]
															}
														/>
														{/* price_1MhZWjKY1xVwmVYOokR9zJKn */}
														<input
															type="hidden"
															name="currency"
															value={currency()}
														/>
														<input
															type="hidden"
															name="email"
															value={mongoDBDBUser()?.email}
														/>
														<Button type="submit" variant="primary">
															1 Month - {formatPrice(prices().advisorMonth!)}{" "}
															{currency()}
														</Button>
													</form>

													<form method="post" action={CreateSubscriptionForm}>
														<input
															type="hidden"
															name="priceId"
															value={
																StripeIds.advisor.prices.sixmonths[
																	getDevProdStatus()
																]
															}
														/>
														<input
															type="hidden"
															name="currency"
															value={currency()}
														/>
														<input
															type="hidden"
															name="email"
															value={mongoDBDBUser()?.email}
														/>
														<Button type="submit" variant="primary">
															6 Months - {formatPrice(prices().advisor6Months!)}{" "}
															{currency()}
														</Button>
													</form>
												</Card.Body>
											</Card>
										</div>
									</Show>
								</Show>
							</>
						</Show>
					</div>
				</div>
			</main>
		</>
	);
};

export default function () {
	return (
		<SessionProvider>
			<RouteViewAccount />
		</SessionProvider>
	);
}
