import Stripe from "stripe";
import User from "../schemas/user.ts";

import { connect } from "mongoose";
function delay(time) {
	return new Promise((resolve) => setTimeout(resolve, time));
}

try {
	await connect(import.meta.env.DATABASEURL as string); // CONNECTS TO MLAB MONGODB

	const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, {
		apiVersion: "2024-06-20",
		maxNetworkRetries: 2,
	});

	const users = await User.find({});
	for (const user of users) {
		if (!user.stripeCustomerId && user.email) {
			await delay(10);

			const customers = await stripe.customers.list({
				limit: 1,
				email: user.email,
			});

			if (customers?.data[0]?.id) {
				user.stripeCustomerId = customers?.data[0]?.id;
				await user.save();
				console.log(
					"Want to update id for:",
					customers?.data[0]?.name,
					user.email,
				);
			}
		}
	}
} catch (error) {
	console.error("Error fetching users:", error);
}

console.log("DONE");
