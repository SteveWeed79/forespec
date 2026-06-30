import { stripe } from "./stripe";
import { db } from "./db";

// BAD: only create and cancel. No trial expiry, no failed-payment handling, no proration.
export async function subscribe(userId, plan) {
  const sub = await stripe.subscriptions.create({ customer: userId, items: [{ price: plan }] });
  await db.subscription.create({ userId, plan, status: "active" });
  return sub;
}

export async function cancel(userId) {
  await db.subscription.update(userId, { status: "canceled" }); // immediate; no period-end option
}
// A failed renewal silently leaves status "active" forever.
