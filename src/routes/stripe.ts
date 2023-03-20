// eslint-disable-next-line import/no-extraneous-dependencies
import Stripe from 'stripe';
import express from 'express';
import { UserDocument } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();

const stripe = new Stripe('sk_test_v6DAwtVUgGPnYYOT8czuAFld', {
  apiVersion: '2022-11-15',
});

// NESTED SYSTEM SYSTEMFLOW NEW ROUTE
router.post(
  '/stripe/checkout_session',
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    const { email, priceId, currency } = req.body;
    // const { priceId, currency, email } = Object.fromEntries(formData.entries());

    const logdata = {
      // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
      price: priceId.valueOf().toString(),
      currency: currency.valueOf().toString(),
      email: email.valueOf().toString(),
      // quantity: parseInt(quantity.valueOf().toString(), 10),
    };
    console.log(logdata);

    try {
      // Create Checkout Sessions from body params.
      const profilePage = 'http://localhost:3000/profile';
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
            price: priceId.valueOf().toString(),
            quantity: 1,
          },
        ],
        mode: 'subscription',
        currency: currency.valueOf().toString(),
        customer_email: email.valueOf().toString(),
        success_url: `${profilePage}?success=true`,
        cancel_url: `${profilePage}?canceled=true`,
        tax_id_collection: { enabled: true },
      });
      console.log(session.url!);
      res.status(200).send(JSON.stringify({ checkoutUrl: session.url! }));
    } catch (err: any) {
      console.log('here');
      return res.status(err.statusCode || 500).send(err.message);
    }
  },
);

router.get(
  '/stripe/get_prices',
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    const farmMonth = await stripe.prices.retrieve('price_1MlseKKY1xVwmVYOl4hMxnBB', {
      expand: ['currency_options'],
    });

    const farm6Months = await stripe.prices.retrieve('price_1MlseKKY1xVwmVYOiaF5WDGx', {
      expand: ['currency_options'],
    });

    const advisorMonth = await stripe.prices.retrieve('price_1Mlsh3KY1xVwmVYOyWLcgjip', {
      expand: ['currency_options'],
    });

    const advisor6Months = await stripe.prices.retrieve('price_1Mlsh3KY1xVwmVYOe5FlVbzv', {
      expand: ['currency_options'],
    });

    console.log(advisor6Months);

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
  '/stripe/get_customer',
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    console.log('arrived');
    const payload = req.body;
    console.log('payload', payload);

    const customers = await stripe.customers.list({
      limit: 1,
      email: payload.email,
    });

    const customer = customers.data[0];

    if (!customer) {
      res.send(JSON.stringify({ error: 'No customer found' }));
    }

    const subscriptions = await stripe.subscriptions.list({
      limit: 10,
      customer: customer.id,
    });

    console.log('subscriptions', subscriptions.data);

    res.send(JSON.stringify({ customer: customers.data[0], subscriptions: subscriptions.data }));
  },
);

router.delete(
  '/stripe/cancel_subscription/:subscriptionId',
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    console.log('DELETE here');
    console.log('reqbody, ', req.params.subscriptionId);
    const payload = req.body;
    console.log('payload', payload);

    if (req.params.subscriptionId) {
      await stripe.subscriptions.del(
        req.params.subscriptionId,
      );
      res.send(JSON.stringify({}));
    } else {
      res.status(400).send(JSON.stringify({ error: 'No subscriptionId found' }));
    }
  },
);

export default router;
