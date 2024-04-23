import { stripeCustomer } from "~/auth/useAuth";

export function getDevProdStatus(): "DEV" | "PROD" {
	const status = import.meta.env.VITE_STRIPE_MODE as "DEV" | "PROD";
	return status;
}

export const StripeIds = {
	farm: {
		product: {
			DEV: "prod_NWwXNnohTfUG1d",
			PROD: "prod_NWwk2Mifyen27e",
		},
		prices: {
			month: {
				DEV: "price_1MlseKKY1xVwmVYOl4hMxnBB",
				PROD: "price_1MlsrKKY1xVwmVYOzqYCzXix",
			},
			sixmonths: {
				DEV: "price_1MlseKKY1xVwmVYOiaF5WDGx",
				PROD: "price_1MlsrKKY1xVwmVYOuDIQSazK",
			},
		},
	},
	advisor: {
		product: {
			DEV: "prod_NWwalTyPADc6tF",
			PROD: "prod_NWwmysZtzdvq2i",
		},
		prices: {
			month: {
				DEV: "price_1Mlsh3KY1xVwmVYOyWLcgjip",
				PROD: "price_1N0WOvKY1xVwmVYOubwlcAPn",
			},
			sixmonths: {
				DEV: "price_1Mlsh3KY1xVwmVYOe5FlVbzv",
				PROD: "price_1MlstPKY1xVwmVYO8tVD1RJm",
			},
		},
	},
};

export function paymentPlan(): "farm" | "advisor" | undefined {
	let plan: "farm" | "advisor" | undefined;

	if (stripeCustomer()?.subscriptions.length > 0) {
		const product =
			stripeCustomer()?.subscriptions[0].items.data[0].plan.product;

		switch (product) {
			case StripeIds.farm.product[getDevProdStatus()]:
				plan = "farm";
				break;
			case StripeIds.advisor.product[getDevProdStatus()]:
				plan = "advisor";
				break;
		}
	}

	return plan;
}
