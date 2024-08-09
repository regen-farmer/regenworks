// eslint-disable-next-line import/no-extraneous-dependencies
import Stripe from "stripe";
import express from "express";
import { format, getUnixTime, parse } from "date-fns";
import dotenv from "dotenv";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import type { Auth0IDToken } from "../app.ts";
/* eslint-disable import/first */

dotenv.config();

const router = express.Router();

export function getDevProdStatus(): "DEV" | "PROD" {
	const status = process.env.STRIPE_MODE as "DEV" | "PROD";
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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: "2024-06-20",
	maxNetworkRetries: 2,
});

// router.put(
//   '/stripe/stripe_sid',
//   async (
//     req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
//     res: express.Response,
//   ) => {

//     // Get stripe session id
//     const stripeSessionID = req.body.stripe_sid;

//     // Get stripe session
//     const session = await stripe.checkout.sessions.retrieve(stripeSessionID);

//     // Get stripe customer
//     const customer = session.customer;

//     // Set stripe customer on mongodb user
//     req.user.stripe_customer = customer;
//   }
// )

// NESTED SYSTEM SYSTEMFLOW NEW ROUTE
router.post(
	"/stripe/checkout_session",
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		const { email, priceId, currency, callbackUrl, customer } = req.body;
		// const { priceId, currency, email } = Object.fromEntries(formData.entries());

		const logdata = {
			// Provide the exact Price ID (for example, pr_1234) of the product you want to sell
			price: priceId.valueOf().toString(),
			currency: currency.valueOf().toString(),
			email: email.valueOf().toString(),
			callbackUrl: callbackUrl.valueOf().toString(),
			customer: customer?.valueOf().toString(),
			// quantity: Number.parseInt(quantity.valueOf().toString(), 10),
		};
		console.log(logdata);

		try {
			// Create Checkout Sessions from body params.
			const profilePage = callbackUrl.valueOf().toString();
			const session = await stripe.checkout.sessions.create({
				line_items: [
					{
						// Provide the exact Price ID (for example, pr_1234) of the product you want to sell
						price: priceId.valueOf().toString(),
						quantity: 1,
					},
				],
				allow_promotion_codes: true,
				payment_method_collection: "if_required",
				customer: customer?.valueOf().toString(),
				mode: "subscription",
				currency: currency.valueOf().toString(),
				customer_email: customer ? undefined : email.valueOf().toString(),
				customer_update: customer ? { name: "auto" } : undefined,
				success_url: `${profilePage}?success=true&stripe_sid={CHECKOUT_SESSION_ID}`,
				cancel_url: `${profilePage}?canceled=true`,
				automatic_tax: { enabled: true },
				tax_id_collection: { enabled: true },
			});
			console.log(session.url!);
			res.status(200).send(JSON.stringify({ checkoutUrl: session.url! }));
		} catch (err: any) {
			console.log("here");
			return res.status(err.statusCode || 500).send(err.message);
		}
	},
);

router.get(
	"/stripe/get_prices",
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		const farmMonth = await stripe.prices.retrieve(
			StripeIds.farm.prices.month[getDevProdStatus()],
			{
				expand: ["currency_options"],
			},
		);

		const farm6Months = await stripe.prices.retrieve(
			StripeIds.farm.prices.sixmonths[getDevProdStatus()],
			{
				expand: ["currency_options"],
			},
		);

		const advisorMonth = await stripe.prices.retrieve(
			StripeIds.advisor.prices.month[getDevProdStatus()],
			{
				expand: ["currency_options"],
			},
		);

		const advisor6Months = await stripe.prices.retrieve(
			StripeIds.advisor.prices.sixmonths[getDevProdStatus()],
			{
				expand: ["currency_options"],
			},
		);

		// console.log(advisor6Months);

		res.send(
			JSON.stringify({
				farmMonth,
				farm6Months,
				advisorMonth,
				advisor6Months,
			}),
		);
	},
);

router.post(
	"/stripe/get_subscriptions",
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		const payload = req.body;
		if (req.user.stripeCustomerId) {
			const subscriptions = await stripe.subscriptions.list({
				limit: 10,
				customer: payload.user.stripeCustomerId,
			});

			res.send(JSON.stringify({ subscriptions: subscriptions.data }));
		} else {
			const customers = await stripe.customers.list({
				limit: 1,
				email: payload.user.email,
			});

			const customer = customers.data[0];

			if (customer?.id) {
				req.user.stripeCustomerId = customer.id;
				await req.user.save();

				const subscriptions = await stripe.subscriptions.list({
					limit: 10,
					customer: customer.id,
				});

				res.send(JSON.stringify({ subscriptions: subscriptions.data }));
			} else {
				res.send(JSON.stringify({ subscriptions: [] }));
			}
		}
	},
);

router.put(
	"/stripe/cancel_subscription/:subscriptionId/cancel_at_period_end/:cancelAtPeriodEnd",
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		if (req.params.subscriptionId) {
			if (req.params.cancelAtPeriodEnd === "false") {
				await stripe.subscriptions.cancel(req.params.subscriptionId);
			} else {
				await stripe.subscriptions.update(req.params.subscriptionId, {
					cancel_at_period_end: true,
				});
			}

			res.send(JSON.stringify({}));
		} else {
			res
				.status(400)
				.send(JSON.stringify({ error: "No subscriptionId found" }));
		}
	},
);

router.put(
	"/stripe/resume_subscription/:subscriptionId",
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		console.log("DELETE here");
		console.log("reqbody, ", req.params.subscriptionId);
		const payload = req.body;
		console.log("payload", payload);

		if (req.params.subscriptionId) {
			// await stripe.subscriptions.del(
			//   req.params.subscriptionId,
			// );

			await stripe.subscriptions.update(req.params.subscriptionId, {
				cancel_at_period_end: false,
			});
			res.send(JSON.stringify({}));
		} else {
			res
				.status(400)
				.send(JSON.stringify({ error: "No subscriptionId found" }));
		}
	},
);

export default router;
