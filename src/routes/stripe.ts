// eslint-disable-next-line import/no-extraneous-dependencies
import Stripe from 'stripe';
import express from 'express';
import { format, getUnixTime, parse } from 'date-fns';
import { UserDocument } from '../models/user';
import { Auth0IDToken } from '../app';

const router = express.Router();

export function getDevProdStatus(): 'DEV' | 'PROD' {
  const status = process.env.STATUS as 'DEV' | 'PROD';
  return status;
}

export const StripeIds = {
  farm: {
    product: {
      DEV: 'prod_NWwXNnohTfUG1d',
      PROD: 'prod_NWwk2Mifyen27e',
    },
    prices: {
      month: {
        DEV: 'price_1MlseKKY1xVwmVYOl4hMxnBB',
        PROD: 'price_1MlsrKKY1xVwmVYOzqYCzXix',
      },
      sixmonths: {
        DEV: 'price_1MlseKKY1xVwmVYOiaF5WDGx',
        PROD: 'price_1MlsrKKY1xVwmVYOuDIQSazK',
      },
    },
  },
  advisor: {
    product: {
      DEV: 'prod_NWwalTyPADc6tF',
      PROD: 'prod_NWwmysZtzdvq2i',
    },
    prices: {
      month: {
        DEV: 'price_1Mlsh3KY1xVwmVYOyWLcgjip',
        PROD: 'price_1MlstPKY1xVwmVYOvBjFSobc',
      },
      sixmonths: {
        DEV: 'price_1Mlsh3KY1xVwmVYOe5FlVbzv',
        PROD: 'price_1MlstPKY1xVwmVYO8tVD1RJm',
      },
    },
  },
};

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
    const farmMonth = await stripe.prices.retrieve(StripeIds.farm.prices.month[getDevProdStatus()], {
      expand: ['currency_options'],
    });

    const farm6Months = await stripe.prices.retrieve(StripeIds.farm.prices.sixmonths[getDevProdStatus()], {
      expand: ['currency_options'],
    });

    const advisorMonth = await stripe.prices.retrieve(StripeIds.advisor.prices.month[getDevProdStatus()], {
      expand: ['currency_options'],
    });

    const advisor6Months = await stripe.prices.retrieve(StripeIds.advisor.prices.sixmonths[getDevProdStatus()], {
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
    const legacyCustomers = [
      { plan: 'Farm', email: 'ruben@schevichoven.nl', expiration: '22/8/23' },
      { plan: 'Farm', email: 'guilherme.moreira@engenharia.ufjf.br', expiration: '3/7/23' },
      { plan: 'Advisor', email: 'sven@leaf-africa.com', expiration: '6/6/23' },
      { plan: 'Farm', email: 'george.sly@slyagri.com', expiration: '4/8/23' },
      { plan: 'Farm', email: '1mauriciosagastuy@gmail.com', expiration: '25/5/23' },
      { plan: 'Advisor', email: 'jeremef@g.clemson.edu', expiration: '8/5/23' },
      { plan: 'Advisor', email: 'triebwerk@relawi.org', expiration: '4/6/23' },
      { plan: 'Advisor', email: 'nielscorfield@gmail.com', expiration: '5/5/23' },
      { plan: 'Farm', email: 'jframos@regeneraconsultora.com', expiration: '7/6/23' },
      { plan: 'Farm', email: 'fsousa.eduardo@gmail.com', expiration: '13/6/23' },
      { plan: 'Advisor', email: 'training@trees.org', expiration: '3/7/23' },
      { plan: 'Farm', email: 'landeconomics@protonmail.com', expiration: '5/9/23' },
      { plan: 'Farm', email: 'anissa.lucero@gmail.com', expiration: '7/4/23' },
      { plan: 'Farm', email: 'archie@spainshallestate.co.uk', expiration: '21/6/23' },
      { plan: 'Advisor', email: 'kristoffer@regenfarmer.com', expiration: '1/1/50' },
      { plan: 'Advisor', email: 'sophie@regenfarmer.com', expiration: '1/1/50' },
      { plan: 'Advisor', email: 'hello@regenfarmer.com', expiration: '1/1/50' },
      { plan: 'Advisor', email: 'birk@regenfarmer.com', expiration: '1/1/50' },
    ];

    console.log('arrived');
    const payload = req.body;
    console.log('payload', payload);

    const customers = await stripe.customers.list({
      limit: 1,
      email: payload.email,
    });

    console.log('customers', customers.data);

    const customer = customers.data[0];

    if (!customer) {
      res.send(JSON.stringify({ error: 'No customer found' }));
    }

    const subscriptions = await stripe.subscriptions.list({
      limit: 10,
      customer: customer.id,
    });

    console.log('subscriptions', subscriptions.data);

    const legacyUser = legacyCustomers.find((customer) => customer.email === payload.email);
    let activeLegacySubscription;
    if (legacyUser) {
      const legacyUntil = parse(legacyUser.expiration, 'dd/MM/yy', new Date(Date.now()));

      // const legacyUntil = new Date(legacyUser.expiration, 'dd/MM/yy');
      // const today = Date.now();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (getUnixTime(legacyUntil) >= getUnixTime(yesterday)) {
        activeLegacySubscription = {
          expirationDate: format(legacyUntil, 'PPP'),
          plan: legacyUser.plan,
          legacy: true,
        };
      }
    }

    res.send(JSON.stringify({ customer: customers.data[0], subscriptions: subscriptions.data, activeLegacySubscription }));
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
