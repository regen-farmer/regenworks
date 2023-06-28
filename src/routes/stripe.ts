// eslint-disable-next-line import/no-extraneous-dependencies
import Stripe from 'stripe';
import express from 'express';
import { format, getUnixTime, parse } from 'date-fns';
import dotenv from 'dotenv';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken, Variables } from '../app.js';
/* eslint-disable import/first */

dotenv.config();

import { Hono } from "hono";

// import logger from '../middleware/logger';



export function getDevProdStatus(): 'DEV' | 'PROD' {
  const status = process.env.STRIPE_MODE as 'DEV' | 'PROD';
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
        PROD: 'price_1N0WOvKY1xVwmVYOubwlcAPn',
      },
      sixmonths: {
        DEV: 'price_1Mlsh3KY1xVwmVYOe5FlVbzv',
        PROD: 'price_1MlstPKY1xVwmVYO8tVD1RJm',
      },
    },
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2022-11-15',
  maxNetworkRetries: 2,
});

export default function indexRoutes(
  router: Hono<
    {
      Variables: Variables;
    },
    {},
    "/"
  >
) {

// NESTED SYSTEM SYSTEMFLOW NEW ROUTE
router.post(
  '/stripe/checkout_session',
  async (c) => {
    const {
      email, priceId, currency, callbackUrl, customer,
    } = (await c.req.json());
    // const { priceId, currency, email } = Object.fromEntries(formData.entries());

    const logdata = {
      // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
      price: priceId.valueOf().toString(),
      currency: currency.valueOf().toString(),
      email: email.valueOf().toString(),
      callbackUrl: callbackUrl.valueOf().toString(),
      customer: customer?.valueOf().toString(),
      // quantity: parseInt(quantity.valueOf().toString(), 10),
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
        customer: customer?.valueOf().toString(),
        mode: 'subscription',
        currency: currency.valueOf().toString(),
        customer_email: customer ? undefined : email.valueOf().toString(),
        customer_update: customer ? { name: 'auto' } : undefined,
        success_url: `${profilePage}?success=true`,
        cancel_url: `${profilePage}?canceled=true`,
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
      });
      console.log(session.url!);
      c.status(200)
      return c.text(JSON.stringify({ checkoutUrl: session.url! }));
    } catch (err: any) {
      console.log('here');
      c.status(err.statusCode || 500)
      return c.text(err.message);
    }
  },
);

router.get(
  '/stripe/get_prices',
  async (c) => {
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

    return c.json(
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
  async (c) => {
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
      { plan: 'Advisor', email: 'sophie@regenfarmer.com', expiration: '1/1/50' },
      { plan: 'Advisor', email: 'hello@regenfarmer.com', expiration: '1/1/50' },
      { plan: 'Advisor', email: 'birk@regenfarmer.com', expiration: '1/1/50' },
    ];

    console.log('arrived');
    const payload = (await c.req.json());
    console.log('payload', payload);

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

    const customers = await stripe.customers.list({
      limit: 1,
      email: payload.email,
    });

    const customer = customers.data[0];

    let returndata;
    if (customer?.id) {
      const subscriptions = await stripe.subscriptions.list({
        limit: 10,
        customer: customer.id,
      });

      

      returndata = { customer: customers.data[0], subscriptions: subscriptions.data, activeLegacySubscription };
    } else {
      returndata = { subscriptions: [], activeLegacySubscription };
    }

    console.log('returndata', returndata);
    return c.json(returndata);


  },
);

router.put(
  '/stripe/cancel_subscription/:subscriptionId',
  async (c) => {
    console.log('DELETE here');
    console.log('reqbody, ', c.req.param('subscriptionId'));
    const payload = (await c.req.json());
    console.log('payload', payload);

    if (c.req.param('subscriptionId')) {
      // await stripe.subscriptions.del(
      //   c.req.param('subscriptionId'),
      // );

      await stripe.subscriptions.update(
        c.req.param('subscriptionId'),
        { cancel_at_period_end: true },
      );
      return c.json(JSON.stringify({}));
    } else {
      c.status(400)
return c.json(JSON.stringify({ error: 'No subscriptionId found' }));
    }
  },
);

router.put(
  '/stripe/resume_subscription/:subscriptionId',
  async (c) => {
    console.log('DELETE here');
    console.log('reqbody, ', c.req.param('subscriptionId'));
    const payload = (await c.req.json());
    console.log('payload', payload);

    if (c.req.param('subscriptionId')) {
      // await stripe.subscriptions.del(
      //   c.req.param('subscriptionId'),
      // );

      await stripe.subscriptions.update(
        c.req.param('subscriptionId'),
        { cancel_at_period_end: false },
      );
      return c.json(JSON.stringify({}));
    } else {
      c.status(400)
return c.json(JSON.stringify({ error: 'No subscriptionId found' }));
    }
  },
);

}
