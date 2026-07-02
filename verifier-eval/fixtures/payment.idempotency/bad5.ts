import { stripe } from "./stripe";
import { db } from "./db";
import { fulfill } from "./fulfillment";

// BAD: no idempotency key on creation, and the webhook re-processes every
// delivery. A retried checkout double-charges; a re-delivered webhook fulfills
// the same order twice.
export async function charge(orderId: string, amount: number) {
  return stripe.paymentIntents.create({ amount, currency: "usd", metadata: { orderId } });
}

export async function onWebhook(event) {
  if (event.type === "payment_intent.succeeded") {
    const orderId = event.data.object.metadata.orderId;
    await db.order.update(orderId, { status: "paid" });
    await fulfill(orderId);
  }
}
