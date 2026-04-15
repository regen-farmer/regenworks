import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  currentSubscriptions,
  getMongoDBUser,
  getStripeCustomer,
  handleSignOut,
  setMongoDBDBUser,
  setStripeCustomer,
  subscriptions,
} from "~/auth/useAuth.tsx";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

import { type Component, createEffect, createSignal, Show } from "solid-js";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { createFileRoute } from "@tanstack/solid-router";
import { format, fromUnixTime } from "date-fns";
import { getDevProdStatus, StripeIds } from "~/util/paymentPlan.ts";
import { countries } from "../util/countries.ts";
import Paper from "~/components/ui/paper.tsx";

async function updateStripeData() {
  const customerResponse = await fetch(
    `${import.meta.env.VITE_BACKEND_URL}/stripe/get_subscriptions`,
    {
      method: "POST",
      body: JSON.stringify({ user: getMongoDBUser() }),
      ...apiFetchOptions(),
    },
  );
  const customerData = await customerResponse.json();
  const stripeCustomer = JSON.stringify(customerData);
  localStorage.setItem("stripeCustomer", stripeCustomer);
  setStripeCustomer(JSON.parse(stripeCustomer));
}

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
  updateStripeData();

  const [currency, setCurrency] = createSignal<string>();
  const [prices, setPrices] = createSignal<{
    farmMonth: StripePrice;
    farm6Months: StripePrice;
    advisorMonth: StripePrice;
    advisor6Months: StripePrice;
  }>();

  createEffect(async () => {
    // currentSubscription();

    // const ipdataResult = await fetch(
    // 	"https://geo.ipify.org/api/v2/country?apiKey=at_NNVBzRJyrUs0ZbdpNDDNPEJoFmnwq",
    // );
    // const ipdata = await ipdataResult.json();
    // const countryCode = ipdata.location.country;

    if (getMongoDBUser().countryCode) {
      let currency: string;

      switch (getMongoDBUser().countryCode) {
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

      const prices = await (
        await fetch(`${import.meta.env.VITE_BACKEND_URL}/stripe/get_prices`, apiFetchOptions())
      ).json();

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
    const currStr = currency()?.toString().toLowerCase();
    const unitAmount = currStr ? (price.currency_options as any)[currStr]?.unit_amount : 0;
    return unitAmount / 100;
  }

  async function deleteSubscription(subscriptionId: string, cancel_at_period_end = true) {
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
    await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/stripe/resume_subscription/${subscriptionId}`,
      {
        method: "PUT",
        ...apiFetchOptions,
      },
    );

    document.location.reload();
  }

  async function handleCreateSubscription(e: SubmitEvent) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const payload: any = {
      priceId: formData.get("priceId")?.toString()!,
      email: formData.get("email")?.toString()!,
      currency: formData.get("currency")?.toString()!,
      callbackUrl: `${import.meta.env.VITE_BASE_URL}/settings`,
      customer: getMongoDBUser().stripeCustomerId,
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
  }

  const [countryCode, setCountryCode] = createSignal<string>("");

  async function saveCountryCode() {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/users/${getMongoDBUser()?._id}/countrycode`,
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
      <Paper>
        <h3 class="h3">Profile</h3>

        <p>Email: {getMongoDBUser()?.email}</p>
        <Show when={getMongoDBUser()?.countryCode}>
          <p>Country: {countries.find((cc) => cc[1] === getMongoDBUser().countryCode)![0]}</p>
        </Show>
        <button class="rounded-sm px-2 py-1 my-2 btn-md btn-default" onClick={handleSignOut}>
          Log out
        </button>

        <br />

        <Show
          when={getMongoDBUser().countryCode}
          fallback={
            <>
              <hr />
              <div>Which country is this account associated with?</div>
              <br />
              <Select
                value={countryCode()}
                onChange={(val) => {
                  if (val) {
                    setCountryCode(val);
                  }
                }}
                options={countries.map((cc) => cc[1])}
                placeholder="Select country"
                itemComponent={(props) => (
                  <SelectItem item={props.item}>
                    {props.item
                      ? dispayCountry(countries.find((cc) => cc[1] === props.item.rawValue))
                      : ""}
                  </SelectItem>
                )}
              >
                <SelectTrigger aria-label="Country" class="select__trigger">
                  <SelectValue<string>>
                    {(state) =>
                      state.selectedOption()
                        ? dispayCountry(countries.find((cc) => cc[1] === state.selectedOption()))
                        : ""
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent class="select__content" />
              </Select>
              <button class="rounded-sm p-1 my-2 btn-default" onClick={saveCountryCode}>
                Save
              </button>
            </>
          }
        >
          <hr class="my-4" />
          <>
            <Show when={getStripeCustomer()}>
              <Show
                when={subscriptions() || (currency() && prices())}
                fallback={<div>Loading subscriptions and prices...</div>}
              >
                <Show when={subscriptions()}>
                  <h3 class="h3">Plan</h3>

                  {subscriptions()?.legacy ? (
                    <>
                      {subscriptions().plan} - Expires {subscriptions().expirationDate}
                    </>
                  ) : (
                    <div>
                      {formatProductId(subscriptions().plan.product)} -{" "}
                      {formatInterval(subscriptions().plan.interval_count)}. <br />
                      {!subscriptions().cancel_at_period_end ? (
                        <span>
                          Renewing{" "}
                          {format(
                            fromUnixTime(Number.parseInt(subscriptions().current_period_end, 10)),
                            "PPP",
                          )}
                          {" - "}
                          <span
                            class="cursor-pointer underline-offset-2 underline"
                            onClick={async () => {
                              await deleteSubscription(subscriptions().id);
                              await updateStripeData();
                            }}
                          >
                            Disable renewal
                          </span>
                          {" - "}
                          <span
                            class="cursor-pointer underline-offset-2 underline "
                            onClick={async () => {
                              await deleteSubscription(subscriptions().id, false);
                              await updateStripeData();
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
                              fromUnixTime(Number.parseInt(subscriptions().current_period_end, 10)),
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
                  <h3 class="h3">Plans</h3>
                  <div
                    style={{
                      display: "flex",
                    }}
                  >
                    <Card class="dark:bg-zinc-900 bg-zinc-100 mr-4 dark:border-zinc-700 border-zinc-300 border-2">
                      {/* <Card.Img variant='top' src='/images/banner-regular.png' /> */}
                      <CardHeader>
                        <CardTitle>Farm</CardTitle>
                        <CardDescription>Manage a single farm</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleCreateSubscription}>
                          <input
                            type="hidden"
                            name="priceId"
                            value={StripeIds.farm.prices.month[getDevProdStatus()]}
                          />
                          <input type="hidden" name="currency" value={currency()} />
                          <input type="hidden" name="email" value={getMongoDBUser()?.email} />
                          <button class="rounded-sm p-1 my-2 btn-default" type="submit">
                            1 Month - {formatPrice(prices().farmMonth!)} {currency()}
                          </button>
                        </form>

                        <form onSubmit={handleCreateSubscription}>
                          <input
                            type="hidden"
                            name="priceId"
                            value={StripeIds.farm.prices.sixmonths[getDevProdStatus()]}
                          />
                          <input type="hidden" name="email" value={getMongoDBUser()?.email} />
                          <input type="hidden" name="currency" value={currency()} />
                          <button class="rounded-sm p-1 my-2 btn-default" type="submit">
                            6 Months - {formatPrice(prices().farm6Months!)} {currency()}
                          </button>
                        </form>
                      </CardContent>
                    </Card>

                    <Card class="dark:bg-zinc-900 bg-zinc-100 mr-4 dark:border-zinc-700 border-zinc-300 border-2">
                      {/* <Card.Img variant='top' src='/images/banner-regular.png' /> */}
                      <CardHeader>
                        <CardTitle>Advisor</CardTitle>
                        <CardDescription>Manage up to 10 farms</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleCreateSubscription}>
                          <input
                            type="hidden"
                            name="priceId"
                            value={StripeIds.advisor.prices.month[getDevProdStatus()]}
                          />
                          {/* price_1MhZWjKY1xVwmVYOokR9zJKn */}
                          <input type="hidden" name="currency" value={currency()} />
                          <input type="hidden" name="email" value={getMongoDBUser()?.email} />
                          <button class="rounded-sm p-1 my-2 btn-default" type="submit">
                            1 Month - {formatPrice(prices().advisorMonth!)} {currency()}
                          </button>
                        </form>

                        <form onSubmit={handleCreateSubscription}>
                          <input
                            type="hidden"
                            name="priceId"
                            value={StripeIds.advisor.prices.sixmonths[getDevProdStatus()]}
                          />
                          <input type="hidden" name="currency" value={currency()} />
                          <input type="hidden" name="email" value={getMongoDBUser()?.email} />
                          <button class="rounded-sm p-1 my-2 btn-default" type="submit">
                            6 Months - {formatPrice(prices().advisor6Months!)} {currency()}
                          </button>
                        </form>
                      </CardContent>
                    </Card>
                  </div>
                </Show>
              </Show>
            </Show>
          </>
        </Show>
      </Paper>
    </>
  );
};

export const Route = createFileRoute("/settings")({
  component: RouteViewAccount,
});
